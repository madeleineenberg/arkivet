export const DEFAULT_AI_DAILY_LIMIT = 50;

// Läser AI_DAILY_LIMIT. Allt som inte är ett positivt heltal ger standardvärdet,
// så att en felskriven miljövariabel aldrig kan stänga av taket (t.ex. NaN,
// där jämförelsen `used > NaN` alltid är false och allt släpps igenom).
export function parseDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_AI_DAILY_LIMIT;

  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;

  console.warn(
    `AI_DAILY_LIMIT="${raw}" är ogiltigt, använder ${DEFAULT_AI_DAILY_LIMIT}`,
  );
  return DEFAULT_AI_DAILY_LIMIT;
}
