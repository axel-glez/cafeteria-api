import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
test('CORS móvil: origen explícito sin habilitar las rutas del equipo',async()=>{
 process.env.MOBILE_ORIGINS='http://localhost:5173';
 const {app}=await import('../src/app');const server=app.listen(0,'127.0.0.1');await once(server,'listening');const a=server.address();assert.ok(a&&typeof a!=='string');const base=`http://127.0.0.1:${a.port}`;
 const headers={Origin:'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type, x-cafe-request, idempotency-key'};
 try {
  const allowed=await fetch(base+'/api/v1/pedidos',{method:'OPTIONS',headers});assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),headers.Origin);assert.equal(allowed.headers.get('access-control-allow-credentials'),null);
  const rejected=await fetch(base+'/api/v1/pedidos',{method:'OPTIONS',headers:{...headers,Origin:'https://ajeno.example'}});assert.equal(rejected.headers.get('access-control-allow-origin'),null);
  const staff=await fetch(base+'/productos',{method:'POST',headers:{Origin:headers.Origin,'Content-Type':'application/json','X-Cafe-Request':'1'},body:'{}'});assert.equal(staff.status,403);assert.equal(staff.headers.get('access-control-allow-origin'),null);
  const invalidHeader=await fetch(base+'/api/v1/pedidos',{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Headers':'x-unexpected'}});assert.equal(invalidHeader.status,403);
 }finally{server.close();}
});
