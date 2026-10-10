'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  operationsSchema,
  ingestionAllowed,
  backupState,
} from '@terminal/domain/operations';
export function OperationsPanel() {
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setClock(new Date());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['operations'],
    retry: false,
    refetchInterval: 60000,
    queryFn: async () => {
      const r = await fetch('/api/operations', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error('OPERATIONS_UNAVAILABLE');
      const d: unknown = await r.json();
      if (!d || typeof d !== 'object' || !('observation' in d))
        throw new Error('INVALID_STATUS');
      return d.observation ? operationsSchema.parse(d.observation) : null;
    },
  });
  const s = query.data,
    format = (n: number | null) =>
      n === null ? 'Unavailable' : `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Storage and backups</h2>
        <span>BOUNDED OPERATIONS</span>
      </div>
      {query.isPending ? (
        <p className="panel-foot" role="status">
          Checking storage…
        </p>
      ) : query.isError ? (
        <p className="panel-foot" role="alert">
          Operations status unavailable.{' '}
          <button className="text-button" onClick={() => void query.refetch()}>
            Retry operations
          </button>
        </p>
      ) : !s ? (
        <p className="panel-foot">
          Operations observation unavailable; no storage capacity is assumed.
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="provider-table">
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th>Observed state</th>
                  <th>Policy / provenance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Storage protection</td>
                  <td>
                    {!s.enabled
                      ? 'LOCAL MONITOR ONLY'
                      : clock &&
                          !ingestionAllowed(s, clock) &&
                          !['UNKNOWN', 'PROTECTED'].includes(s.state)
                        ? 'STALE OBSERVATION'
                        : s.state}
                  </td>
                  <td>
                    70% warning · 80% urgent · 90% protective. Unknown/stale
                    production storage blocks writes.
                  </td>
                </tr>
                <tr>
                  <td>PostgreSQL</td>
                  <td>{format(s.databaseBytes)}</td>
                  <td>
                    6 GiB warning · 8 GiB protective budget. Observed at{' '}
                    {new Date(s.observedAt).toLocaleString()}.
                  </td>
                </tr>
                {s.disks.map((d) => (
                  <tr key={d.name}>
                    <td>{d.name} filesystem</td>
                    <td>
                      {(100 * (1 - d.availableBytes / d.totalBytes)).toFixed(1)}
                      % used
                    </td>
                    <td>
                      {format(d.availableBytes)} available /{' '}
                      {format(d.totalBytes)} total. Filesystem, not project-only
                      storage.
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Latest backup</td>
                  <td>
                    {clock ? backupState(s.backup, clock) : 'Checking age'}
                  </td>
                  <td>
                    {s.backup?.lastSuccessAt
                      ? `${new Date(s.backup.lastSuccessAt).toLocaleString()} · ${format(s.backup.bytes)}`
                      : 'No verified successful backup recorded.'}{' '}
                    Local backups require an off-host copy for disaster
                    recovery.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="panel-foot">
            {s.reasons.join(' ') || 'No measured threshold breached.'} Retention
            continues independently of provider credentials. Backups are
            monitored separately from market evidence; a successful dump does
            not certify an off-host restore.
          </p>
        </>
      )}
    </section>
  );
}
