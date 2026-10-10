import { researchActionSchema, emptyResearch } from '@terminal/domain/research';
import { sameOriginRequest } from '@terminal/domain/request-security';
import { mutateResearch, queryResearch } from '@terminal/db/research';
import { boundedJson } from '@terminal/providers';
import { configuredDatabase } from '../../../lib/database';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
let busy = false,
  minute = 0,
  count = 0;
export async function GET() {
  try {
    const c = configuredDatabase();
    return Response.json(
      c ? await queryResearch(c) : emptyResearch('NOT_CONFIGURED'),
      { headers },
    );
  } catch {
    return Response.json(emptyResearch('UNAVAILABLE'), {
      status: 503,
      headers,
    });
  }
}
export async function POST(request: Request) {
  if (
    !sameOriginRequest(request) ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  )
    return Response.json(
      { error: 'INVALID_ORIGIN_OR_CONTENT_TYPE' },
      { status: 403, headers },
    );
  const m = Math.floor(Date.now() / 60000);
  if (m !== minute) {
    minute = m;
    count = 0;
  }
  let action;
  try {
    action = researchActionSchema.parse(
      await boundedJson(
        new Response(request.body, {
          headers: {
            'Content-Length': request.headers.get('content-length') ?? '',
          },
        }),
        16384,
      ),
    );
  } catch {
    return Response.json(
      { error: 'INVALID_RESEARCH_REQUEST' },
      { status: 400, headers },
    );
  }
  if (busy || count >= 30)
    return Response.json(
      { error: 'RESEARCH_RATE_LIMITED' },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  busy = true;
  count++;
  try {
    const c = configuredDatabase();
    if (!c) throw new Error('DATABASE_UNAVAILABLE');
    return Response.json(await mutateResearch(c, action), { headers });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    const conflict = [
      'RESEARCH_CAPACITY',
      'RESEARCH_CONFLICT',
      'RESEARCH_NOT_FOUND',
    ].includes(code);
    return Response.json(
      { error: conflict ? code : 'RESEARCH_UNAVAILABLE' },
      { status: conflict ? 409 : 503, headers },
    );
  } finally {
    busy = false;
  }
}
