import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import amqp from 'amqplib';
import { config } from './config.js';
import { DomainConsumer } from './domain.js';
import { parseEvent } from './event.js';
@Injectable()
export class Messaging implements OnModuleInit, OnModuleDestroy {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private stopping = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly consumer: DomainConsumer,
    private readonly log: PinoLogger,
  ) {}
  onModuleInit() {
    if (config.CONSUMER_ENABLED === 'true') void this.start();
  }
  private async start() {
    try {
      const conn = await amqp.connect(config.RABBITMQ_URL);
      this.connection = conn;
      conn.on('error', () => this.log.warn('Broker connection error'));
      conn.on('close', () => {
        if (!this.stopping) this.schedule();
      });
      const ch = await conn.createConfirmChannel();
      this.channel = ch;
      ch.on('error', () => this.log.warn('Broker channel error'));
      ch.on('close', () => {
        if (!this.stopping) void conn.close().catch(() => {});
      });
      const queue = config.MQ_QUEUE;
      await ch.assertExchange(config.MQ_EVENTS_EXCHANGE, 'topic', { durable: true });
      await ch.assertExchange(config.MQ_RETRY_EXCHANGE, 'direct', { durable: true });
      await ch.assertExchange(config.MQ_DLX, 'direct', { durable: true });
      await ch.assertQueue(queue, { durable: true });
      await ch.bindQueue(queue, config.MQ_EVENTS_EXCHANGE, config.MQ_ROUTING_KEY);
      await ch.assertQueue(config.MQ_DLQ, { durable: true });
      await ch.bindQueue(config.MQ_DLQ, config.MQ_DLX, queue);
      for (const delay of [5000, 30000, 120000]) {
        const retry = queue + '.retry.' + delay;
        await ch.assertQueue(retry, {
          durable: true,
          arguments: {
            'x-message-ttl': delay,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': queue,
          },
        });
        await ch.bindQueue(retry, config.MQ_RETRY_EXCHANGE, retry);
      }
      await ch.prefetch(config.MQ_PREFETCH);
      await ch.consume(
        queue,
        async (msg) => {
          if (!msg) return;
          try {
            await this.consumer.handle(parseEvent(JSON.parse(msg.content.toString())));
            ch.ack(msg);
          } catch {
            const attempt = Number(msg.properties.headers?.['x-retry-count'] ?? 0);
            const delay = [5000, 30000, 120000][attempt];
            try {
              await new Promise<void>((resolve, reject) => {
                ch.publish(
                  delay === undefined ? config.MQ_DLX : config.MQ_RETRY_EXCHANGE,
                  delay === undefined ? queue : queue + '.retry.' + delay,
                  msg.content,
                  {
                    persistent: true,
                    contentType: 'application/json',
                    headers: { ...msg.properties.headers, 'x-retry-count': attempt + 1 },
                  },
                  (err) => (err ? reject(err) : resolve()),
                );
              });
              ch.ack(msg);
              this.log.warn({ attempt: attempt + 1, queue }, 'Event scheduled for retry or DLQ');
            } catch {
              await conn.close().catch(() => {});
            }
          }
        },
        { noAck: false },
      );
      this.log.info({ queue }, 'Consumer connected');
    } catch {
      this.log.warn('Broker unavailable; reconnect scheduled');
      await this.connection?.close().catch(() => {});
      this.schedule();
    }
  }
  private schedule() {
    if (this.stopping || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.start();
    }, 5000);
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.channel?.close().catch(() => {});
    await this.connection?.close().catch(() => {});
  }
}
