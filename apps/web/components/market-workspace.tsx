'use client';
import Link from 'next/link';
import { FeatureInspector } from './narrative-workspace';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { flexRender } from '@tanstack/react-table';
import {
  useLegacyTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type LegacyColumnDef,
} from '@tanstack/react-table/legacy';
import {
  createChart,
  LineSeries,
  ColorType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { z } from 'zod';
import {
  candleSchema,
  freshness,
  type MarketRow,
} from '@terminal/domain/market';

import { formatNumber, useMarketData } from './market-data';
export { formatNumber, useMarketData } from './market-data';
const columns: LegacyColumnDef<MarketRow>[] = [
  { accessorKey: 'base', header: 'Asset' },
  {
    accessorKey: 'price',
    header: 'Price · USDT',
    cell: (info) => formatNumber(info.row.original.price),
  },
  {
    accessorKey: 'change24h',
    header: '24H %',
    cell: (info) => (
      <span
        className={info.row.original.change24h >= 0 ? 'positive' : 'negative'}
      >
        {info.row.original.change24h > 0 ? '+' : ''}
        {formatNumber(info.row.original.change24h)}%
      </span>
    ),
  },
  {
    accessorKey: 'quoteVolume24h',
    header: '24H vol · USDT',
    cell: (info) => formatNumber(info.row.original.quoteVolume24h, true),
  },
  {
    id: 'oi',
    header: 'OI · base units',
    accessorFn: (row) => row.openInterest?.quantity ?? null,
    cell: (info) => {
      const oi = info.row.original.openInterest;
      return oi ? (
        <span
          title={freshness(oi.provenance.sourceTimestamp, new Date(), 600000)}
        >
          {formatNumber(oi.quantity, true)} {oi.unit}
          {freshness(oi.provenance.sourceTimestamp, new Date(), 600000) ===
          'STALE'
            ? ' · STALE'
            : ''}
        </span>
      ) : (
        '—'
      );
    },
  },
  {
    id: 'funding',
    header: 'Last funding %',
    accessorFn: (row) => row.funding?.rate ?? null,
    cell: (info) =>
      info.row.original.funding
        ? `${formatNumber(info.row.original.funding.rate * 100)}%${freshness(info.row.original.funding.provenance.sourceTimestamp, new Date(), 600000) === 'STALE' ? ' · STALE' : ''}`
        : '—',
  },
  {
    accessorKey: 'freshness',
    header: 'Freshness',
    cell: (info) => (
      <span
        className={`quality-label ${info.row.original.freshness === 'STALE' ? 'stale' : ''}`}
      >
        {info.row.original.freshness}
      </span>
    ),
  },
];
export function MarketScanner({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const query = useMarketData();
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState([
    { id: 'quoteVolume24h', desc: true },
  ]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const table = useLegacyTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: filter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    globalFilterFn: (row, _id, value: string) =>
      row.original.base.toLowerCase().includes(value.toLowerCase()),
  });
  const visible = table.getRowModel().rows;
  return (
    <section className="panel scanner live-scanner">
      <div className="panel-heading">
        <h2>Market scanner</h2>
        <span>BINANCE SPOT · USDT</span>
      </div>
      <div className="scanner-toolbar">
        <input
          aria-label="Filter assets"
          placeholder="Filter assets…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <details className="column-picker">
          <summary>Columns</summary>
          {table
            .getAllLeafColumns()
            .filter((column) => column.id !== 'base')
            .map((column) => (
              <label key={column.id}>
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {String(column.columnDef.header)}
              </label>
            ))}
        </details>
        <Link href="/data-status">Data status ↗</Link>
      </div>
      {query.isPending ? (
        <p className="market-message" role="status">
          Loading stored market observations…
        </p>
      ) : query.isError ? (
        <div className="market-message" role="alert">
          <strong>Market storage unavailable</strong>
          <p>Previously observed values are retained with their timestamps.</p>
          <button className="text-button" onClick={() => void query.refetch()}>
            Retry market query
          </button>
        </div>
      ) : null}
      <div className="table-scroll">
        <table
          aria-label="Market scanner"
          tabIndex={0}
          onKeyDown={(event) => {
            if (!visible.length) return;
            const index = visible.findIndex((row) => row.id === selected);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const target =
                visible[
                  Math.max(
                    0,
                    Math.min(
                      visible.length - 1,
                      index + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                  )
                ];
              if (target) onSelect(target.id);
            }
            if (event.key === 'Enter' && selected) {
              event.preventDefault();
              document.querySelector<HTMLElement>('.inspector')?.focus();
            }
          }}
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted()
                        ? header.column.getIsSorted() === 'desc'
                          ? ' ↓'
                          : ' ↑'
                        : ''}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                aria-selected={selected === row.id}
                onClick={() => onSelect(row.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && !query.isPending && !query.isError && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length}>
                  <div className="empty-state">
                    <strong>Market feeds are not connected</strong>
                    <p>
                      No observations are available. Connect the bounded worker
                      to public providers.
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {rows.length > 0 && !visible.length && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length}>
                  No assets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mobile-assets">
        {rows.length ? (
          visible.map((row) => (
            <button
              key={row.id}
              onClick={() => onSelect(row.id)}
              aria-pressed={selected === row.id}
            >
              <b>{row.original.base}</b>
              <span>{formatNumber(row.original.price)} USDT</span>
              <small>{row.original.freshness}</small>
            </button>
          ))
        ) : (
          <p>No verified market observations available.</p>
        )}
      </div>
      <div className="panel-foot">
        <span>
          {rows.length} observations ·{' '}
          {query.data?.observedAt
            ? new Date(query.data.observedAt).toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Jakarta',
              }) + ' WIB'
            : '—'}
        </span>
        <span>Source time stays visible in inspector</span>
      </div>
    </section>
  );
}
export function PriceHistory({ market }: { market: MarketRow | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '1h' | '1d'>('1h');
  const query = useQuery({
    queryKey: ['candles', market?.id, timeframe],
    enabled: !!market,
    refetchInterval: 60000,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `/api/candles?market=${encodeURIComponent(market?.id ?? '')}&timeframe=${timeframe}`,
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      if (!response.ok) throw new Error('Historical coverage unavailable');
      return z
        .object({ rows: z.array(candleSchema).max(1000) })
        .parse(await response.json()).rows;
    },
  });
  useEffect(() => {
    if (!container.current || !query.data?.length) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#f1eee6' },
        textColor: '#656963',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: '#20252312' },
        horzLines: { color: '#20252312' },
      },
      rightPriceScale: { borderColor: '#20252333' },
      timeScale: { borderColor: '#20252333', timeVisible: true },
      localization: {
        timeFormatter: (value: UTCTimestamp) =>
          new Date(Number(value) * 1000).toLocaleString('en-GB', {
            timeZone: 'Asia/Jakarta',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
      },
    });
    chart.addSeries(LineSeries, { color: '#137d70', lineWidth: 2 }).setData(
      query.data.map((candle) => ({
        time: (new Date(candle.openTime).getTime() / 1000) as UTCTimestamp,
        value: candle.close,
      })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [query.data]);
  return (
    <section className="panel comparison price-history">
      <div className="panel-heading">
        <h2>
          {market ? `${market.base} price history · USDT` : 'Price history'}
        </h2>
        <span>CLOSED BARS · WIB</span>
      </div>
      <div className="chart-controls">
        {(['1m', '5m', '1h', '1d'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={value === timeframe}
            onClick={() => setTimeframe(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {!market ? (
        <div className="empty-state">
          <strong>Select an asset for price history</strong>
          <p>Only persisted closed candles are plotted.</p>
        </div>
      ) : query.isPending ? (
        <p className="market-message" role="status">
          Loading historical coverage…
        </p>
      ) : query.isError ? (
        <p className="market-message" role="alert">
          Historical coverage unavailable
        </p>
      ) : !query.data?.length ? (
        <div className="empty-state">
          <strong>No historical coverage</strong>
          <p>
            The worker is warming history or this interval has no observed bars.
          </p>
        </div>
      ) : (
        <>
          <div
            ref={container}
            className="price-chart"
            aria-label={`${market.base} closed price history`}
          />
          <div className="panel-foot">
            <span>{query.data.length} bars · DIRECT · Binance</span>
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
            >
              Chart by TradingView
            </a>
          </div>
        </>
      )}
    </section>
  );
}
export function MarketInspector({
  market,
  clear,
}: {
  market: MarketRow;
  clear: () => void;
}) {
  const now = new Date();
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Asset inspector</h2>
        <button
          className="text-button"
          onClick={clear}
          aria-label="Clear selected asset"
        >
          ×
        </button>
      </div>
      <div className="inspector-intro">
        <div>
          <h3>{market.base}</h3>
          <p>
            Binance spot · {market.quote} · {market.freshness}
          </p>
        </div>
      </div>
      <dl className="asset-metrics">
        {[
          ['Price · USDT', formatNumber(market.price)],
          ['24H return · %', formatNumber(market.change24h)],
          ['24H volume · USDT', formatNumber(market.quoteVolume24h, true)],
          ['Market cap', 'Unavailable · metadata not connected'],
          [
            'Open interest',
            market.openInterest
              ? `${formatNumber(market.openInterest.quantity, true)} ${market.openInterest.unit} · ${freshness(market.openInterest.provenance.sourceTimestamp, now, 600000)}`
              : 'Unavailable · derivatives',
          ],
          [
            'Last funding rate',
            market.funding
              ? `${formatNumber(market.funding.rate * 100)}% · ${freshness(market.funding.provenance.sourceTimestamp, now, 600000)}`
              : 'Unavailable · derivatives',
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="inspector-subheading">Data provenance</h3>
      <div className="provenance-empty">
        <span>Source</span>
        <b>{market.provenance.providerId}</b>
        <span>Endpoint</span>
        <b>{market.provenance.source}</b>
        <span>Quality</span>
        <b>{market.provenance.quality}</b>
        <span>Source timestamp</span>
        <b>
          {new Date(market.provenance.sourceTimestamp).toLocaleString('en-GB', {
            timeZone: 'Asia/Jakarta',
          })}{' '}
          WIB
        </b>
        <span>Ingested at</span>
        <b>
          {new Date(market.provenance.ingestedAt).toLocaleString('en-GB', {
            timeZone: 'Asia/Jakarta',
          })}{' '}
          WIB
        </b>
      </div>
      <p className="provenance-note">
        USDT is the quoted unit, not an inferred USD conversion. Exchange-scoped
        identity: {market.assetId}. Source timestamps are retained when refresh
        fails.
      </p>
      <FeatureInspector marketId={market.id} />
    </section>
  );
}
