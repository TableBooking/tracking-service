import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
process.env.DATABASE_URL='postgresql://localhost/test';process.env.RABBITMQ_URL='amqp://localhost';process.env.JWT_PUBLIC_KEY_PATH='test';process.env.DB_SSL_ENABLED='false';process.env.CONSUMER_ENABLED='false';process.env.DELIVERY_WORKER_ENABLED='false';
const {Database}=await import('../src/database.js');
const {DomainConsumer,DomainController}=await import('../src/domain.js');
const {parseEvent}=await import('../src/event.js');
const customer='11111111-1111-4111-8111-111111111111';const booking='44444444-4444-4444-8444-444444444444';
const principal={user:{sub:customer,role:'CUSTOMER' as const}};
function event(version:number,state:string){return parseEvent({eventId:randomUUID(),eventType:'booking.state-changed.v1',schemaVersion:1,aggregateId:booking,aggregateVersion:version,occurredAt:'2026-12-01T10:00:00Z',producer:'operations-service',correlationId:randomUUID(),data:{customerId:customer,email:'guest@example.test',slotId:'2026-12-02-dinner',partySize:4,state,previousState:version===1?null:'REQUESTED',actorId:'system'}});}
test('tracking database integration',async t=>{
 const pg=new PGlite();await pg.exec('CREATE SCHEMA tracking');await pg.exec(await readFile('migrations/001_init.sql','utf8').then(s=>s.replace('SET LOCAL search_path TO tracking','SET search_path TO tracking')));
 const db=new Database();const query=async(sql:string,params?:unknown[])=>{const result=await pg.query(sql,params);return {...result,rowCount:result.affectedRows??result.rows.length};};Object.defineProperty(db,'pool',{value:{query,connect:async()=>({query,release(){}}),end:async()=>{}}});
 const consumer=new DomainConsumer(db);const api=new DomainController(db);
 try{
await t.test('duplicate, gaps, out-of-order and ownership',async()=>{const first=event(1,'REQUESTED');await consumer.handle(first);await consumer.handle(first);await consumer.handle(event(3,'CANCELLED'));let timeline=await api.timeline(booking,principal);assert.equal(timeline.events.length,2);assert.equal(timeline.gapDetected,true);await consumer.handle(event(2,'CONFIRMED'));timeline=await api.timeline(booking,principal);assert.deepEqual(timeline.events.map(e=>e.aggregateVersion),[1,2,3]);assert.equal(timeline.gapDetected,false);assert.equal((await api.status(booking,principal)).version,3);assert.equal((await api.status(booking,principal)).slotId,'2026-12-02-dinner');await assert.rejects(api.status(booking,{user:{sub:randomUUID(),role:'CUSTOMER'}}));});
await t.test('conflicting version rolls back inbox and history',async()=>{const conflict=event(2,'REJECTED');await assert.rejects(consumer.handle(conflict));const result=await query('SELECT * FROM tracking.inbox_events WHERE event_id=$1',[conflict.eventId]);assert.equal(result.rows.length,0);assert.equal((await api.timeline(booking,principal)).events.length,3);});
}finally{await consumer.handle(event(3,'CANCELLED')).catch(()=>{});await pg.close();}
});
