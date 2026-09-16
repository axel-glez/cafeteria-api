import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderPushMessage, pushTokenPattern } from '../src/lib/push-message';

test('avisos contienen el pedido correcto y no incluyen credenciales', () => {
 const payload=orderPushMessage({token:'ExpoPushToken[abcdefghijklmnop]',order_id:'pedido-1',status:'ready',folio:'B-42'});
 assert.equal(payload.channelId,'orders'); assert.match(payload.body!,/listo/);
 assert.deepEqual(payload.data,{orderId:'pedido-1',status:'ready'});
 assert.equal('session_hash' in payload,false);
 assert.ok(pushTokenPattern.test(payload.to)); assert.ok(!pushTokenPattern.test('https://ajeno.example'));
 assert.throws(()=>orderPushMessage({token:payload.to,order_id:'1',status:'invalid',folio:'B-1'}));
});

test('cola: ticket, recibo, token inválido y fallo transitorio', async () => {
 const { accessDb }=await import('../src/lib/access');
 const { drainPushJobs }=await import('../src/lib/push');
 const originalQuery=accessDb.query;
 const originalFetch=globalThis.fetch;
 try {
  for(const mode of ['ticket','receipt','unregistered','retry','wrongSession']) {
   const queries:{sql:string,args:any[]}[]=[]; let claimed=false; let sent=0;
   const job={id:'job',order_id:'order',session_hash:'hash',token:'ExpoPushToken[abcdefghijklmnop]',status:'ready',folio:'B-1',attempts:1,created_at:new Date(),ticket_id:mode==='receipt'?'receipt-1':null};
   (accessDb as any).query=async(sql:string,args:any[]=[])=>{
    queries.push({sql,args});
    if(sql.includes('RETURNING *')) {if(claimed)return {rows:[]};claimed=true;return {rows:[job]};}
    return {rows:[],rowCount:mode==='wrongSession'?0:1};
   };
   globalThis.fetch=async()=>{
    sent++;
    if(mode==='retry')throw new Error('offline');
    return Response.json({data:mode==='receipt'?{'receipt-1':{status:'ok'}}:[mode==='unregistered'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok',id:'ticket-1'}]});
   };
   await drainPushJobs();
   if(mode==='ticket')assert.ok(queries.some(q=>q.sql.includes('ticket_id=$2')&&q.args[1]==='ticket-1'));
   if(mode==='receipt')assert.ok(queries.some(q=>q.sql.includes('finished_at=now()')));
   if(mode==='unregistered')assert.ok(queries.some(q=>q.sql.startsWith('DELETE FROM public.order_push_devices')&&q.args[1]==='hash'));
   if(mode==='retry')assert.ok(queries.some(q=>q.sql.includes('DeliveryPending')));
   if(mode==='wrongSession')assert.equal(sent,0);
  }
 } finally {accessDb.query=originalQuery;globalThis.fetch=originalFetch;await accessDb.end();}
});
