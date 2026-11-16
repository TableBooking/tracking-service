import { existsSync } from 'node:fs';
import amqp from 'amqplib';
if (existsSync('.env')) process.loadEnvFile('.env');
const c = await amqp.connect(process.env.RABBITMQ_URL);
try {
  const ch = await c.createChannel();
  await ch.assertExchange('restaurant.events', 'topic', { durable: true });
  await ch.assertExchange('restaurant.retry', 'direct', { durable: true });
  await ch.assertExchange('restaurant.dlx', 'direct', { durable: true });
  for (const name of ['tracking', 'notification']) {
    const q = name + '.lifecycle.q';
    await ch.assertQueue(q, { durable: true });
    await ch.bindQueue(q, 'restaurant.events', 'booking.state-changed.v1');
    await ch.assertQueue(q + '.dlq', { durable: true });
    await ch.bindQueue(q + '.dlq', 'restaurant.dlx', q);
    for (const delay of [5000, 30000, 120000]) {
      const retry = q + '.retry.' + delay;
      await ch.assertQueue(retry, {
        durable: true,
        arguments: {
          'x-message-ttl': delay,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': q,
        },
      });
      await ch.bindQueue(retry, 'restaurant.retry', retry);
    }
  }
  await ch.close();
  console.log('Both lifecycle queues provisioned');
} finally {
  await c.close();
}
