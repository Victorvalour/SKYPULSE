import { RouteChange, RouteSnapshot } from '../types/index.js';
import { query } from './connection.js';

// ── Route snapshots ───────────────────────────────────────────────────────────

export async function upsertRouteSnapshot(
  snap: Omit<RouteSnapshot, 'id' | 'ingested_at'>
): Promise<void> {
  await query(
    `INSERT INTO route_snapshots
       (origin, destination, carrier, period, period_type, frequency,
        inferred_seats, aircraft_type_mix, source, source_vintage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (origin, destination, carrier, period, source)
     DO UPDATE SET
       frequency         = EXCLUDED.frequency,
       inferred_seats    = EXCLUDED.inferred_seats,
       aircraft_type_mix = EXCLUDED.aircraft_type_mix,
       source_vintage    = EXCLUDED.source_vintage,
       ingested_at       = NOW()`,
    [
      snap.origin,
      snap.destination,
      snap.carrier,
      snap.period,
      snap.period_type,
      snap.frequency,
      snap.inferred_seats ?? null,
      snap.aircraft_type_mix ? JSON.stringify(snap.aircraft_type_mix) : null,
      snap.source,
      snap.source_vintage ?? null,
    ]
  );
}

export async function getSnapshotsByRoute(
  origin: string,
  destination: string,
  carrier?: string
): Promise<RouteSnapshot[]> {
  const params: unknown[] = [origin, destination];
  let sql = `SELECT * FROM route_snapshots WHERE origin=$1 AND destination=$2`;
  if (carrier) {
    params.push(carrier);
    sql += ` AND carrier=$${params.length}`;
  }
  sql += ` ORDER BY period DESC`;
  return query<RouteSnapshot>(sql, params);
}

// ── Route changes ─────────────────────────────────────────────────────────────

export async function upsertRouteChange(
  change: Omit<RouteChange, 'id' | 'computed_at'>
): Promise<void> {
  await query(
    `INSERT INTO route_changes
       (origin, destination, carrier, comparison_period,
        prior_frequency, current_frequency, frequency_change_abs, frequency_change_pct,
        prior_inferred_seats, current_inferred_seats, capacity_change_abs, capacity_change_pct,
        aircraft_type_mix_prior, aircraft_type_mix_current,
        change_type, as_of, confidence, known_unknowns, source_refs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT DO NOTHING`,
    [
      change.origin,
      change.destination,
      change.carrier,
      change.comparison_period,
      change.prior_frequency ?? null,
      change.current_frequency ?? null,
      change.frequency_change_abs ?? null,
      change.frequency_change_pct ?? null,
      change.prior_inferred_seats ?? null,
      change.current_inferred_seats ?? null,
      change.capacity_change_abs ?? null,
      change.capacity_change_pct ?? null,
      change.aircraft_type_mix_prior
        ? JSON.stringify(change.aircraft_type_mix_prior)
        : null,
      change.aircraft_type_mix_current
        ? JSON.stringify(change.aircraft_type_mix_current)
        : null,
      change.change_type,
      change.as_of,
      change.confidence,
      change.known_unknowns ?? null,
      JSON.stringify(change.source_refs),
    ]
  );
}

export async function getRouteChanges(options: {
  origin?: string;
  destination?: string;
  carrier?: string;
  change_types?: string[];
  days_back?: number;
  market?: string;
  period?: string;
  limit?: number;
  order_by?: string;
  order_dir?: 'ASC' | 'DESC';
}): Promise<RouteChange[]> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (options.origin) {
    params.push(options.origin);
    conditions.push(`origin=$${params.length}`);
  }
  if (options.destination) {
    params.push(options.destination);
    conditions.push(`destination=$${params.length}`);
  }
  if (options.carrier) {
    params.push(options.carrier);
    conditions.push(`carrier=$${params.length}`);
  }
  if (options.change_types && options.change_types.length > 0) {
    params.push(options.change_types);
    conditions.push(`change_type = ANY($${params.length})`);
  }
  if (options.days_back) {
    params.push(options.days_back);
    conditions.push(`as_of >= NOW() - ($${params.length} || ' days')::INTERVAL`);
  }
  if (options.period) {
    params.push(`%${options.period}%`);
    conditions.push(`comparison_period ILIKE $${params.length}`);
  }
  if (options.market) {
    params.push(options.market);
    conditions.push(`(origin=$${params.length} OR destination=$${params.length})`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = options.order_by ?? 'as_of';
  const orderDir = options.order_dir ?? 'DESC';
  const limit = options.limit ?? 100;
  params.push(limit);

  const sql = `
    SELECT rc.*
    FROM route_changes rc
    ${where}
    ORDER BY ${orderBy} ${orderDir}
    LIMIT $${params.length}
  `;

  return query<RouteChange>(sql, params);
}

export async function getCarrierCapacityAggregates(options: {
  market: string;
  aircraft_category?: string;
  period?: string;
  limit?: number;
}): Promise<
  {
    carrier: string;
    total_capacity_change_abs: number;
    total_capacity_change_pct: number;
    total_current_seats: number;
    total_prior_seats: number;
    routes_gained: number;
    routes_lost: number;
    routes_unchanged: number;
  }[]
> {
  const params: unknown[] = [options.market];
  let joinAircraft = '';
  let aircraftCondition = '';

  if (options.aircraft_category) {
    params.push(options.aircraft_category);
    joinAircraft = `
      LEFT JOIN aircraft_types at2 ON at2.iata_type_code = (
        SELECT jsonb_object_keys(rc.aircraft_type_mix_current) LIMIT 1
      )
    `;
    aircraftCondition = `AND at2.category = $${params.length}`;
  }

  const periodCondition = options.period
    ? (() => {
        params.push(`%${options.period}%`);
        return `AND rc.comparison_period ILIKE $${params.length}`;
      })()
    : '';

  const limit = options.limit ?? 50;
  params.push(limit);

  const sql = `
    SELECT
      rc.carrier,
      COALESCE(SUM(rc.capacity_change_abs), 0)::INTEGER                     AS total_capacity_change_abs,
      COALESCE(AVG(rc.capacity_change_pct), 0)::NUMERIC(8,2)                AS total_capacity_change_pct,
      COALESCE(SUM(rc.current_inferred_seats), 0)::INTEGER                  AS total_current_seats,
      COALESCE(SUM(rc.prior_inferred_seats), 0)::INTEGER                    AS total_prior_seats,
      COUNT(*) FILTER (WHERE rc.change_type IN ('launch','resumption','growth','gauge_up'))::INTEGER AS routes_gained,
      COUNT(*) FILTER (WHERE rc.change_type IN ('suspension','reduction','gauge_down'))::INTEGER     AS routes_lost,
      COUNT(*) FILTER (WHERE rc.change_type NOT IN ('launch','resumption','growth','gauge_up','suspension','reduction','gauge_down'))::INTEGER AS routes_unchanged
    FROM route_changes rc
    ${joinAircraft}
    WHERE (rc.origin=$1 OR rc.destination=$1)
      ${aircraftCondition}
      ${periodCondition}
    GROUP BY rc.carrier
    ORDER BY total_capacity_change_abs DESC
    LIMIT $${params.length}
  `;

  return query(sql, params);
}
