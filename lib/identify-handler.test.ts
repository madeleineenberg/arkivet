import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleIdentify,
  secondsUntilUtcMidnight,
  type IdentifyDeps,
} from './identify-handler';
import { IdentifyError } from './identify';
import { DiscogsError } from './discogs';
import { createMemoryStore } from './limits/memory-store';
import { dayKey } from './limits/daily-cap';
import type { CounterStore } from './limits/store';

const NOON_UTC = Date.UTC(2026, 9, 29, 12, 0, 0);
const guess = {
  isAlbumCover: true,
  artist: 'Kent',
  title: 'Isola',
  confidence: 'high' as const,
};
const candidate = {
  discogsId: 1,
  title: 'Kent - Isola',
  year: '2000',
  formats: ['CD'],
  label: 'RCA',
  thumb: null,
};

function request(file?: File) {
  const form = new FormData();
  if (file) form.set('image', file);
  return new Request('http://localhost/api/identify', {
    method: 'POST',
    body: form,
  });
}
const jpeg = () =>
  new File([new Uint8Array([1, 2, 3])], 'cover.jpg', { type: 'image/jpeg' });

function setup(overrides: Partial<IdentifyDeps> = {}) {
  const now = () => NOON_UTC;
  const store = createMemoryStore(now);
  const deps = {
    identifyCover: vi.fn().mockResolvedValue(guess),
    searchReleases: vi.fn().mockResolvedValue([candidate]),
    getStore: () => store,
    dailyLimit: 2,
    now,
    ...overrides,
  };
  const used = () => store.get(dayKey('global', NOON_UTC));
  return { deps, used };
}

const broken: CounterStore = {
  get: async () => {
    throw new Error('down');
  },
  set: async () => {
    throw new Error('down');
  },
  incr: async () => {
    throw new Error('down');
  },
};

describe('handleIdentify', () => {
  beforeEach(() => {
    // Handlern loggar fel med flit; håll testutskriften ren.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('dagstak', () => {
    it('under taket: anropar AI, svarar ok och räknar upp', async () => {
      const { deps, used } = setup();
      const res = await handleIdentify(request(jpeg()), deps);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        status: 'ok',
        guess,
        candidates: [candidate],
      });
      expect(deps.identifyCover).toHaveBeenCalledOnce();
      expect(await used()).toBe(1);
    });

    it('taket nått: 429 med Retry-After och inget AI-anrop', async () => {
      const { deps } = setup({ dailyLimit: 1 });
      await handleIdentify(request(jpeg()), deps);
      const res = await handleIdentify(request(jpeg()), deps);

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ status: 'ai_quota_exceeded' });
      expect(res.headers.get('Retry-After')).toBe('43200'); // 12 h till midnatt UTC
      expect(deps.identifyCover).toHaveBeenCalledOnce(); // bara det första
    });

    it('Redis svarar inte: 503 ai_unavailable och inget AI-anrop (fail-closed)', async () => {
      const { deps } = setup({ getStore: () => broken });
      const res = await handleIdentify(request(jpeg()), deps);

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: 'ai_unavailable' });
      expect(deps.identifyCover).not.toHaveBeenCalled();
    });

    it('store kan inte skapas (t.ex. saknade env-variabler): också fail-closed', async () => {
      const { deps } = setup({
        getStore: () => {
          throw new Error('UPSTASH_REDIS_REST_URL saknas');
        },
      });
      const res = await handleIdentify(request(jpeg()), deps);

      expect(res.status).toBe(503);
      expect(deps.identifyCover).not.toHaveBeenCalled();
    });
  });

  describe('validering äter inte kvot', () => {
    it('ingen bild: 400 och räknaren orörd', async () => {
      const { deps, used } = setup();
      const res = await handleIdentify(request(), deps);

      expect(res.status).toBe(400);
      expect(await used()).toBeNull();
    });

    it('fel filtyp: 415 och räknaren orörd', async () => {
      const { deps, used } = setup();
      const gif = new File([new Uint8Array([1])], 'a.gif', {
        type: 'image/gif',
      });
      const res = await handleIdentify(request(gif), deps);

      expect(res.status).toBe(415);
      expect(await used()).toBeNull();
    });
  });

  describe('befintligt beteende', () => {
    it('oläsligt omslag ger not_recognised utan Discogs-anrop', async () => {
      const { deps } = setup({
        identifyCover: vi
          .fn()
          .mockResolvedValue({ ...guess, artist: null, confidence: 'low' }),
      });
      const res = await handleIdentify(request(jpeg()), deps);

      expect((await res.json()).status).toBe('not_recognised');
      expect(deps.searchReleases).not.toHaveBeenCalled();
    });

    it('AI-fel ger 502 ai_unavailable', async () => {
      const { deps } = setup({
        identifyCover: vi
          .fn()
          .mockRejectedValue(new IdentifyError('api_error', '529')),
      });
      const res = await handleIdentify(request(jpeg()), deps);

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ status: 'ai_unavailable' });
    });

    it('Discogs nere ger lookup_unavailable med AI-gissningen', async () => {
      const { deps } = setup({
        searchReleases: vi
          .fn()
          .mockRejectedValue(new DiscogsError('unavailable', '503')),
      });
      const res = await handleIdentify(request(jpeg()), deps);

      expect(await res.json()).toEqual({ status: 'lookup_unavailable', guess });
    });
  });
});

describe('secondsUntilUtcMidnight', () => {
  it('avrundar uppåt och blir aldrig 0', () => {
    expect(
      secondsUntilUtcMidnight(Date.UTC(2026, 9, 29, 23, 59, 59, 500)),
    ).toBe(1);
  });
});
