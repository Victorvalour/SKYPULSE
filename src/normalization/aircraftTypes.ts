/**
 * Aircraft type normalization and seat inference.
 * Maps IATA aircraft type codes (and DOT BTS aircraft type codes) to
 * canonical IATA codes with typical seat counts.
 */

export interface AircraftSeatReference {
  iataCode: string;
  totalSeats: number;
  economySeats: number;
  category: 'narrowbody' | 'widebody' | 'regional_jet' | 'turboprop' | 'other';
}

/**
 * Master seat reference table.
 * Covers the most common aircraft types in US domestic and US-international
 * service.  All seat counts are "typical" for a standard 2-class configuration.
 */
export const SEAT_REFERENCE: Record<string, AircraftSeatReference> = {
  // ── Boeing 737 family ────────────────────────────────────────────────────────
  B737: { iataCode: 'B737', totalSeats: 149, economySeats: 128, category: 'narrowbody' },
  B738: { iataCode: 'B738', totalSeats: 189, economySeats: 162, category: 'narrowbody' },
  B739: { iataCode: 'B739', totalSeats: 189, economySeats: 165, category: 'narrowbody' },
  // Boeing 737 MAX family
  B38M: { iataCode: 'B38M', totalSeats: 178, economySeats: 162, category: 'narrowbody' },
  B39M: { iataCode: 'B39M', totalSeats: 193, economySeats: 165, category: 'narrowbody' },
  B3XM: { iataCode: 'B3XM', totalSeats: 204, economySeats: 188, category: 'narrowbody' },
  // aliases
  '737': { iataCode: 'B737', totalSeats: 149, economySeats: 128, category: 'narrowbody' },
  '738': { iataCode: 'B738', totalSeats: 189, economySeats: 162, category: 'narrowbody' },
  '73H': { iataCode: 'B738', totalSeats: 189, economySeats: 162, category: 'narrowbody' },
  '7M8': { iataCode: 'B38M', totalSeats: 178, economySeats: 162, category: 'narrowbody' },

  // ── Airbus A320 family ───────────────────────────────────────────────────────
  A319: { iataCode: 'A319', totalSeats: 144, economySeats: 128, category: 'narrowbody' },
  A320: { iataCode: 'A320', totalSeats: 180, economySeats: 150, category: 'narrowbody' },
  A321: { iataCode: 'A321', totalSeats: 220, economySeats: 185, category: 'narrowbody' },
  // A320neo family
  A19N: { iataCode: 'A19N', totalSeats: 144, economySeats: 128, category: 'narrowbody' },
  A20N: { iataCode: 'A20N', totalSeats: 180, economySeats: 150, category: 'narrowbody' },
  A21N: { iataCode: 'A21N', totalSeats: 220, economySeats: 182, category: 'narrowbody' },
  // aliases
  '319': { iataCode: 'A319', totalSeats: 144, economySeats: 128, category: 'narrowbody' },
  '320': { iataCode: 'A320', totalSeats: 180, economySeats: 150, category: 'narrowbody' },
  '321': { iataCode: 'A321', totalSeats: 220, economySeats: 185, category: 'narrowbody' },
  A321neo: { iataCode: 'A21N', totalSeats: 220, economySeats: 182, category: 'narrowbody' },
  B737MAX8: { iataCode: 'B38M', totalSeats: 178, economySeats: 162, category: 'narrowbody' },

  // ── Boeing widebody ──────────────────────────────────────────────────────────
  B752: { iataCode: 'B752', totalSeats: 200, economySeats: 176, category: 'narrowbody' },
  B753: { iataCode: 'B753', totalSeats: 228, economySeats: 196, category: 'narrowbody' },
  B762: { iataCode: 'B762', totalSeats: 181, economySeats: 158, category: 'widebody' },
  B763: { iataCode: 'B763', totalSeats: 218, economySeats: 198, category: 'widebody' },
  B764: { iataCode: 'B764', totalSeats: 245, economySeats: 218, category: 'widebody' },
  B772: { iataCode: 'B772', totalSeats: 400, economySeats: 360, category: 'widebody' },
  B773: { iataCode: 'B773', totalSeats: 396, economySeats: 360, category: 'widebody' },
  B77W: { iataCode: 'B77W', totalSeats: 396, economySeats: 365, category: 'widebody' },
  B788: { iataCode: 'B788', totalSeats: 242, economySeats: 210, category: 'widebody' },
  B789: { iataCode: 'B789', totalSeats: 296, economySeats: 252, category: 'widebody' },
  B78X: { iataCode: 'B78X', totalSeats: 330, economySeats: 296, category: 'widebody' },

  // ── Airbus widebody ──────────────────────────────────────────────────────────
  A332: { iataCode: 'A332', totalSeats: 247, economySeats: 222, category: 'widebody' },
  A333: { iataCode: 'A333', totalSeats: 277, economySeats: 253, category: 'widebody' },
  A359: { iataCode: 'A359', totalSeats: 325, economySeats: 300, category: 'widebody' },
  A35K: { iataCode: 'A35K', totalSeats: 360, economySeats: 330, category: 'widebody' },
  A388: { iataCode: 'A388', totalSeats: 555, economySeats: 471, category: 'widebody' },
  A380: { iataCode: 'A388', totalSeats: 555, economySeats: 471, category: 'widebody' },

  // ── Regional jets ────────────────────────────────────────────────────────────
  E170: { iataCode: 'E170', totalSeats: 72, economySeats: 66, category: 'regional_jet' },
  E175: { iataCode: 'E175', totalSeats: 78, economySeats: 70, category: 'regional_jet' },
  E190: { iataCode: 'E190', totalSeats: 106, economySeats: 94, category: 'regional_jet' },
  E195: { iataCode: 'E195', totalSeats: 118, economySeats: 106, category: 'regional_jet' },
  E75L: { iataCode: 'E75L', totalSeats: 76, economySeats: 68, category: 'regional_jet' },
  E7W:  { iataCode: 'E7W',  totalSeats: 80, economySeats: 72, category: 'regional_jet' },
  CRJ2: { iataCode: 'CRJ2', totalSeats: 50, economySeats: 50, category: 'regional_jet' },
  CRJ7: { iataCode: 'CRJ7', totalSeats: 70, economySeats: 66, category: 'regional_jet' },
  CRJ9: { iataCode: 'CRJ9', totalSeats: 76, economySeats: 70, category: 'regional_jet' },
  CRJX: { iataCode: 'CRJX', totalSeats: 104, economySeats: 90, category: 'regional_jet' },

  // ── Turboprops ───────────────────────────────────────────────────────────────
  AT72: { iataCode: 'AT72', totalSeats: 70, economySeats: 66, category: 'turboprop' },
  AT75: { iataCode: 'AT75', totalSeats: 70, economySeats: 66, category: 'turboprop' },
  DH8A: { iataCode: 'DH8A', totalSeats: 37, economySeats: 37, category: 'turboprop' },
  DH8B: { iataCode: 'DH8B', totalSeats: 39, economySeats: 39, category: 'turboprop' },
  DH8C: { iataCode: 'DH8C', totalSeats: 56, economySeats: 56, category: 'turboprop' },
  DH8D: { iataCode: 'DH8D', totalSeats: 78, economySeats: 72, category: 'turboprop' },
  SF34: { iataCode: 'SF34', totalSeats: 34, economySeats: 34, category: 'turboprop' },
};

/** Default seat count when aircraft type is unknown. */
const DEFAULT_SEATS = 150;

/**
 * Look up the typical total seat count for an aircraft type code.
 * Falls back to a conservative default if the type is not known.
 */
export function inferSeats(rawTypeCode: string): number {
  const code = rawTypeCode.trim().toUpperCase();
  return SEAT_REFERENCE[code]?.totalSeats ?? DEFAULT_SEATS;
}

/**
 * Normalize a raw aircraft type code to a canonical IATA code.
 */
export function normalizeAircraftCode(rawTypeCode: string): string {
  const code = rawTypeCode.trim().toUpperCase();
  return SEAT_REFERENCE[code]?.iataCode ?? code;
}

/**
 * Return the aircraft category for the given type code.
 */
export function getAircraftCategory(
  rawTypeCode: string
): AircraftSeatReference['category'] {
  const code = rawTypeCode.trim().toUpperCase();
  return SEAT_REFERENCE[code]?.category ?? 'other';
}
