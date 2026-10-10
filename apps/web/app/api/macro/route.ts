import { queryMacro } from '@terminal/db/events';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
const empty = (state: string) => ({
  state,
  observedAt: new Date().toISOString(),
  provider: { status: 'NOT_CONFIGURED', lastSuccessAt: null, errorCode: null },
  series: [],
  crypto: [],
});
export async function GET() {
  try {
    const db = configuredDatabase();
    return Response.json(db ? await queryMacro(db) : empty('NOT_CONFIGURED'), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(empty('UNAVAILABLE'), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
