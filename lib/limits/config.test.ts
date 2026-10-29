import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDailyLimit, DEFAULT_AI_DAILY_LIMIT } from './config';

describe('parseDailyLimit', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('använder standardvärdet när variabeln saknas eller är tom', () => {
    expect(parseDailyLimit(undefined)).toBe(DEFAULT_AI_DAILY_LIMIT);
    expect(parseDailyLimit('  ')).toBe(DEFAULT_AI_DAILY_LIMIT);
  });

  it('läser ett positivt heltal', () => {
    expect(parseDailyLimit('10')).toBe(10);
  });

  it.each(['0', '-5', '2.5', 'abc', 'NaN'])(
    'faller tillbaka på standardvärdet för %s',
    (raw) => {
      expect(parseDailyLimit(raw)).toBe(DEFAULT_AI_DAILY_LIMIT);
      expect(console.warn).toHaveBeenCalled();
    },
  );
});
