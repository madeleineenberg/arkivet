import {
  identifyCover,
  IdentifyError,
  type ImageMediaType,
} from '@/lib/identify';
import { searchReleases, DiscogsError } from '@/lib/discogs';

const ALLOWED: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 1_500_000; // bilden förminskas i webbläsaren innan uppladdning

export async function POST(req: Request) {
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

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  // Steg 1: AI läser omslaget.
  let guess;
  try {
    guess = await identifyCover({
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
    const candidates = await searchReleases({
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
