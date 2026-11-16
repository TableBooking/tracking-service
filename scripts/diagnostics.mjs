import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import amqp from 'amqplib';
if (existsSync('.env')) process.loadEnvFile('.env');
const mode = process.argv[2];
try {
  if (mode === 'db') {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DB_SSL_ENABLED === 'false'
          ? false
          : {
              rejectUnauthorized: true,
              ...(process.env.DB_SSL_CA_PATH
                ? { ca: readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
                : {}),
            },
      connectionTimeoutMillis: 10000,
    });
    try {
      await c.connect();
      await c.query('SELECT 1');
    } finally {
      await c.end();
    }
  } else if (mode === 'broker') {
    const c = await amqp.connect(process.env.RABBITMQ_URL);
    await c.close();
  } else throw new Error('usage');
  console.log(mode + ' connection OK');
} catch {
  console.error(
    'Connection check failed; verify URL, DNS, credentials and CA. No secret values logged.',
  );
  process.exitCode = 1;
}
