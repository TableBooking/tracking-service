import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Database } from './database.js';
import { AccessGuard, type Principal } from './auth.js';
import { eventHash, type StateEvent } from './event.js';
@Injectable()
export class DomainConsumer {
  constructor(private readonly db: Database) {}
  async handle(ev: StateEvent) {
    await this.db.tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ev.aggregateId]);
      const inbox = await c.query(
        'INSERT INTO tracking.inbox_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [ev.eventId],
      );
      if (!inbox.rowCount) return;
      const hash = eventHash(ev);
      const old = await c.query(
        'SELECT payload_hash FROM tracking.reservation_history WHERE booking_id=$1 AND aggregate_version=$2',
        [ev.aggregateId, ev.aggregateVersion],
      );
      if (old.rowCount) {
        if (old.rows[0].payload_hash !== hash) throw new Error('Conflicting aggregate version');
        return;
      }
      await c.query(
        'INSERT INTO tracking.reservation_history(event_id,booking_id,customer_id,aggregate_version,previous_state,state,actor_id,reason,occurred_at,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          ev.eventId,
          ev.aggregateId,
          ev.data.customerId,
          ev.aggregateVersion,
          ev.data.previousState,
          ev.data.state,
          ev.data.actorId,
          ev.data.reason ?? null,
          ev.occurredAt,
          hash,
        ],
      );
      await c.query(
        'INSERT INTO tracking.reservation_projection(booking_id,customer_id,state,aggregate_version,slot_id,party_size,table_id,last_event_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(booking_id) DO UPDATE SET state=excluded.state,aggregate_version=excluded.aggregate_version,slot_id=excluded.slot_id,party_size=excluded.party_size,table_id=excluded.table_id,last_event_at=excluded.last_event_at,updated_at=now() WHERE reservation_projection.aggregate_version<excluded.aggregate_version',
        [
          ev.aggregateId,
          ev.data.customerId,
          ev.data.state,
          ev.aggregateVersion,
          ev.data.slotId,
          ev.data.partySize,
          ev.data.tableId ?? null,
          ev.occurredAt,
        ],
      );
      await c.query(
        'UPDATE tracking.reservation_projection p SET gap_detected=(SELECT count(*) FROM tracking.reservation_history h WHERE h.booking_id=p.booking_id)<p.aggregate_version WHERE p.booking_id=$1',
        [ev.aggregateId],
      );
    });
  }
}
@Controller('api/tracking/bookings')
@UseGuards(AccessGuard)
export class DomainController {
  constructor(private readonly db: Database) {}
  private async owned(id: string, user: Principal, query = this.db.pool.query.bind(this.db.pool)) {
    z.uuid().parse(id);
    const { rows } = await query(
      "SELECT * FROM tracking.reservation_projection WHERE booking_id=$1 AND ($2<>'CUSTOMER' OR customer_id=$3)",
      [id, user.role, user.sub],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
  @Get(':id/status') async status(@Param('id') id: string, @Req() req: { user: Principal }) {
    const p = await this.owned(id, req.user);
    return {
      bookingId: p.booking_id,
      customerId: p.customer_id,
      slotId: p.slot_id,
      partySize: p.party_size,
      state: p.state,
      version: p.aggregate_version,
      ...(p.table_id ? { tableId: p.table_id } : {}),
      updatedAt: p.updated_at.toISOString(),
    };
  }
  @Get(':id/timeline') async timeline(@Param('id') id: string, @Req() req: { user: Principal }) {
    return this.db.tx(async (c) => {
      await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const p = await this.owned(id, req.user, c.query.bind(c));
      const { rows } = await c.query(
        'SELECT * FROM tracking.reservation_history WHERE booking_id=$1 ORDER BY aggregate_version',
        [id],
      );
      return {
        bookingId: id,
        currentState: p.state,
        version: p.aggregate_version,
        gapDetected: p.gap_detected,
        events: rows.map((h) => ({
          eventId: h.event_id,
          bookingId: id,
          state: h.state,
          aggregateVersion: h.aggregate_version,
          occurredAt: h.occurred_at.toISOString(),
          ...(h.previous_state ? { previousState: h.previous_state } : {}),
          ...(h.actor_id ? { actorId: h.actor_id } : {}),
          ...(h.reason ? { reason: h.reason } : {}),
        })),
      };
    });
  }
}
