'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketResponseSchema, freshness } from '@terminal/domain/market';
export const formatNumber = (
  value: number | null | undefined,
  compact = false,
) =>
  value == null
    ? '—'
    : new Intl.NumberFormat(
        'en-US',
        compact
          ? { notation: 'compact', maximumFractionDigits: 2 }
          : { maximumFractionDigits: value < 1 ? 8 : 2 },
      ).format(value);
export function useMarketData() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['markets'],
    refetchInterval: 10000,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/markets', {
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error('Market storage unavailable');
      return marketResponseSchema.parse(await response.json());
    },
  });
  const data = useMemo(
    () =>
      query.data
        ? {
            ...query.data,
            providers: query.data.providers.map((provider) => ({
              ...provider,
              status:
                provider.lastSuccessAt &&
                freshness(
                  provider.lastSuccessAt,
                  new Date(Math.max(now, query.dataUpdatedAt)),
                  provider.providerId.includes('perpetual') ? 600000 : 90000,
                ) === 'STALE'
                  ? 'STALE'
                  : provider.status,
            })),
            rows: query.data.rows.map((row) => ({
              ...row,
              freshness: freshness(
                row.provenance.sourceTimestamp,
                new Date(Math.max(now, query.dataUpdatedAt)),
              ),
            })),
          }
        : undefined,
    [query.data, query.dataUpdatedAt, now],
  );
  return { ...query, data };
}
