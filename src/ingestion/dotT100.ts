import * as https from 'https';
import * as http from 'http';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { NormalizedT100Row, T100Row } from '../types/index';
import { normalizeCarrierCode } from '../normalization/carrierCodes';
import { normalizeIata } from '../normalization/airportCodes';
import { normalizeAircraftCode, inferSeats } from '../normalization/aircraftTypes';
import { upsertRouteSnapshot } from '../db/queries';
import { invalidatePattern } from '../cache/redis';
import { logger } from '../utils/logger';
import { dateToPeriodLabel } from '../utils/freshness';

/**
 * BTS T-100 segment data download URL template.
 * The BTS provides downloadable CSV files via their data library.
 * Actual ingestion requires navigating the BTS RITA portal or using
 * the transtats.bts.gov download API.
 *
 * For automated ingestion we use the publicly accessible transtats URL:
 * https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FHK&QO_fu146_anzr=b0-gvzr
 *
 * NOTE: T-100 data lags 3-6 months.  source_vintage is set to the first
 * day of the reported month, not the download date.
 */
const BTS_BASE_URL = 'https://www.transtats.bts.gov';

/**
 * Fetch and parse a CSV from a URL, returning an array of row objects.
 */
async function fetchCsv(url: string): Promise<T100Row[]> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} fetching ${url}`));
        return;
      }
      const rows: T100Row[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      parser.on('readable', () => {
        let record: T100Row;
        while ((record = parser.read() as T100Row) !== null) {
          rows.push(record);
        }
      });
      parser.on('error', reject);
      parser.on('end', () => resolve(rows));
      res.pipe(parser);
    });
    req.on('error', reject);
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Parse a CSV string directly (used when file is already downloaded).
 */
export async function parseCsvString(csvContent: string): Promise<T100Row[]> {
  return new Promise((resolve, reject) => {
    const rows: T100Row[] = [];
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    parser.on('readable', () => {
      let record: T100Row;
      while ((record = parser.read() as T100Row) !== null) {
        rows.push(record);
      }
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(rows));
    Readable.from([csvContent]).pipe(parser);
  });
}

/**
 * Normalize a raw T100Row into a typed, cleaned NormalizedT100Row.
 */
export function normalizeT100Row(raw: T100Row): NormalizedT100Row | null {
  const carrier = normalizeCarrierCode(raw.CARRIER ?? '');
  const origin = normalizeIata(raw.ORIGIN ?? '');
  const dest = normalizeIata(raw.DEST ?? '');

  if (!origin || !dest) return null;

  const year = parseInt(raw.YEAR, 10);
  const month = parseInt(raw.MONTH, 10);
  if (isNaN(year) || isNaN(month)) return null;

  const aircraft = normalizeAircraftCode(raw.AIRCRAFT_TYPE ?? 'UNK');
  const depsPerformed = parseInt(raw.DEPARTURES_PERFORMED, 10) || 0;
  const seats = parseInt(raw.SEATS, 10) || inferSeats(aircraft) * depsPerformed;

  const periodDate = new Date(year, month - 1, 1);
  const period = dateToPeriodLabel(periodDate);

  return {
    carrier,
    origin,
    destination: dest,
    aircraft_type: aircraft,
    departures_scheduled: parseInt(raw.DEPARTURES_SCHEDULED, 10) || 0,
    departures_performed: depsPerformed,
    seats,
    passengers: parseInt(raw.PASSENGERS, 10) || 0,
    freight: parseFloat(raw.FREIGHT) || 0,
    distance: parseFloat(raw.DISTANCE) || 0,
    month,
    year,
    period,
  };
}

/**
 * Ingest an array of raw T100 rows into the database.
 * Groups rows by route+carrier+period and aggregates.
 */
export async function ingestT100Rows(
  rows: T100Row[],
  sourceVintage: Date
): Promise<{ ingested: number; skipped: number }> {
  // Aggregate by route+carrier+period+aircraft
  type AggKey = string;
  const agg = new Map<
    AggKey,
    {
      carrier: string;
      origin: string;
      destination: string;
      period: string;
      frequency: number;
      seats: number;
      aircraftMix: Record<string, number>;
    }
  >();

  let skipped = 0;
  for (const raw of rows) {
    const norm = normalizeT100Row(raw);
    if (!norm) {
      skipped++;
      continue;
    }
    const key = `${norm.origin}:${norm.destination}:${norm.carrier}:${norm.period}`;
    const existing = agg.get(key) ?? {
      carrier: norm.carrier,
      origin: norm.origin,
      destination: norm.destination,
      period: norm.period,
      frequency: 0,
      seats: 0,
      aircraftMix: {},
    };
    existing.frequency += norm.departures_performed;
    existing.seats += norm.seats;
    existing.aircraftMix[norm.aircraft_type] =
      (existing.aircraftMix[norm.aircraft_type] ?? 0) + norm.departures_performed;
    agg.set(key, existing);
  }

  let ingested = 0;
  for (const snap of agg.values()) {
    try {
      await upsertRouteSnapshot({
        origin: snap.origin,
        destination: snap.destination,
        carrier: snap.carrier,
        period: snap.period,
        period_type: 'quarterly',
        frequency: snap.frequency,
        inferred_seats: snap.seats,
        aircraft_type_mix: snap.aircraftMix,
        source: 'dot_t100',
        source_vintage: sourceVintage,
      });
      ingested++;
    } catch (err) {
      logger.warn('Failed to upsert snapshot', {
        route: `${snap.origin}-${snap.destination}`,
        carrier: snap.carrier,
        error: String(err),
      });
      skipped++;
    }
  }

  // Invalidate all cached query results
  await invalidatePattern('skypulse:*').catch(() => undefined);

  logger.info('T-100 ingestion complete', { ingested, skipped });
  return { ingested, skipped };
}

/**
 * Main entry point: fetch T-100 data for a given year/month from BTS
 * and ingest into the database.
 *
 * NOTE: BTS does not provide a simple public REST API for this.
 * In production, download the CSV from the BTS data library and pass
 * the file path to ingestT100File(), or configure a BTS account.
 */
export async function ingestT100ForPeriod(
  year: number,
  month: number
): Promise<void> {
  logger.info(`Starting T-100 ingestion for ${year}-${String(month).padStart(2, '0')}`);

  // The BTS URL format for T-100 segment data (international + domestic)
  // This uses the standard BTS download URL pattern
  const url = `${BTS_BASE_URL}/api/1/datafields/T_T100_SEGMENT_US_CARRIER_ONLY?year=${year}&month=${month}&format=csv`;

  try {
    logger.info(`Fetching T-100 data from BTS`, { url });
    const rows = await fetchCsv(url);
    const sourceVintage = new Date(year, month - 1, 1);
    const { ingested, skipped } = await ingestT100Rows(rows, sourceVintage);
    logger.info('T-100 ingestion complete', { year, month, ingested, skipped });
  } catch (err) {
    logger.error('T-100 ingestion failed', { year, month, error: String(err) });
    throw err;
  }
}

// Run as standalone script
if (require.main === module) {
  const now = new Date();
  // Ingest 3 months ago (T-100 lags 3-6 months)
  const targetDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  ingestT100ForPeriod(targetDate.getFullYear(), targetDate.getMonth() + 1)
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Fatal error', { error: String(err) });
      process.exit(1);
    });
}
