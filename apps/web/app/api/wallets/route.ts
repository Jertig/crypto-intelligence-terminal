import { queryWallets } from '@terminal/db/wallets';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
const empty = (state: 'UNAVAILABLE' | 'NOT_CONFIGURED') => ({
  state,
  observedAt: new Date().toISOString(),
  provider: { status: 'NOT_CONFIGURED', lastSuccessAt: null, errorCode: null },
  wallets: [],
});
export async function GET() {
  try {
    const connection = configuredDatabase();
    return Response.json(
      connection ? await queryWallets(connection) : empty('NOT_CONFIGURED'),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(empty('UNAVAILABLE'), {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
