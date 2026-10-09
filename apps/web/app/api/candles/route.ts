import { queryCandles } from '@terminal/db/market';
import { timeframeSchema } from '@terminal/domain/market';
import { configuredDatabase } from '../../../lib/database';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market') ?? '';
  const timeframe = timeframeSchema.safeParse(params.get('timeframe') ?? '1h');
  if (
    !/^binance:(spot|perpetual):[A-Z0-9]{2,24}$/.test(market) ||
    !timeframe.success
  )
    return Response.json({ error: 'INVALID_QUERY' }, { status: 400 });
  try {
    const connection = configuredDatabase();
    const rows = connection
      ? await queryCandles(connection, market, timeframe.data)
      : [];
    return Response.json(
      {
        state: connection
          ? rows.length
            ? 'READY'
            : 'EMPTY'
          : 'NOT_CONFIGURED',
        rows,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'DATABASE_UNAVAILABLE', rows: [] },
      { status: 503 },
    );
  }
}
