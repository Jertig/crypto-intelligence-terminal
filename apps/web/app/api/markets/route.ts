import { queryMarkets } from '@terminal/db/market';
import { configuredDatabase } from '../../../lib/database';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const connection = configuredDatabase();
    const value = connection
      ? await queryMarkets(connection)
      : {
          state: 'NOT_CONFIGURED',
          observedAt: new Date().toISOString(),
          rows: [],
          providers: [],
        };
    return Response.json(value, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      {
        state: 'UNAVAILABLE',
        observedAt: new Date().toISOString(),
        rows: [],
        providers: [],
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
