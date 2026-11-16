import { ssl } from './ssl.js';
export { ssl };
import { z } from 'zod';
export const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3004),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  DB_SSL_ENABLED: z.enum(['true', 'false']).default('true'),
  DB_SSL_CA_PATH: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_ISSUER: z.string().default('restaurant-auth'),
  JWT_AUDIENCE: z.string().default('restaurant-api'),
  RABBITMQ_URL: z.string().min(1),
  CONSUMER_ENABLED: z.enum(['true', 'false']).default('true'),
  MQ_EVENTS_EXCHANGE: z.string().default('restaurant.events'),
  MQ_ROUTING_KEY: z.string().default('booking.state-changed.v1'),
  MQ_QUEUE: z.string().default('tracking.lifecycle.q'),
  MQ_DLX: z.string().default('restaurant.dlx'),
  MQ_DLQ: z.string().default('tracking.lifecycle.q.dlq'),
  MQ_RETRY_EXCHANGE: z.string().default('restaurant.retry'),
  MQ_PREFETCH: z.coerce.number().int().positive().default(20),
  DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  DELIVERY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  DELIVERY_LEASE_MS: z.coerce.number().int().min(60000).default(60000),
  LOG_LEVEL: z.string().default('info'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('TableBooking <demo@example.test>'),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_REQUIRE_TLS: z.enum(['true', 'false']).default('false'),
  DELIVERY_WORKER_ENABLED: z.enum(['true', 'false']).default('false'),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    'Invalid configuration fields: ' + parsed.error.issues.map((i) => i.path.join('.')).join(', '),
  );
export const config = parsed.data;
if (
  config.DELIVERY_WORKER_ENABLED === 'true' &&
  process.env.NODE_ENV === 'production' &&
  (!config.SMTP_USER || !config.SMTP_PASSWORD)
)
  throw new Error('SMTP credentials required for production worker');
export const namespace = 'tracking';
