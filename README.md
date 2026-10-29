# Arkivet

Fotografera ett skivomslag (vinyl eller CD) och få reda på vilken skiva det är.

**Live:** [arkivet-app.vercel.app](https://arkivet-app.vercel.app)

## Så fungerar det

```
foto  →  förminskas i webbläsaren  →  /api/identify
                                          │
                                          ├─ 1. Claude läser artist och titel från omslaget
                                          └─ 2. Discogs söker fram riktiga utgåvor
                                                    │
                                          användaren väljer rätt utgåva
```

1. Bilden förminskas till max 1024 px (JPEG) i webbläsaren innan den laddas upp, så att AI-anropet blir billigare och snabbare.
2. [`lib/identify.ts`](lib/identify.ts) skickar bilden till Claude. Modellen måste svara via ett verktyg (tool use) med `artist`, `title` och `confidence`. Svaret valideras sedan med zod.
3. [`lib/discogs.ts`](lib/discogs.ts) söker i Discogs databas och returnerar upp till fem kandidater.
4. AI:ns gissning sparas aldrig direkt. Det är träffarna från Discogs som räknas.

### Svar från API:t

`POST /api/identify` tar emot `multipart/form-data` med fältet `image` (JPEG, PNG eller WebP, max 1,5 MB).

| `status`             | Betydelse                                                  |
| -------------------- | ---------------------------------------------------------- |
| `ok`                 | Gissning plus kandidater från Discogs                      |
| `not_recognised`     | Inget skivomslag, eller texten gick inte att läsa          |
| `lookup_unavailable` | AI:n svarade men Discogs är nere. Bara gissningen visas    |
| `ai_unavailable`     | Anropet till Claude misslyckades                           |
| `bad_request`        | Bild saknas, fel filtyp eller för stor fil                 |

## Kom igång lokalt

```bash
npm install
npm run dev
```

Skapa först `.env.local` med variablerna nedan.

Öppna [http://localhost:3000](http://localhost:3000).

### Miljövariabler

| Variabel            | Krävs | Beskrivning                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | ja    | API-nyckel från [console.anthropic.com](https://console.anthropic.com) |
| `DISCOGS_TOKEN`     | ja    | Personlig token från [discogs.com/settings/developers](https://www.discogs.com/settings/developers) |
| `ANTHROPIC_MODEL`   | nej   | Vilken Claude-modell som används. Standard: `claude-haiku-5-5` |

## Skript

| Kommando        | Gör                       |
| --------------- | ------------------------- |
| `npm run dev`   | Startar utvecklingsservern |
| `npm run build` | Bygger för produktion     |
| `npm run lint`  | Kör ESLint                |
| `npm test`      | Kör testerna (Vitest)     |

## Projektstruktur

```
app/
  page.tsx               Startsidan: uppladdning och resultat
  api/identify/route.ts  API-route: validerar bilden, anropar AI och Discogs
lib/
  identify.ts            Claude-anropet (omslag → artist/titel)
  discogs.ts             Sökning i Discogs
  limits/                Räknarlager för rate limiting (ej inkopplat än)
```

## Teknik

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, zod, Anthropic SDK, Vitest. Driftas på Vercel.
