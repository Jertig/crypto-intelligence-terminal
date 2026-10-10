import { readFile, stat } from 'node:fs/promises';
import { createDatabase } from '@terminal/db';
import { importEvents, computeEventImpacts } from '@terminal/db/events';
import { readEnvironment } from '@terminal/domain/environment';
const file = process.argv[2];
if (!file || process.argv.length !== 3)
  throw new Error('Provide one sourced event JSON file');
if ((await stat(file)).size > 128 * 1024) throw new Error('EVENT_FILE_LIMIT');
const config = readEnvironment(process.env, true);
const connection = createDatabase(config.DATABASE_URL);
try {
  const events = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(events)) throw new Error('Expected event array');
  const count = await importEvents(connection, events);
  await computeEventImpacts(connection);
  console.info(`Imported ${count} sourced events; impact evidence refreshed.`);
} catch {
  console.error(
    'Event import rejected. Check documented schema, immutable IDs and database availability.',
  );
  process.exitCode = 1;
} finally {
  await connection.client.end({ timeout: 5 });
}
