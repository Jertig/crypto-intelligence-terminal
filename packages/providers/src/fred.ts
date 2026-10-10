import { z } from 'zod';
import {
  macroIdSchema,
  macroObservationSchema,
  calendarDateSchema,
  type MacroObservation,
} from '@terminal/domain/events';
import { ProviderError, boundedJson } from './index';
const responseSchema = z.object({
  count: z.number().int().nonnegative(),
  offset: z.literal(0),
  observations: z
    .array(
      z.object({
        date: calendarDateSchema,
        realtime_start: calendarDateSchema,
        realtime_end: calendarDateSchema,
        value: z.string().max(80),
      }),
    )
    .max(2000),
});
export class FredProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      fetchFn?: typeof fetch;
      signal?: AbortSignal;
      now?: () => Date;
    },
  ) {}
  async observations(
    seriesId: (typeof macroIdSchema)['_output'],
  ): Promise<MacroObservation[]> {
    const id = macroIdSchema.parse(seriesId),
      now = this.options.now?.() ?? new Date(),
      day = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 5 * 366 * 86400000)
      .toISOString()
      .slice(0, 10);
    const params = new URLSearchParams({
      series_id: id,
      api_key: this.options.apiKey,
      file_type: 'json',
      limit: '2000',
      offset: '0',
      sort_order: 'desc',
      observation_start: start,
      observation_end: day,
      realtime_start: day,
      realtime_end: day,
    });
    const timeout = AbortSignal.timeout(8000),
      signal = this.options.signal
        ? AbortSignal.any([timeout, this.options.signal])
        : timeout;
    try {
      const response = await (this.options.fetchFn ?? fetch)(
        `https://api.stlouisfed.org/fred/series/observations?${params}`,
        { signal, redirect: 'error' },
      );
      if (response.status === 429) throw new ProviderError('RATE_LIMIT', 60000);
      if (!response.ok) throw new ProviderError('HTTP_ERROR');
      const raw = responseSchema.parse(
        await boundedJson(response, 2 * 1024 * 1024),
      );
      if (raw.count > 2000 || raw.observations.length !== raw.count)
        throw new ProviderError('MALFORMED_RESPONSE');
      const rows = raw.observations.map((o) => {
        if (o.realtime_start !== day || o.realtime_end !== day)
          throw new ProviderError('MALFORMED_RESPONSE');
        const value =
          o.value === '.'
            ? null
            : /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(o.value)
              ? Number(o.value)
              : NaN;
        return macroObservationSchema.parse({
          seriesId: id,
          date: o.date,
          realtimeStart: o.realtime_start,
          realtimeEnd: o.realtime_end,
          value,
          provenance: {
            providerId: 'fred',
            source: `/fred/series/observations?series_id=${id}`,
            sourceTimestamp: now.toISOString(),
            ingestedAt: now.toISOString(),
            quality: 'DIRECT',
            methodologyVersion: 'fred-observations:v1',
          },
        });
      });
      if (new Set(rows.map((o) => o.date)).size !== rows.length)
        throw new ProviderError('MALFORMED_RESPONSE');
      return rows.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      if (signal.aborted) throw new ProviderError('TIMEOUT');
      if (error instanceof ProviderError) throw error;
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        throw new ProviderError('MALFORMED_RESPONSE');
      throw new ProviderError('UNAVAILABLE');
    }
  }
}
