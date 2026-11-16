import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ajv = new Ajv2020.default({ allErrors: true });
addFormats.default(ajv);
const validate = ajv.compile(JSON.parse(readFileSync('contracts/state-event.schema.json', 'utf8')));
export interface StateEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  data: {
    customerId: string;
    email: string;
    slotId: string;
    partySize: number;
    state: string;
    previousState: string | null;
    actorId: string;
    tableId?: string | null;
    reason?: string | null;
    commandId?: string;
  };
}
export function parseEvent(value: unknown): StateEvent {
  if (!validate(value)) throw new Error('Invalid state event schema');
  return value as StateEvent;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}
export function eventHash(event: StateEvent) {
  return createHash('sha256')
    .update(
      canonical({
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
        data: event.data,
      }),
    )
    .digest('hex');
}
