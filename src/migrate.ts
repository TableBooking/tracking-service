import 'reflect-metadata';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { ssl } from './config/ssl.js';
const namespace = 'tracking';
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL required');
const client = new pg.Client({ connectionString: url, ssl: ssl() });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [namespace + '-migrations']);
  await client.query('CREATE SCHEMA IF NOT EXISTS ' + namespace);
  await client.query(
    'CREATE TABLE IF NOT EXISTS ' +
      namespace +
      '.schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL)',
  );
  for (const file of (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = await readFile('migrations/' + file, 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const old = await client.query(
      'SELECT checksum FROM ' + namespace + '.schema_migrations WHERE version=$1',
      [file],
    );
    if (old.rowCount) {
      if (old.rows[0].checksum !== hash) throw new Error('Migration checksum mismatch: ' + file);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO ' + namespace + '.schema_migrations VALUES($1,$2)', [
      file,
      hash,
    ]);
    console.log('Applied ' + file);
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
