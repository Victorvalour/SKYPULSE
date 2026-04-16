import { z } from 'zod';
import { getCarrierCapacityAggregates } from '../db/queries';
import { getOrSet, buildCacheKey } from '../cache/redis';
import { buildFreshnessMetadata } from '../utils/freshness';
import {
  CarrierCapacityRankingInput,
  CarrierCapacityRankingResult,
  CarrierRankEntry,
} from '../types/index';
import { logger } from '../utils/logger';

export const CarrierCapacityRankingSchema = z.object({
  market: z
    .string()
    .min(3)
    .max(3)
    .describe('IATA airport code defining the market (origin or destination)'),
  aircraft_category: z
    .enum(['narrowbody', 'widebody', 'regional_jet', 'turboprop', 'other'])
    .optional()
    .describe('Filter by aircraft category'),
  period: z
    .string()
    .optional()
    .describe('Period filter, e.g. "2025-Q3". Returns all recent periods if omitted.'),
});

export type CarrierCapacityRankingSchemaType = z.infer<typeof CarrierCapacityRankingSchema>;

const LEADERBOARD_TTL = 6 * 3600; // 6 hours

export async function carrierCapacityRanking(
  input: CarrierCapacityRankingInput
): Promise<CarrierCapacityRankingResult> {
  const market = input.market.toUpperCase();
  const aircraftCategory = input.aircraft_category;
  const period = input.period;

  const cacheKey = buildCacheKey('carrier_capacity_ranking', {
    market,
    aircraft_category: aircraftCategory ?? '',
    period: period ?? '',
  });

  return getOrSet(cacheKey, LEADERBOARD_TTL, async () => {
    logger.info('Executing carrier_capacity_ranking', {
      market,
      aircraftCategory,
      period,
    });

    const aggregates = await getCarrierCapacityAggregates({
      market,
      aircraft_category: aircraftCategory,
      period,
      limit: 50,
    });

    const ranking: CarrierRankEntry[] = aggregates.map((agg, index) => ({
      rank: index + 1,
      carrier: agg.carrier,
      total_capacity_change_abs: Number(agg.total_capacity_change_abs),
      total_capacity_change_pct: Number(agg.total_capacity_change_pct),
      total_current_seats: Number(agg.total_current_seats),
      total_prior_seats: Number(agg.total_prior_seats),
      routes_gained: Number(agg.routes_gained),
      routes_lost: Number(agg.routes_lost),
      routes_unchanged: Number(agg.routes_unchanged),
    }));

    const freshness = buildFreshnessMetadata({
      comparison_period: period ?? 'all available periods',
      source_refs: [
        {
          source: 'DOT T-100',
          vintage: 'Q3 2025 (published Jan 2026)',
        },
      ],
      confidence: ranking.length > 0 ? 0.8 : 0,
      known_unknowns:
        ranking.length === 0
          ? 'No carrier capacity data found for this market'
          : 'Rankings aggregated from T-100 data (3-6 month lag). Codeshare allocation may not be reflected.',
      sources_summary:
        'DOT T-100 (3-6 month lag) + Press Releases through ' +
        new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });

    return {
      market,
      aircraft_category: aircraftCategory ?? null,
      period: period ?? null,
      ranking,
      ...freshness,
    };
  });
}
