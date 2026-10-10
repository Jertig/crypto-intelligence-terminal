import { spawn, execFileSync } from 'node:child_process';
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  statfs,
  open,
  rename,
  unlink,
  realpath,
  lstat,
} from 'node:fs/promises';
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative, isAbsolute } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function operationDirectory(qa = false) {
  return join(root, 'data', qa ? 'operations-qa' : 'operations');
}
const budget = 8 * 1024 ** 3;
const archivePattern = /^terminal-\d{4}-\d{2}-\d{2}T\d{6}Z\.dump$/;
export function retainedBackups(names) {
  const entries = [...new Set(names)]
    .filter((n) => archivePattern.test(n))
    .sort()
    .reverse();
  const daily = new Map(),
    weekly = new Map(),
    monthly = new Map();
  for (const n of entries) {
    const date = n.slice(9, 19),
      d = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
      continue;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const keys = [date, monday.toISOString().slice(0, 10), date.slice(0, 7)];
    for (const [m, key, limit] of [
      [daily, keys[0], 7],
      [weekly, keys[1], 4],
      [monthly, keys[2], 3],
    ])
      if (m.size < limit && !m.has(key)) m.set(key, n);
  }
  return [
    ...new Set([...daily.values(), ...weekly.values(), ...monthly.values()]),
  ].sort();
}
export function validateProduction(c, qa = false) {
  const passwords = [
    'POSTGRES_PASSWORD',
    'POSTGRES_WEB_PASSWORD',
    'POSTGRES_WORKER_PASSWORD',
  ].map((k) => c[k]);
  if (
    passwords.some((p) => !p || !/^[A-Za-z0-9_-]{32,128}$/.test(p)) ||
    new Set(passwords).size !== 3
  )
    throw new Error('DISTINCT_STRONG_DATABASE_PASSWORDS_REQUIRED');
  if (
    !/^[A-Za-z0-9_-]{1,40}$/.test(c.ACCESS_USER ?? '') ||
    !/^\$2[aby]\$1[2-4]\$[./A-Za-z0-9]{53}$/.test(c.ACCESS_HASH ?? '')
  )
    throw new Error('BCRYPT_OPERATOR_ACCESS_REQUIRED');
  const u = new URL(c.APP_ORIGIN ?? '');
  if (
    u.protocol !== 'https:' ||
    u.origin !== c.APP_ORIGIN ||
    u.username ||
    u.password ||
    (qa
      ? c.APP_ORIGIN !== 'https://localhost:18443'
      : !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(u.hostname) ||
        u.port !== '')
  )
    throw new Error('EXACT_HTTPS_ORIGIN_REQUIRED');
  for (const key of [
    'WEB_IMAGE',
    'WORKER_IMAGE',
    'POSTGRES_IMAGE',
    'CADDY_IMAGE',
  ])
    if (
      !/^(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64})$/.test(
        c[key] ?? '',
      )
    )
      throw new Error('PINNED_PREBUILT_IMAGES_REQUIRED');
  for (const key of [
    'AI_ANALYST_ENABLED',
    'MARKET_INGESTION_ENABLED',
    'TOKEN_INGESTION_ENABLED',
    'GOPLUS_ENABLED',
  ])
    if (c[key] && !['true', 'false'].includes(c[key]))
      throw new Error('INVALID_BOOLEAN_CONFIG');
  if (c.AI_ANALYST_ENABLED === 'true' && (!c.OPENAI_API_KEY || !c.OPENAI_MODEL))
    throw new Error('MODEL_CONFIGURATION_REQUIRED');
  if (
    qa &&
    (c.MARKET_INGESTION_ENABLED !== 'false' ||
      c.TOKEN_INGESTION_ENABLED !== 'false' ||
      c.OPENAI_API_KEY ||
      c.HELIUS_API_KEY ||
      c.FRED_API_KEY ||
      c.TRACKED_WALLETS)
  )
    throw new Error('ISOLATED_QA_CONFIGURATION_REQUIRED');
  return true;
}
function within(path) {
  const r = relative(root, resolve(path));
  if (r.startsWith('..') || isAbsolute(r))
    throw new Error('PATH_OUTSIDE_PROJECT');
  return resolve(path);
}
async function configuration(args) {
  const qa = args.includes('--qa'),
    index = args.indexOf('--env-file');
  const path = within(
    join(root, index === -1 ? '.env.production' : (args[index + 1] ?? '')),
  );
  const c = parseEnv(await readFile(path, 'utf8'));
  validateProduction(c, qa);
  if (process.platform !== 'win32' && ((await stat(path)).mode & 0o077) !== 0)
    throw new Error('ENV_FILE_MUST_BE_0600');
  execFileSync('git', ['check-ignore', '--quiet', path], {
    cwd: root,
    stdio: 'ignore',
  });
  const compose = [
    'compose',
    '--env-file',
    path,
    '-f',
    'compose.production.yaml',
    ...(qa ? ['-f', 'infra/docker/compose.production-qa.yaml'] : []),
    '-p',
    qa ? 'terminal-production-qa' : 'terminal-production',
  ];
  return { c, compose, env: { ...process.env, ...c }, qa };
}
function run(ctx, args, input, extra = {}) {
  return new Promise((yes, no) => {
    const p = spawn('docker', [...ctx.compose, ...args], {
      cwd: root,
      env: { ...ctx.env, ...extra },
      stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });
    if (input) p.stdin.end(input);
    p.on('error', () => no(new Error('DOCKER_UNAVAILABLE')));
    p.on('close', (code) =>
      code === 0 ? yes() : no(new Error('DOCKER_OPERATION_FAILED')),
    );
  });
}
function sql(ctx, query, database = 'terminal') {
  return execFileSync(
    'docker',
    [
      ...ctx.compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'terminal_admin',
      '-d',
      database,
      '-tAc',
      query,
    ],
    {
      cwd: root,
      env: ctx.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  ).trim();
}
async function digest(path) {
  const h = createHash('sha256');
  for await (const b of createReadStream(path)) h.update(b);
  return h.digest('hex');
}
async function publishStatus(directory, status) {
  const temp = join(directory, 'backup-status.tmp');
  await writeFile(temp, JSON.stringify(status) + '\n', { mode: 0o644 });
  await rename(temp, join(directory, 'backup-status.json'));
}
async function backup(ctx) {
  const directory = operationDirectory(ctx.qa),
    archives = join(directory, 'backups');
  await mkdir(archives, { recursive: true, mode: 0o700 });
  within(await realpath(archives));
  const lock = join(directory, 'backup.lock'),
    handle = await open(lock, 'wx', 0o600);
  let previous = { lastSuccessAt: null, bytes: 0, digest: null, error: null },
    temp;
  try {
    await handle.writeFile(new Date().toISOString());
    try {
      const p = JSON.parse(
        await readFile(join(directory, 'backup-status.json'), 'utf8'),
      );
      if (p.lastSuccessAt && /^[a-f0-9]{64}$/.test(p.digest)) previous = p;
    } catch {
      /* No successful backup recorded yet. */
    }
    const files = await readdir(archives);
    for (const n of files) {
      if (n.endsWith('.partial') && archivePattern.test(n.slice(0, -8))) {
        const s = await lstat(join(archives, n));
        if (Date.now() - s.mtimeMs > 86400000)
          await unlink(within(join(archives, n)));
      }
    }
    const current = await readdir(archives);
    const names = current.filter((n) => archivePattern.test(n));
    let used = 0;
    for (const n of current) used += (await lstat(join(archives, n))).size;
    const fs = await statfs(archives),
      free = fs.bavail * fs.bsize,
      total = fs.blocks * fs.bsize;
    const remaining = Math.min(budget - used, free - total * 0.1);
    if (remaining < 1024 ** 2) throw new Error('BUDGET_EXHAUSTED');
    const date = new Date(),
      stamp = date.toISOString().slice(0, 19).replaceAll(':', '') + 'Z',
      name = `terminal-${stamp}.dump`;
    temp = join(archives, name + '.partial');
    const p = spawn(
      'docker',
      [
        ...ctx.compose,
        'exec',
        '-T',
        'postgres',
        'timeout',
        '120',
        'pg_dump',
        '-U',
        'terminal_admin',
        '-d',
        'terminal',
        '-Fc',
        '--no-owner',
        '--no-privileges',
      ],
      {
        cwd: root,
        env: ctx.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    // Never print pg_dump stderr or credential-bearing configuration.
    p.stderr.resume();
    const finished = new Promise((yes, no) => {
      p.on('error', () => no(new Error('BACKUP_FAILED')));
      p.on('close', (code) =>
        code === 0 ? yes() : no(new Error('BACKUP_FAILED')),
      );
    });
    let bytes = 0;
    const bound = new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > remaining ? new Error('BUDGET_EXHAUSTED') : null,
          chunk,
        );
      },
    });
    const deadline = setTimeout(() => p.kill(), 120000);
    deadline.unref();
    try {
      await Promise.all([
        pipeline(
          p.stdout,
          bound,
          createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
        ),
        finished,
      ]);
    } catch (e) {
      p.kill();
      throw e;
    } finally {
      clearTimeout(deadline);
    }
    if (bytes === 0) throw new Error('BACKUP_FAILED');
    const hash = await digest(temp),
      path = join(archives, name);
    await rename(temp, path);
    temp = undefined;
    await writeFile(path + '.sha256', hash + '\n', { mode: 0o600 });
    await publishStatus(directory, {
      lastSuccessAt: date.toISOString(),
      bytes,
      digest: hash,
      error: null,
    });
    // Prune only our allowlisted archives, only after a complete successful dump.
    const keep = new Set(retainedBackups([...names, name]));
    for (const n of names)
      if (!keep.has(n)) {
        await unlink(within(join(archives, n)));
        await unlink(within(join(archives, n + '.sha256'))).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      }
    console.log(
      JSON.stringify({
        backup: 'SUCCESS',
        bytes,
        retained: keep.size,
        offHost: 'NOT_VERIFIED',
      }),
    );
  } catch (e) {
    await publishStatus(directory, {
      ...previous,
      error:
        e.message === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' : 'BACKUP_FAILED',
    });
    throw new Error('BACKUP_FAILED');
  } finally {
    if (temp)
      await unlink(within(temp)).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    await handle.close();
    await unlink(lock);
  }
}
async function verifyRestore(ctx) {
  const directory = operationDirectory(ctx.qa),
    archives = join(directory, 'backups');
  within(await realpath(archives));
  const names = (await readdir(archives))
      .filter((n) => archivePattern.test(n))
      .sort()
      .reverse(),
    name = names[0];
  if (!name) throw new Error('NO_BACKUP');
  const path = within(join(archives, name)),
    expected = (await readFile(path + '.sha256', 'utf8')).trim();
  if (expected !== (await digest(path))) throw new Error('BACKUP_INTEGRITY');
  if (
    sql(
      ctx,
      "SELECT count(*) FROM pg_database WHERE datname='terminal_restore_test'",
    ) !== '0'
  )
    throw new Error('RESTORE_TEST_DATABASE_ALREADY_EXISTS');
  let created = false;
  try {
    sql(ctx, 'CREATE DATABASE terminal_restore_test');
    created = true;
    const p = spawn(
      'docker',
      [
        ...ctx.compose,
        'exec',
        '-T',
        'postgres',
        'timeout',
        '120',
        'pg_restore',
        '--exit-on-error',
        '--no-owner',
        '--no-privileges',
        '-U',
        'terminal_admin',
        '-d',
        'terminal_restore_test',
      ],
      {
        cwd: root,
        env: ctx.env,
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      },
    );
    p.stderr.resume();
    const finished = new Promise((yes, no) => {
      p.on('error', () => no(new Error('RESTORE_FAILED')));
      p.on('close', (code) =>
        code === 0 ? yes() : no(new Error('RESTORE_FAILED')),
      );
    });
    const deadline = setTimeout(() => p.kill(), 120000);
    deadline.unref();
    try {
      await Promise.all([pipeline(createReadStream(path), p.stdin), finished]);
    } finally {
      clearTimeout(deadline);
    }
    const counts = JSON.parse(
      sql(
        ctx,
        "SELECT json_build_object('migrations',(SELECT count(*) FROM drizzle.__drizzle_migrations),'reports',(SELECT count(*) FROM report_snapshots),'notes',(SELECT count(*) FROM research_notes),'watchlists',(SELECT count(*) FROM watchlists))",
        'terminal_restore_test',
      ),
    );
    const expectedMigrations = JSON.parse(
      readFileSync(
        join(root, 'packages/db/migrations/meta/_journal.json'),
        'utf8',
      ),
    ).entries.length;
    if (counts.migrations !== expectedMigrations)
      throw new Error('RESTORE_MIGRATION_MISMATCH');
    const verified = {
      verifiedAt: new Date().toISOString(),
      archive: name,
      digest: expected,
      counts,
      scope: 'Disposable local restore; off-host recovery not verified',
    };
    await writeFile(
      join(directory, 'restore-verification.json'),
      JSON.stringify(verified) + '\n',
      { mode: 0o644 },
    );
    console.log(JSON.stringify(verified));
  } finally {
    if (created) sql(ctx, 'DROP DATABASE terminal_restore_test');
  }
}
export async function main(args = process.argv.slice(2)) {
  const command = args[0],
    ctx = await configuration(args);
  if (command === 'validate') {
    console.log('Production configuration valid; secret values omitted.');
    return;
  }
  await mkdir(operationDirectory(ctx.qa), { recursive: true, mode: 0o755 });
  if (command === 'initialize') {
    await run(ctx, ['up', '-d', 'postgres', '--wait']);
    const url = `postgresql://terminal_admin:${ctx.c.POSTGRES_PASSWORD}@postgres:5432/terminal`;
    await run(
      ctx,
      [
        'run',
        '--rm',
        '--no-deps',
        '-e',
        'DATABASE_URL',
        'worker',
        'node',
        'dist/migrate.mjs',
      ],
      undefined,
      { DATABASE_URL: url },
    );
    await run(
      ctx,
      ['exec', '-T', 'postgres', 'sh', '-s'],
      await readFile(join(root, 'infra/docker/grant-runtime.sh')),
    );
  } else if (command === 'start')
    await run(ctx, ['up', '-d', '--wait', '--wait-timeout', '120']);
  else if (command === 'backup') await backup(ctx);
  else if (command === 'verify-restore') await verifyRestore(ctx);
  else if (command === 'status')
    console.log(
      sql(
        ctx,
        "SELECT json_build_object('databaseBytes',pg_database_size(current_database()),'operations',(SELECT observation FROM operations_status WHERE id='primary'))",
      ),
    );
  else throw new Error('UNKNOWN_OPERATION');
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.error(
      'Operational command failed. Check configuration, health, capacity and the runbook; secret details omitted.',
    );
    process.exitCode = 1;
  });
