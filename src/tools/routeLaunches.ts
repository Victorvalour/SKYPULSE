import { z } from 'zod';
import { getRouteChanges } from '../db/queries.js';
import { getOrSet, buildCacheKey } from '../cache/redis.js';
import { buildFreshnessMetadata } from '../utils/freshness.js';
import {
  NewRouteLaunchesInput,
  NewRouteLaunchesResult,
  NewRouteEntry,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export const NewRouteLaunchesSchema = z.object({
  airport: z
    .string()
    .min(3)
    .max(3)
    .describe('IATA airport code to query (origin or destination)'),
  period: z
    .string()
    .optional()
    .describe('Period filter, e.g. "2025-Q3". Returns all recent periods if omitted.'),
});

export type NewRouteLaunchesSchemaType = z.infer<typeof NewRouteLaunchesSchema>;

const DEFAULT_TTL = 3600;

export async function newRouteLaunches(
  input: NewRouteLaunchesInput
): Promise<NewRouteLaunchesResult> {
  const airport = input.airport.toUpperCase();
  const period = input.period;

  const cacheKey = buildCacheKey('new_route_launches', {
    airport,
    period: period ?? '',
  });

  return getOrSet(cacheKey, DEFAULT_TTL, async () => {
    logger.info('Executing new_route_launches', { airport, period });

    const changes = await getRouteChanges({
      market: airport,
      change_types: ['launch', 'resumption'],
      period,
      limit: 100,
      order_by: 'as_of',
      order_dir: 'DESC',
    });

    const routes: NewRouteEntry[] = changes.map((c) => ({
      carrier: c.carrier,
      origin: c.origin,
      destination: c.destination,
      change_type: c.change_type as 'launch' | 'resumption',
      comparison_period: c.comparison_period,
      current_frequency: c.current_frequency,
      current_inferred_seats: c.current_inferred_seats,
      effective_date: c.as_of.toISOString(),
      confidence: parseFloat(String(c.confidence)),
      source_refs: c.source_refs,
    }));

    const allSources = routes.flatMap((r) => r.source_refs);
    const avgConfidence =
      routes.length > 0
        ? routes.reduce((sum, r) => sum + r.confidence, 0) / routes.length
        : 0;

    const periods = [...new Set(changes.map((c) => c.comparison_period))];
    const comparisonPeriod = periods.join(', ') || 'N/A';

    const freshness = buildFreshnessMetadata({
      comparison_period: comparisonPeriod,
      source_refs: allSources.slice(0, 10),
      confidence: Math.round(avgConfidence * 100) / 100,
      known_unknowns:
        routes.length === 0
          ? 'No launches or resumptions found for this airport'
          : 'Launch dates derived from T-100 reporting periods (3-6 month lag)',
      sources_summary:
        'DOT T-100 (3-6 month lag) + Press Releases through ' +
        new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });

    return {
      airport,
      period: period ?? 'all',
      routes,
      ...freshness,
    };
  });
}
