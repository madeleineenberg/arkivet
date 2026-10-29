import { handleIdentify } from '@/lib/identify-handler';
import { identifyCover } from '@/lib/identify';
import { searchReleases } from '@/lib/discogs';
import { getUpstashStore } from '@/lib/limits/upstash-store';
import { parseDailyLimit } from '@/lib/limits/config';

// Läses en gång per kallstart av funktionen.
const dailyLimit = parseDailyLimit(process.env.AI_DAILY_LIMIT);

// Next.js tillåter bara vissa exporter här (GET, POST, ...), därför ligger
// logiken i lib/identify-handler.ts och den här filen kopplar bara ihop.
export async function POST(req: Request) {
  return handleIdentify(req, {
    identifyCover,
    searchReleases,
    getStore: getUpstashStore,
    dailyLimit,
  });
}
