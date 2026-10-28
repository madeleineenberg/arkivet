import { z } from 'zod';

export class DiscogsError extends Error {
  constructor(
    public kind: 'rate_limited' | 'unavailable' | 'bad_response',
    message: string,
  ) {
    super(message);
  }
}

const ResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string(), // "Artist - Titel"
      year: z.string().optional(),
      format: z.array(z.string()).optional(),
      label: z.array(z.string()).optional(),
      thumb: z.string().optional(),
    }),
  ),
});

export type Candidate = {
  discogsId: number;
  title: string;
  year: string | null;
  formats: string[];
  label: string | null;
  thumb: string | null;
};

export async function searchReleases(
  query: { artist: string; title: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Candidate[]> {
  const url = new URL('https://api.discogs.com/database/search');
  url.searchParams.set('type', 'release');
  url.searchParams.set('artist', query.artist);
  url.searchParams.set('release_title', query.title);
  url.searchParams.set('per_page', '5');

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
        // Discogs kräver en identifierbar User-Agent.
        'User-Agent': 'ArkivetApp/0.1',
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Nätverksfel och timeout behandlas lika: tjänsten är inte nåbar.
    throw new DiscogsError('unavailable', 'Discogs unreachable or timed out');
  }

  if (res.status === 429)
    throw new DiscogsError('rate_limited', 'Discogs rate limit hit');
  if (!res.ok)
    throw new DiscogsError('unavailable', `Discogs responded ${res.status}`);

  const json = await res.json().catch(() => null);
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success)
    throw new DiscogsError('bad_response', 'Unexpected Discogs payload');

  return parsed.data.results.map((r) => ({
    discogsId: r.id,
    title: r.title,
    year: r.year ?? null,
    formats: r.format ?? [],
    label: r.label?.[0] ?? null,
    thumb: r.thumb || null,
  }));
}
