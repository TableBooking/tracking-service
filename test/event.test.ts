import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvent, eventHash } from '../src/infrastructure/messaging/state-event.js';
const ev = {
  eventId: '88888888-8888-4888-8888-888888888888',
  eventType: 'booking.state-changed.v1',
  schemaVersion: 1,
  aggregateId: '44444444-4444-4444-8444-444444444444',
  aggregateVersion: 1,
  occurredAt: '2026-12-01T10:00:00Z',
  producer: 'operations-service',
  correlationId: '99999999-9999-4999-8999-999999999999',
  data: {
    customerId: '11111111-1111-4111-8111-111111111111',
    email: 'guest@example.test',
    slotId: '2026-12-02-dinner',
    partySize: 4,
    state: 'REQUESTED',
    previousState: null,
    actorId: 'system',
  },
};
test('accepts initial null previous state; rejects unsupported fields and invalid identities', () => {
  assert.equal(parseEvent(ev).aggregateVersion, 1);
  assert.throws(() => parseEvent({ ...ev, extra: true }));
  assert.throws(() => parseEvent({ ...ev, data: { ...ev.data, email: 'invalid' } }));
  assert.throws(() => parseEvent({ ...ev, aggregateVersion: 0 }));
});
test('domain conflict hash ignores delivery identity but detects state changes', () => {
  assert.equal(
    eventHash(parseEvent(ev)),
    eventHash(parseEvent({ ...ev, eventId: '77777777-7777-4777-8777-777777777777' })),
  );
  assert.notEqual(
    eventHash(parseEvent(ev)),
    eventHash(parseEvent({ ...ev, data: { ...ev.data, state: 'CANCELLED' } })),
  );
});
