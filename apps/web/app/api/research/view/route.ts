import { z } from 'zod';
import { querySavedView } from '@terminal/db/research';
import { configuredDatabase } from '../../../../lib/database';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success)
    return Response.json(
      { error: 'INVALID_VIEW_ID' },
      { status: 400, headers },
    );
  try {
    const c = configuredDatabase();
    if (!c) throw new Error('DATABASE_UNAVAILABLE');
    return Response.json(await querySavedView(c, id.data), { headers });
  } catch {
    return Response.json(
      { error: 'VIEW_UNAVAILABLE' },
      { status: 503, headers },
    );
  }
}
