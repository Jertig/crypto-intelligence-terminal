import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';
import { performance } from 'node:perf_hooks';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const file = '.work/production-qa.env',
  cli = 'infra/ops/terminal.mjs',
  origin = 'https://localhost:18443';
const evidence = {
  verifiedAt: new Date().toISOString(),
  scope: 'Isolated local production-like QA, not a VPS or public certificate',
  checks: [],
  latencies: [],
};
let phase = 'configuration',
  config;
const docker = (args) =>
  execFileSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
function check(name, condition) {
  evidence.checks.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
  console.log(`${name}: PASS`);
}
function command(op) {
  phase = op;
  return execFileSync(process.execPath, [cli, op, '--qa', '--env-file', file], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}
const dc = (args) =>
  docker([
    'compose',
    '--env-file',
    file,
    '-f',
    'compose.production.yaml',
    '-f',
    'infra/docker/compose.production-qa.yaml',
    '-p',
    'terminal-production-qa',
    ...args,
  ]);
function sql(query, user = 'terminal_admin') {
  return dc([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    user,
    '-d',
    'terminal',
    '-tAc',
    query,
  ]);
}
function denied(query, user) {
  try {
    sql(query, user);
    return false;
  } catch (e) {
    return String(e.stderr).includes('permission denied');
  }
}
function http(path, options = {}) {
  return new Promise((yes, no) => {
    const headers = {
      ...(options.auth === false
        ? {}
        : {
            Authorization:
              'Basic ' +
              Buffer.from(
                config.ACCESS_USER + ':' + config.QA_ACCESS_PASSWORD,
              ).toString('base64'),
          }),
      ...options.headers,
    };
    const body =
        options.body === undefined ? undefined : JSON.stringify(options.body),
      start = performance.now();
    const p = request(
      origin + path,
      {
        method: options.method ?? 'GET',
        headers,
        rejectUnauthorized: false,
        timeout: 8000,
      },
      (r) => {
        let content = '';
        r.setEncoding('utf8');
        r.on('data', (b) => {
          content += b;
          if (content.length > 500000)
            r.destroy(new Error('Bounded QA response exceeded'));
        });
        r.on('end', () =>
          yes({
            status: r.statusCode,
            headers: r.headers,
            body: content,
            ms: performance.now() - start,
          }),
        );
      },
    );
    p.on('error', no);
    p.on('timeout', () => p.destroy(new Error('QA request timeout')));
    p.end(body);
  });
}
const json = (r) => JSON.parse(r.body);
const post = (body) =>
  http('/api/research', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body,
  });
async function ready() {
  for (let i = 0; i < 15; i++) {
    const r = await http('/health?ready=1');
    if (r.status === 200) return r;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Readiness did not recover');
}
function records() {
  return JSON.parse(
    sql(
      "SELECT json_build_object('notes',(SELECT count(*) FROM research_notes),'reports',(SELECT count(*) FROM report_snapshots),'watchlists',(SELECT count(*) FROM watchlists),'migrations',(SELECT count(*) FROM drizzle.__drizzle_migrations))",
    ),
  );
}
async function run() {
  await mkdir('.work', { recursive: true });
  try {
    config = parseEnv(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const password = randomBytes(32).toString('hex');
    const hash = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        'crypto-intelligence-terminal-caddy',
        'caddy',
        'hash-password',
        '--algorithm',
        'bcrypt',
        '--bcrypt-cost',
        '12',
      ],
      {
        input: password + '\n',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    ).trim();
    config = {
      POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
      POSTGRES_WEB_PASSWORD: randomBytes(32).toString('hex'),
      POSTGRES_WORKER_PASSWORD: randomBytes(32).toString('hex'),
      ACCESS_USER: 'operator',
      ACCESS_HASH: hash,
      QA_ACCESS_PASSWORD: password,
      APP_ORIGIN: origin,
      MARKET_INGESTION_ENABLED: 'false',
      TOKEN_INGESTION_ENABLED: 'false',
      AI_ANALYST_ENABLED: 'false',
    };
  }
  config.WEB_IMAGE = docker([
    'image',
    'inspect',
    'crypto-intelligence-terminal-web',
    '--format',
    '{{.Id}}',
  ]);
  config.WORKER_IMAGE = docker([
    'image',
    'inspect',
    'crypto-intelligence-terminal-worker',
    '--format',
    '{{.Id}}',
  ]);
  for (const [key, name] of [
    ['POSTGRES_IMAGE', 'postgres'],
    ['CADDY_IMAGE', 'caddy'],
  ])
    config[key] = docker([
      'image',
      'inspect',
      'crypto-intelligence-terminal-' + name,
      '--format',
      '{{.Id}}',
    ]);
  await writeFile(
    file,
    Object.entries(config)
      .map(([k, v]) => `${k}='${v}'`)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  check(
    'Secret QA environment remains ignored',
    execFileSync('git', ['check-ignore', file], { encoding: 'utf8' }).trim() ===
      file,
  );
  command('validate');
  dc(['stop', 'caddy', 'web', 'worker']);
  command('initialize');
  const start = performance.now();
  command('start');
  evidence.startupMilliseconds = performance.now() - start;
  phase = 'gateway';
  for (const path of [
    '/',
    '/health',
    '/health?ready=1',
    '/api/research',
    '/api/operations',
    '/api/markets',
    '/api/tokens',
    '/api/wallets',
    '/api/events',
    '/api/macro',
    '/api/intelligence',
    '/api/analyst',
  ])
    check(
      `Unauthenticated ${path} rejected`,
      (await http(path, { auth: false })).status === 401,
    );
  const home = await http('/');
  const chunk = home.body.match(/src="(\/_next\/static\/[^"?]+\.js)/)?.[1];
  check(
    'Static assets require authentication',
    home.status === 200 &&
      chunk &&
      (await http(chunk, { auth: false })).status === 401,
  );
  const health = await ready();
  check(
    'Authenticated HTTPS readiness',
    health.status === 200 && json(health).ready,
  );
  check(
    'Security headers',
    health.headers['x-content-type-options'] === 'nosniff' &&
      health.headers['x-frame-options'] === 'DENY' &&
      health.headers['strict-transport-security']?.includes('31536000'),
  );
  const redirect = await fetch('http://127.0.0.1:18080/health', {
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
  });
  check(
    'HTTP redirects to HTTPS',
    [301, 302, 307, 308].includes(redirect.status) &&
      redirect.headers.get('location')?.startsWith('https://'),
  );
  const invalid = await http('/api/research', {
    method: 'POST',
    headers: {
      Origin: 'https://foreign.example',
      'Content-Type': 'application/json',
    },
    body: {},
  });
  check('Foreign origin blocked under HTTPS', invalid.status === 403);
  check(
    'Exact origin reaches strict validation',
    (await post({})).status === 400,
  );
  phase = 'records';
  let existing = json(await http('/api/research'));
  if (!existing.notes.some((n) => n.title === 'Recovery procedure'))
    check(
      'Persist real operator procedure',
      (
        await post({
          action: 'SAVE_NOTE',
          title: 'Recovery procedure',
          asset: 'SOL',
          body: 'Operator procedure: verify timestamps, independent risks and missing evidence; restore and compare immutable reports. This is not a market observation.',
        })
      ).status === 200,
    );
  if (!existing.watchlists.some((n) => n.title === 'Recovery watchlist'))
    check(
      'Persist bounded watchlist',
      (await post({ action: 'CREATE_WATCHLIST', title: 'Recovery watchlist' }))
        .status === 200,
    );
  if (
    !existing.reports.some((n) => n.title === 'Missing market and risk audit')
  )
    check(
      'Capture real unavailable evidence without a model',
      (
        await post({
          action: 'CAPTURE_REPORT',
          title: 'Missing market and risk audit',
          query: {
            asset: 'SOL',
            question: 'Which verified evidence is unavailable?',
            tools: ['market', 'risk'],
          },
        })
      ).status === 200,
    );
  existing = json(await http('/api/research'));
  const report = existing.reports.find(
    (r) => r.title === 'Missing market and risk audit',
  );
  const detail = json(await http('/api/research/report?id=' + report.id));
  check(
    'Frozen report integrity and honest missing evidence',
    detail.digest === report.digest &&
      detail.memo.confidence === 'INSUFFICIENT',
  );
  phase = 'roles';
  check(
    'Runtime roles cannot assume administrator',
    sql(
      "SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR pg_has_role(oid,'terminal_admin','MEMBER'))::text FROM pg_roles WHERE rolname='terminal_web'",
    ) === 'false' &&
      sql(
        "SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR pg_has_role(oid,'terminal_admin','MEMBER'))::text FROM pg_roles WHERE rolname='terminal_worker'",
      ) === 'false',
  );
  check(
    'Web can read, but cannot create schema or mutate provider evidence',
    sql('SELECT 1', 'terminal_web') === '1' &&
      denied('CREATE TABLE forbidden_qa(id int)', 'terminal_web') &&
      denied("UPDATE provider_health SET status='HEALTHY'", 'terminal_web'),
  );
  check(
    'Worker cannot modify notes or frozen reports',
    denied("UPDATE research_notes SET body='forbidden'", 'terminal_worker') &&
      denied(
        "UPDATE report_snapshots SET title='forbidden'",
        'terminal_worker',
      ),
  );
  phase = 'storage fixture';
  const actual = json(await http('/api/operations')).observation;
  check(
    'Real required filesystem measurements available',
    actual?.enabled &&
      actual.disks.length === 2 &&
      ['NORMAL', 'WARNING', 'URGENT'].includes(actual.state),
  );
  const fixture = {
    ...actual,
    observedAt: new Date().toISOString(),
    databaseBytes: 8 * 1024 ** 3,
    state: 'PROTECTED',
    reasons: ['SYNTHETIC STORAGE GUARD QA ONLY'],
  };
  sql(
    `UPDATE operations_status SET observation='${JSON.stringify(fixture).replaceAll("'", "''")}'::jsonb WHERE id='primary'`,
  );
  check(
    'Protective fixture blocks mutations and keeps reads available',
    (await post({ action: 'CREATE_WATCHLIST', title: 'Should not persist' }))
      .status === 503 && (await http('/api/research')).status === 200,
  );
  sql(
    `UPDATE operations_status SET observation='${JSON.stringify(actual).replaceAll("'", "''")}'::jsonb WHERE id='primary'`,
  );
  phase = 'worker recovery';
  const before = records(),
    worker = dc(['ps', '-q', 'worker']);
  const shutdown = performance.now();
  dc(['stop', 'worker']);
  evidence.workerShutdownMilliseconds = performance.now() - shutdown;
  const stopped = JSON.parse(docker(['inspect', worker]))[0];
  check(
    'Worker graceful exit without OOM',
    stopped.State.ExitCode === 0 && !stopped.State.OOMKilled,
  );
  check(
    'Own heartbeat removed',
    sql('SELECT count(*) FROM worker_heartbeats') === '0',
  );
  check(
    'Stopped worker fails readiness',
    (await http('/health?ready=1')).status === 503,
  );
  dc(['up', '-d', 'worker', '--wait']);
  await ready();
  phase = 'database recovery';
  dc(['stop', 'postgres']);
  const outage = await http('/health?ready=1');
  check(
    'Database outage sanitized and unready',
    outage.status === 503 &&
      json(outage).dependencies.database === 'UNAVAILABLE' &&
      !outage.body.includes(config.POSTGRES_PASSWORD),
  );
  dc(['up', '-d', 'postgres', '--wait']);
  await ready();
  check(
    'Recovery preserves research records and migrations',
    JSON.stringify(before) === JSON.stringify(records()),
  );
  check(
    'Report digest survives recovery',
    json(await http('/api/research/report?id=' + report.id)).digest ===
      report.digest,
  );
  phase = 'backup restore';
  command('backup');
  command('verify-restore');
  evidence.restore = JSON.parse(
    await readFile('data/operations/restore-verification.json', 'utf8'),
  );
  check(
    'Real dump restores all migrations and research records',
    evidence.restore.counts.migrations === 12 &&
      evidence.restore.counts.reports >= 1 &&
      evidence.restore.counts.notes >= 1 &&
      evidence.restore.counts.watchlists >= 1,
  );
  check(
    'Disposable restore leaves production database intact',
    sql(
      "SELECT count(*) FROM pg_database WHERE datname='terminal_restore_test'",
    ) === '0',
  );
  phase = 'resources';
  const ids = dc(['ps', '-q']).split(/\r?\n/),
    containers = JSON.parse(docker(['inspect', ...ids]));
  check(
    'Exactly four healthy services',
    containers.length === 4 &&
      containers.every((c) => c.State.Health.Status === 'healthy'),
  );
  check(
    'Only Caddy has loopback QA public ports',
    containers.every((c) =>
      c.Config.Labels['com.docker.compose.service'] === 'caddy'
        ? Object.values(c.HostConfig.PortBindings).every((b) =>
            b.every((x) => x.HostIp === '127.0.0.1'),
          )
        : Object.keys(c.HostConfig.PortBindings ?? {}).length === 0,
    ),
  );
  check(
    'Bounded memory, CPU, restart and logs',
    containers.every(
      (c) =>
        c.HostConfig.Memory > 0 &&
        c.HostConfig.NanoCpus > 0 &&
        c.HostConfig.RestartPolicy.Name === 'unless-stopped' &&
        c.HostConfig.LogConfig.Config['max-size'] === '10m' &&
        c.HostConfig.LogConfig.Config['max-file'] === '3',
    ),
  );
  check(
    'Application containers are non-root and read-only',
    containers
      .filter((c) =>
        ['web', 'worker'].includes(
          c.Config.Labels['com.docker.compose.service'],
        ),
      )
      .every((c) => c.Config.User === 'node' && c.HostConfig.ReadonlyRootfs),
  );
  evidence.services = containers.map((c) => ({
    service: c.Config.Labels['com.docker.compose.service'],
    memoryLimit: c.HostConfig.Memory,
    cpuLimit: c.HostConfig.NanoCpus / 1e9,
  }));
  evidence.memorySnapshot = docker([
    'stats',
    '--no-stream',
    '--format',
    '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}',
    ...ids,
  ]).split(/\r?\n/);
  evidence.databaseBytes = Number(
    sql('SELECT pg_database_size(current_database())'),
  );
  for (const path of [
    '/health?ready=1',
    '/api/markets',
    '/api/research',
    '/api/operations',
  ])
    for (let i = 0; i < 3; i++) {
      const r = await http(path);
      check(`Bounded ${path} sample ${i + 1}`, r.status === 200);
      evidence.latencies.push({ path, milliseconds: Math.round(r.ms) });
    }
  console.log(
    'Production-like operational verification complete. No VPS or public TLS deployment.',
  );
}
try {
  await run();
  await writeFile(
    '.work/production-verification.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
} catch {
  evidence.failedPhase = phase;
  await writeFile(
    '.work/production-verification.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.error(`Production QA failed at ${phase}; no secret details printed.`);
  process.exitCode = 1;
}
