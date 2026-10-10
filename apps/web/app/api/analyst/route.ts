import {
  analystRequestSchema,
  runAnalyst,
  type ToolResult,
} from '@terminal/domain/analyst';
import { readEnvironment } from '@terminal/domain/environment';
import { readAnalystEvidence } from '@terminal/db/analyst';
import { OpenAIAnalystProvider } from '@terminal/providers/analyst';
import { boundedJson } from '@terminal/providers';
import { configuredDatabase } from '../../../lib/database';
import { sameOriginRequest } from '@terminal/domain/request-security';
export const dynamic = 'force-dynamic';
let busy = false,
  minute = 0,
  requests = 0;
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (
    !sameOriginRequest(request, process.env.APP_ORIGIN) ||
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  )
    return Response.json(
      { error: 'INVALID_ORIGIN_OR_CONTENT_TYPE' },
      { status: 403, headers },
    );
  const currentMinute = Math.floor(Date.now() / 60000);
  if (minute !== currentMinute) {
    minute = currentMinute;
    requests = 0;
  }
  if (busy || requests >= 6)
    return Response.json(
      { error: 'ANALYST_BUSY_OR_RATE_LIMITED' },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  let input;
  try {
    input = analystRequestSchema.parse(
      await boundedJson(
        new Response(request.body, {
          headers: {
            'Content-Length': request.headers.get('content-length') ?? '',
          },
        }),
        4096,
      ),
    );
  } catch {
    return Response.json(
      { error: 'INVALID_ANALYST_REQUEST' },
      { status: 400, headers },
    );
  }
  if (busy || requests >= 6)
    return Response.json(
      { error: 'ANALYST_BUSY_OR_RATE_LIMITED' },
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  busy = true;
  requests++;
  try {
    const config = readEnvironment(process.env),
      db = configuredDatabase(),
      now = new Date();
    const provider =
      config.AI_ANALYST_ENABLED === 'true' &&
      config.OPENAI_API_KEY &&
      config.OPENAI_MODEL
        ? new OpenAIAnalystProvider({
            apiKey: config.OPENAI_API_KEY,
            model: config.OPENAI_MODEL,
          })
        : undefined;
    const memo = await runAnalyst(
      input,
      async (tool) =>
        db
          ? readAnalystEvidence(db, input, tool, now)
          : ({
              tool,
              state: 'NOT_CONFIGURED',
              evidence: [],
              limitation: 'Database is not configured; no evidence supplied.',
            } satisfies ToolResult),
      now,
      provider,
      request.signal,
    );
    return Response.json(memo, { headers });
  } catch {
    return Response.json(
      { error: 'ANALYST_UNAVAILABLE' },
      { status: 503, headers },
    );
  } finally {
    busy = false;
  }
}
