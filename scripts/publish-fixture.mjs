import { existsSync, readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.argv[2]) throw new Error('Provide a JSON fixture path. Use development broker only.');
const event = JSON.parse(readFileSync(process.argv[2], 'utf8'));
event.eventId ??= randomUUID();
const c = await amqp.connect(process.env.RABBITMQ_URL);
try {
  const ch = await c.createConfirmChannel();
  let returned = false;
  ch.on('return', () => (returned = true));
  await new Promise((resolve, reject) =>
    ch.publish(
      process.env.MQ_EVENTS_EXCHANGE ?? 'restaurant.events',
      'booking.state-changed.v1',
      Buffer.from(JSON.stringify(event)),
      { persistent: true, mandatory: true, contentType: 'application/json' },
      (e) => (e ? reject(e) : resolve()),
    ),
  );
  if (returned) throw new Error('Unroutable fixture: provision consumers first');
  console.log('Published event ' + event.eventId);
  await ch.close();
} finally {
  await c.close();
}
