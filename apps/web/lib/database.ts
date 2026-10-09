import { createDatabase, type DatabaseConnection } from '@terminal/db';
import { readEnvironment } from '@terminal/domain/environment';

let connection: DatabaseConnection | undefined;
export function configuredDatabase() {
  const config = readEnvironment(process.env);
  return config.DATABASE_URL
    ? (connection ??= createDatabase(config.DATABASE_URL))
    : null;
}
