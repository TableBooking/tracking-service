import pg from 'pg';
import { readFileSync } from 'node:fs';
const url = process.env.BOOTSTRAP_DATABASE_URL,
  appPassword = process.env.APP_DB_PASSWORD,
  migrationPassword = process.env.MIGRATOR_DB_PASSWORD;
if (!url || !appPassword || !migrationPassword)
  throw new Error('BOOTSTRAP_DATABASE_URL, APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD required');
const c = new pg.Client({
  connectionString: url,
  ssl:
    process.env.DB_SSL_ENABLED === 'false'
      ? false
      : {
          rejectUnauthorized: true,
          ...(process.env.DB_SSL_CA_PATH
            ? { ca: readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
            : {}),
        },
});
await c.connect();
try {
  await c.query('BEGIN');
  for (const [role, password] of [
    ['tracking_app', appPassword],
    ['tracking_migrator', migrationPassword],
  ]) {
    if (!(await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])).rowCount) {
      const sql = await c.query(
        "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text)",
        [role, password],
      );
      await c.query(sql.rows[0].format);
    }
  }
  await c.query('CREATE SCHEMA IF NOT EXISTS tracking AUTHORIZATION tracking_migrator');
  await c.query('GRANT USAGE ON SCHEMA tracking TO tracking_app');
  await c.query(
    'ALTER DEFAULT PRIVILEGES FOR ROLE tracking_migrator IN SCHEMA tracking GRANT SELECT,INSERT,UPDATE ON TABLES TO tracking_app',
  );
  await c.query(
    'ALTER DEFAULT PRIVILEGES FOR ROLE tracking_migrator IN SCHEMA tracking GRANT USAGE,SELECT ON SEQUENCES TO tracking_app',
  );
  await c.query('COMMIT');
  console.log('Bootstrap complete; no passwords printed');
} catch {
  await c.query('ROLLBACK');
  throw new Error('Bootstrap failed; check administrator privileges and configuration');
} finally {
  await c.end();
}
