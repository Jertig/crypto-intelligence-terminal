import { queryTokens } from '@terminal/db/tokens';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
const empty = (state: 'NOT_CONFIGURED' | 'UNAVAILABLE') => ({
  state,
  observedAt: new Date().toISOString(),
  tokens: [],
  pairs: [],
  security: [],
  risks: [],
});
export async function GET() {
  try {
    const connection = configuredDatabase();
    return Response.json(
      connection ? await queryTokens(connection) : empty('NOT_CONFIGURED'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(empty('UNAVAILABLE'), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
