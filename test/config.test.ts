import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'postgresql://localhost/test';
process.env.RABBITMQ_URL = 'amqp://localhost';
process.env.JWT_PUBLIC_KEY_PATH = 'test-key';
const { schema } = await import('../src/config/env.js');
test('rejects missing infrastructure credentials and invalid port', () => {
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ ...process.env, PORT: '0' }).success, false);
});
