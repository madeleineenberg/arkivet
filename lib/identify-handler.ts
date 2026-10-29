import {
  IdentifyError,
  type CoverGuess,
  type ImageMediaType,
} from './identify';
import { DiscogsError, type Candidate } from './discogs';
import { consumeDailyCap, type CapDecision } from './limits/daily-cap';
import type { CounterStore } from './limits/store';

const ALLOWED: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 1_500_000; // bilden förminskas i webbläsaren innan uppladdning

// Allt som går över nätverket kommer in här, så att testerna kan byta ut det.
export type IdentifyDeps = {
  identifyCover: (image: {
    base64: string;
    mediaType: ImageMediaType;
  }) => Promise<CoverGuess>;
  searchReleases: (query: {
    artist: string;
    title: string;
  }) => Promise<Candidate[]>;
  // En funktion i stället för en färdig store: om Upstash-variablerna saknas
  // kastar getUpstashStore(), och det felet ska bli fail-closed, inte en 500.
  getStore: () => CounterStore;
  dailyLimit: number;
  now?: () => number;
};

export function secondsUntilUtcMidnight(now: number): number {
  const d = new Date(now);
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return Math.max(1, Math.ceil((nextMidnight - now) / 1000));
}

async function checkGlobalCap(
  deps: IdentifyDeps,
  now: () => number,
): Promise<CapDecision> {
  let store: CounterStore;
  try {
    store = deps.getStore();
  } catch (err) {
    console.error(
      'cap store could not be created',
      err instanceof Error ? err.message : err,
    );
    return { allowed: false, reason: 'store_unavailable' };
  }
  return consumeDailyCap(store, 'global', deps.dailyLimit, now);
}

export async function handleIdentify(
  req: Request,
  deps: IdentifyDeps,
): Promise<Response> {
  const now = deps.now ?? Date.now;

  const form = await req.formData().catch(() => null);
  const file = form?.get('image');

  if (!(file instanceof File)) {
    return Response.json(
      { status: 'bad_request', message: 'Ingen bild skickades.' },
      { status: 400 },
    );
  }
  if (!ALLOWED.includes(file.type as ImageMediaType)) {
    return Response.json(
      { status: 'bad_request', message: 'Filtypen stöds inte.' },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { status: 'bad_request', message: 'Bilden är för stor.' },
      { status: 413 },
    );
  }

  // Steg 0: dagstaket. Efter valideringen (trasiga uppladdningar ska inte äta kvot)
  // och före AI-anropet (även misslyckade anrop kan kosta).
  const cap = await checkGlobalCap(deps, now);
  if (!cap.allowed) {
    if (cap.reason === 'limit_reached') {
      return Response.json(
        { status: 'ai_quota_exceeded' },
        {
          status: 429,
          headers: { 'Retry-After': String(secondsUntilUtcMidnight(now())) },
        },
      );
    }
    // Fail-closed: vi vet inte om taket är nått, så vi anropar inte AI.
    console.error('daily cap store unavailable');
    return Response.json({ status: 'ai_unavailable' }, { status: 503 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  // Steg 1: AI läser omslaget.
  let guess: CoverGuess;
  try {
    guess = await deps.identifyCover({
      base64,
      mediaType: file.type as ImageMediaType,
    });
  } catch (err) {
    console.error(
      'identify failed',
      err instanceof IdentifyError ? err.kind : err,
    );
    return Response.json({ status: 'ai_unavailable' }, { status: 502 });
  }

  if (!guess.isAlbumCover || !guess.artist || !guess.title) {
    return Response.json({ status: 'not_recognised', guess });
  }

  // Steg 2: databasen ger riktiga träffar. AI:ns gissning sparas aldrig direkt.
  try {
    const candidates = await deps.searchReleases({
      artist: guess.artist,
      title: guess.title,
    });
    return Response.json({ status: 'ok', guess, candidates });
  } catch (err) {
    console.error(
      'discogs failed',
      err instanceof DiscogsError ? err.kind : err,
    );
    // Mjuk degradering: AI-gissningen visas även om Discogs ligger nere.
    return Response.json({ status: 'lookup_unavailable', guess });
  }
}
