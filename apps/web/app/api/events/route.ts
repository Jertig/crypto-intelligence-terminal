import { queryEvents } from '@terminal/db/events';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const db = configuredDatabase();
    return Response.json(
      db
        ? await queryEvents(db)
        : {
            state: 'NOT_CONFIGURED',
            observedAt: new Date().toISOString(),
            events: [],
            impacts: [],
          },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        state: 'UNAVAILABLE',
        observedAt: new Date().toISOString(),
        events: [],
        impacts: [],
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
