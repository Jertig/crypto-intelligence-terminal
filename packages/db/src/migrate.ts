import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './index';

export async function runMigrations(url: string) {
  const connection = createDatabase(url);
  try {
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(
        new URL('../migrations', import.meta.url),
      ),
    });
  } finally {
    await connection.client.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required to run migrations.');
  runMigrations(databaseUrl).catch(() => {
    console.error(
      'Migration failed. Check database connectivity and the migration history.',
    );
    process.exitCode = 1;
  });
}
