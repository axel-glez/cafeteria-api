import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app';
import { accessDb, createAccount, tokenHash } from '../src/lib/access';
import { prisma } from '../src/lib/prisma';

test('Acceso, privacidad, permisos y revocación de sesiones', { timeout: 120000 }, async () => {
 const server = app.listen(0, '127.0.0.1');
 await once(server, 'listening');
 const address = server.address(); assert.ok(address && typeof address !== 'string');
 const base = `http://127.0.0.1:${address.port}`;
 const suffix = randomBytes(5).toString('hex');
 const password = randomBytes(24).toString('base64url');
 const aliases = ['admin_' + suffix, 'turno_' + suffix, 'nuevo_' + suffix];
 const ids: string[] = [];
 let categoryId: string | undefined, productId: string | undefined;
 const request = (method: string, path: string, cookie = '', body?: unknown, extra = {}) => fetch(base + path, { method,
  headers: { 'Content-Type': 'application/json', 'X-Cafe-Request': '1', Cookie: cookie, ...extra },
  body: body === undefined ? undefined : JSON.stringify(body) });
 const login = async (username: string) => {
  const response = await request('POST', '/auth/login', '', { username, password });
  assert.equal(response.status, 200);
  const header = response.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/);
  const data = await response.json(); assert.equal(data.password_hash, undefined); assert.equal(data.password, undefined);
  return header.split(';')[0];
 };
 try {
  const admin = await createAccount({ username: aliases[0], password, role: 'admin' }); ids.push(admin.id);
  const employee = await createAccount({ username: aliases[1], password, role: 'employee' }); ids.push(employee.id);
  const stored = (await accessDb.query('SELECT password_hash FROM cafe_access.accounts WHERE id=$1', [admin.id])).rows[0].password_hash;
  assert.match(stored, /^scrypt\$/); assert.notEqual(stored, password);
  for (const path of ['/productos', '/categorias', '/auth/me', '/auth/accounts']) assert.equal((await request('GET', path)).status, 401);
  assert.equal((await request('POST', '/auth/login', '', {username: aliases[0],password:'incorrecta'})).status, 401);
  assert.equal((await request('POST', '/auth/login', '', {username: aliases[0],password,role:'admin'})).status, 400);
  const adminCookie = await login(aliases[0]);
  let employeeCookie = await login(aliases[1]);
  assert.equal((await request('POST', '/auth/accounts', employeeCookie, {username:aliases[2],password,role:'admin'})).status, 403);
  assert.equal((await request('GET', '/auth/accounts', employeeCookie)).status, 403);
  assert.equal((await request('POST', '/auth/accounts', adminCookie, {username:aliases[2],password,role:'employee',email:'test@example.com'})).status, 400);
  assert.equal((await request('POST', '/auth/accounts', adminCookie, {username:aliases[2],password:'short',role:'employee'})).status, 400);
  const createdAccount = await request('POST', '/auth/accounts', adminCookie, {username:aliases[2],password,role:'employee'});
  assert.equal(createdAccount.status,201); ids.push((await createdAccount.json()).id);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
   const path = method === 'POST' ? '/productos' : '/productos/' + randomUUID();
   assert.equal((await request(method, path, employeeCookie, {name:'Bloqueado'})).status,403);
   assert.equal((await request(method, method === 'POST' ? '/categories' : '/categories/' + randomUUID(), employeeCookie, {name:'Bloqueado'})).status,403);
  }
  assert.equal((await request('PATCH', '/productos/' + randomUUID(), employeeCookie, {available:false,price:1})).status,403);
  assert.equal((await request('POST', '/auth/accounts', adminCookie, {}, {Origin:'https://otro.example'})).status,403);
  assert.equal((await request('POST', '/auth/accounts', adminCookie, {}, {'X-Cafe-Request':''})).status,403);
  const category = await prisma.categories.create({data:{name:'Acceso temporal ' + suffix}}); categoryId=category.id;
  const created = await request('POST','/productos',adminCookie,{name:'Temporal',description:'Prueba de permisos',price:10,image:'assets/galleta.jpg',category:category.name});
  assert.equal(created.status,201); productId=(await created.json()).id;
  assert.equal((await request('PATCH','/productos/'+productId,employeeCookie,{available:false})).status,200);
  assert.equal((await request('PATCH','/productos/'+productId,adminCookie,{name:'Editado'})).status,200);
  assert.equal((await request('DELETE','/productos/'+productId,adminCookie)).status,204);
  assert.equal((await request('POST','/auth/logout',employeeCookie,{})).status,204);
  assert.equal((await request('GET','/auth/me',employeeCookie)).status,401);
  employeeCookie = await login(aliases[1]);
  const sessionValue = employeeCookie.split('=')[1];
  await accessDb.query("UPDATE cafe_access.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[tokenHash(sessionValue)]);
  assert.equal((await request('GET','/auth/me',employeeCookie)).status,401);
  employeeCookie=await login(aliases[1]);
  assert.equal((await request('PATCH','/auth/accounts/'+employee.id,adminCookie,{active:false})).status,200);
  assert.equal((await request('GET','/auth/me',employeeCookie)).status,401);
  assert.equal((await request('POST','/auth/login','',{username:aliases[1],password})).status,401);
  assert.equal((await request('PATCH','/auth/accounts/'+admin.id,adminCookie,{active:false})).status,400);
  await accessDb.query("INSERT INTO cafe_access.login_limits(bucket,attempts,expires_at) VALUES ($1,10,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=10",[tokenHash('account:'+aliases[1])]);
  assert.equal((await request('POST','/auth/login','',{username:aliases[1],password})).status,429);
  const home=await request('GET','/'); assert.equal(home.status,200); assert.match(await home.text(),/loginForm/);
  assert.match(home.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 } finally {
  if (productId) await prisma.products.delete({where:{id:productId}});
  if (categoryId) await prisma.categories.delete({where:{id:categoryId}});
  await accessDb.query('DELETE FROM cafe_access.accounts WHERE id=ANY($1::uuid[])',[ids]);
  await accessDb.query('DELETE FROM cafe_access.login_limits WHERE bucket=ANY($1::text[])',[aliases.map(alias=>tokenHash('account:'+alias))]);
  server.close(); await prisma.$disconnect(); await accessDb.end();
 }
});
