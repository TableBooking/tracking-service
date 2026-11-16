process.env.LOG_LEVEL = 'silent';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SignJWT } from 'jose';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const temp = await mkdtemp(join(tmpdir(), 'tablebooking-test-'));
const keyPath = join(temp, 'public.pem');
await writeFile(keyPath, keys.publicKey.export({ type: 'spki', format: 'pem' }));
process.env.DATABASE_URL = 'postgresql://localhost/test';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.JWT_PUBLIC_KEY_PATH = keyPath;
process.env.DB_SSL_ENABLED = 'false';
process.env.CONSUMER_ENABLED = 'false';
process.env.DELIVERY_WORKER_ENABLED = 'false';
const { Database } = await import('../src/infrastructure/database/database.service.js');
const { DomainConsumer, DomainController } = await import('../src/modules/tracking/tracking.js');
const { parseEvent } = await import('../src/infrastructure/messaging/state-event.js');
const customer = '11111111-1111-4111-8111-111111111111';
const booking = '44444444-4444-4444-8444-444444444444';
const principal = { user: { sub: customer, role: 'CUSTOMER' as const } };
function event(version: number, state: string) {
  return parseEvent({
    eventId: randomUUID(),
    eventType: 'booking.state-changed.v1',
    schemaVersion: 1,
    aggregateId: booking,
    aggregateVersion: version,
    occurredAt: '2026-12-01T10:00:00Z',
    producer: 'operations-service',
    correlationId: randomUUID(),
    data: {
      customerId: customer,
      email: 'guest@example.test',
      slotId: '2026-12-02-dinner',
      partySize: 4,
      state,
      previousState: version === 1 ? null : 'REQUESTED',
      actorId: 'system',
    },
  });
}
test('tracking database integration', async (t) => {
  const pg = new PGlite();
  await pg.exec('CREATE SCHEMA tracking');
  await pg.exec(
    await readFile('migrations/001_init.sql', 'utf8').then((s) =>
      s.replace('SET LOCAL search_path TO tracking', 'SET search_path TO tracking'),
    ),
  );
  const db = new Database();
  const query = async (sql: string, params?: unknown[]) => {
    const result = await pg.query(sql, params);
    return {
      ...result,
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rows.length || result.affectedRows || 0,
    };
  };
  Object.defineProperty(db, 'pool', {
    value: { query, connect: async () => ({ query, release() {} }), end: async () => {} },
  });
  const consumer = new DomainConsumer(db);
  const api = new DomainController(db);
  try {
    await t.test('duplicate, gaps, out-of-order and ownership', async () => {
      const first = event(1, 'REQUESTED');
      await consumer.handle(first);
      await consumer.handle(first);
      await consumer.handle(event(3, 'CANCELLED'));
      let timeline = await api.timeline(booking, principal);
      assert.equal(timeline.events.length, 2);
      assert.equal(timeline.gapDetected, true);
      await consumer.handle(event(2, 'CONFIRMED'));
      timeline = await api.timeline(booking, principal);
      assert.deepEqual(
        timeline.events.map((e) => e.aggregateVersion),
        [1, 2, 3],
      );
      assert.equal(timeline.gapDetected, false);
      assert.equal((await api.status(booking, principal)).version, 3);
      assert.equal((await api.status(booking, principal)).slotId, '2026-12-02-dinner');
      await assert.rejects(api.status(booking, { user: { sub: randomUUID(), role: 'CUSTOMER' } }));
    });
    await t.test('conflicting version rolls back inbox and history', async () => {
      const conflict = event(2, 'REJECTED');
      await assert.rejects(consumer.handle(conflict));
      const result = await query('SELECT * FROM tracking.inbox_events WHERE event_id=$1', [
        conflict.eventId,
      ]);
      assert.equal(result.rows.length, 0);
      assert.equal((await api.timeline(booking, principal)).events.length, 3);
    });
    if (process.env.RUN_BROKER_TESTS === 'true')
      await t.test('real broker duplicate delivery, bounded retry and isolated DLQ', async () => {
        const url = process.env.BROKER_TEST_URL;
        if (!url) throw new Error('BROKER_TEST_URL required; use a development broker');
        const { config } = await import('../src/config/env.js');
        const { createApplication } = await import('../src/bootstrap.js');
        const { Messaging } = await import('../src/infrastructure/messaging/messaging.service.js');
        const amqp = (await import('amqplib')).default;
        const prefix = 'tablebooking.test.' + randomUUID();
        config.RABBITMQ_URL = url;
        config.MQ_EVENTS_EXCHANGE = prefix + '.events';
        config.MQ_RETRY_EXCHANGE = prefix + '.retry';
        config.MQ_DLX = prefix + '.dlx';
        config.MQ_QUEUE = prefix + '.queue';
        config.MQ_DLQ = prefix + '.dlq';
        config.MQ_RETRY_DELAYS_MS = [20, 30, 50];
        config.MQ_MAX_RETRIES = 3;
        const app = await createApplication();
        const applicationDb = app.get(Database);
        await applicationDb.pool.end();
        Object.defineProperty(applicationDb, 'pool', { value: db.pool });
        const messaging = app.get(Messaging);
        const connection = await amqp.connect(url);
        const ch = await connection.createConfirmChannel();
        const wait = async (check: () => Promise<boolean>) => {
          const deadline = Date.now() + 15000;
          while (!(await check())) {
            if (Date.now() > deadline) throw new Error('Broker integration timeout');
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        };
        try {
          config.CONSUMER_ENABLED = 'true';
          messaging.onModuleInit();
          await wait(async () => messaging.connected);
          const ev = { ...event(1, 'REQUESTED'), aggregateId: randomUUID() };
          for (let i = 0; i < 2; i++)
            ch.publish(
              config.MQ_EVENTS_EXCHANGE,
              config.MQ_ROUTING_KEY,
              Buffer.from(JSON.stringify(ev)),
              { persistent: true },
            );
          await ch.waitForConfirms();
          await wait(
            async () =>
              Number(
                (
                  await query(
                    'SELECT count(*) AS count FROM tracking.reservation_history WHERE event_id=$1',
                    [ev.eventId],
                  )
                ).rows[0]?.count,
              ) === 1,
          );
          ch.publish(config.MQ_EVENTS_EXCHANGE, config.MQ_ROUTING_KEY, Buffer.from('{bad json'), {
            persistent: true,
          });
          await ch.waitForConfirms();
          await wait(async () => {
            const message = await ch.get(config.MQ_DLQ, { noAck: false });
            if (!message) return false;
            assert.equal(message.content.toString(), '{bad json');
            assert.equal(message.properties.headers?.['x-retry-count'], 4);
            ch.ack(message);
            return true;
          });
        } finally {
          config.CONSUMER_ENABLED = 'false';
          await app.close();
          for (const queue of [
            config.MQ_QUEUE,
            config.MQ_DLQ,
            ...[20, 30, 50].map((delay) => config.MQ_QUEUE + '.retry.' + delay),
          ])
            await ch.deleteQueue(queue);
          for (const exchange of [
            config.MQ_EVENTS_EXCHANGE,
            config.MQ_RETRY_EXCHANGE,
            config.MQ_DLX,
          ])
            await ch.deleteExchange(exchange);
          await ch.close();
          await connection.close();
        }
      });
    await t.test('HTTP authentication, validation and gateway contract', async () => {
      const { createApplication } = await import('../src/bootstrap.js');
      const app = await createApplication();
      const applicationDb = app.get(Database);
      await applicationDb.pool.end();
      Object.defineProperty(applicationDb, 'pool', { value: db.pool });
      await app.listen(0, '127.0.0.1');
      const target = await app.getUrl();
      let gateway: { close: () => Promise<void> } | undefined;
      const sign = (sub = customer, audience = 'restaurant-api') =>
        new SignJWT({ sub, role: 'CUSTOMER' })
          .setProtectedHeader({ alg: 'RS256' })
          .setIssuer('restaurant-auth')
          .setAudience(audience)
          .setExpirationTime('5m')
          .sign(keys.privateKey);
      try {
        let base = target;
        if (process.env.RUN_GATEWAY_TESTS === 'true') {
          const module = await import(
            pathToFileURL(resolve('../Api-gateway/dist/bootstrap.js')).href
          );
          const gw = await module.createApplication({
            NODE_ENV: 'test',
            LOG_LEVEL: 'silent',
            JWT_PUBLIC_KEY_PATH: keyPath,
            TRACKING_SERVICE_URL: target,
            NOTIFICATION_SERVICE_URL: target,
            RATE_LIMIT_MAX: '1000',
          });
          await gw.listen(0, '127.0.0.1');
          base = await gw.getUrl();
          gateway = gw;
        }
        const token = await sign();
        const headers = { authorization: 'Bearer ' + token };
        const path = '/api/tracking/bookings/' + booking + '/timeline';
        assert.equal((await fetch(base + path)).status, 401);
        assert.equal(
          (
            await fetch(base + path, {
              headers: { authorization: 'Bearer ' + (await sign(customer, 'wrong')) },
            })
          ).status,
          401,
        );
        const response = await fetch(base + path, { headers });
        assert.equal(response.status, 200);
        assert.ok(response.headers.get('x-request-id'));
        assert.equal(((await response.json()) as { version: number }).version, 3);
        assert.equal(
          (await fetch(base + '/api/tracking/bookings/' + booking + '/status', { headers })).status,
          200,
        );
        assert.equal(
          (
            await fetch(base + path, {
              headers: { authorization: 'Bearer ' + (await sign(randomUUID())) },
            })
          ).status,
          404,
        );
      } finally {
        await gateway?.close();
        await app.close();
      }
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
    await consumer.handle(event(3, 'CANCELLED')).catch(() => {});
    await pg.close();
  }
});
