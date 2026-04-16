import { FreshnessMetadata, SourceRef } from '../types/index.js';

/**
 * Builds the standard freshness metadata block that every tool response must include.
 */
export function buildFreshnessMetadata(options: {
  as_of?: Date;
  comparison_period: string;
  source_refs: SourceRef[];
  confidence: number;
  known_unknowns: string;
  sources_summary: string;
}): FreshnessMetadata {
  const as_of = options.as_of ?? new Date();
  return {
    as_of: as_of.toISOString(),
    comparison_period: options.comparison_period,
    source_refs: options.source_refs,
    confidence: options.confidence,
    known_unknowns: options.known_unknowns,
    data_freshness: `Source: ${options.sources_summary} — as of ${as_of.toISOString()}`,
  };
}

/**
 * Formats a data age string, e.g. "DOT T-100 Q3 2025 (published Jan 2026) + Press Releases through Apr 2026"
 */
export function formatDataFreshness(
  sourceVintage: Date | null,
  label: string
): string {
  if (!sourceVintage) return `${label} (vintage unknown)`;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  const vintage = sourceVintage.toLocaleDateString('en-US', opts);
  return `${label} (published ${vintage})`;
}

/**
 * Returns a period label like "2025-Q3" from a Date.
 */
export function dateToPeriodLabel(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

/**
 * Returns a comparison string like "2025-Q3 vs 2025-Q2".
 */
export function buildComparisonPeriod(current: string, prior: string): string {
  return `${current} vs ${prior}`;
}
