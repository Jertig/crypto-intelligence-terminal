import { readOperations } from '@terminal/db/operations';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const c = configuredDatabase();
    return Response.json(
      {
        state: c ? 'OBSERVED' : 'NOT_CONFIGURED',
        observation: c ? await readOperations(c) : null,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { state: 'UNAVAILABLE', observation: null },
      { status: 503, headers },
    );
  }
}
