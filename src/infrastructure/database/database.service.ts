import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { config, ssl, namespace } from '../../config/env.js';
@Injectable()
export class Database implements OnModuleDestroy {
  readonly pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: ssl(),
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
  });
  constructor() {
    this.pool.on('error', () => {
      console.error('Database idle connection failed');
    });
  }
  async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async ready() {
    const result = await this.pool.query('SELECT version FROM ' + namespace + '.schema_migrations');
    if (!result.rows.some((row) => row.version === '001_init.sql'))
      throw new Error('Migration required');
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
