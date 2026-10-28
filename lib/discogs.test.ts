import { describe, it, expect, vi } from 'vitest';
import { searchReleases, DiscogsError } from './discogs';

const q = { artist: 'Kent', title: 'Isola' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const as = (f: unknown) => f as typeof fetch;

describe('searchReleases', () => {
  it('mappar träffar till kandidater', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        json({
          results: [
            {
              id: 1,
              title: 'Kent - Isola',
              year: '2000',
              format: ['CD'],
              label: ['RCA'],
              thumb: '',
            },
          ],
        }),
      );
    const out = await searchReleases(q, as(f));
    expect(out).toEqual([
      {
        discogsId: 1,
        title: 'Kent - Isola',
        year: '2000',
        formats: ['CD'],
        label: 'RCA',
        thumb: null,
      },
    ]);
  });

  it('429 ger rate_limited', async () => {
    const f = vi.fn().mockResolvedValue(json({}, 429));
    await expect(searchReleases(q, as(f))).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });

  it('5xx ger unavailable', async () => {
    const f = vi.fn().mockResolvedValue(json({}, 503));
    await expect(searchReleases(q, as(f))).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('nätverksfel och timeout ger unavailable', async () => {
    const f = vi
      .fn()
      .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(searchReleases(q, as(f))).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('trasig JSON ger bad_response', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response('<html>', { status: 200 }));
    const err = await searchReleases(q, as(f)).catch((e) => e);
    expect(err).toBeInstanceOf(DiscogsError);
    expect(err.kind).toBe('bad_response');
  });

  it('oväntad payload ger bad_response', async () => {
    const f = vi.fn().mockResolvedValue(json({ nope: true }));
    await expect(searchReleases(q, as(f))).rejects.toMatchObject({
      kind: 'bad_response',
    });
  });
});
