import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { accessDb, createAccount } from '../src/lib/access';
let hidden = false;
const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
try {
 if (!process.stdin.isTTY) throw new Error('Ejecuta este comando en una terminal interactiva');
 const exists = await accessDb.query("SELECT 1 FROM cafe_access.accounts WHERE role='admin' LIMIT 1");
 if (exists.rowCount) throw new Error('Ya hay un administrador. Crea más cuentas desde Configuración');
 const username = await rl.question('Alias ficticio del administrador (sin nombre real ni correo): ');
 process.stdout.write('Contraseña nueva (mínimo 15 caracteres; no se muestra): ');
 hidden = true;
 const password = await rl.question('');
 hidden = false;
 process.stdout.write('\nRepite la contraseña: ');
 hidden = true;
 const confirmation = await rl.question('');
 hidden = false;
 process.stdout.write('\n');
 if (password !== confirmation) throw new Error('Las contraseñas no coinciden');
 await createAccount({ username, password, role: 'admin' });
 console.log('Administrador creado. Abre http://localhost:5000 para iniciar sesión.');
} catch (error) {
 const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
 const message = error instanceof Error ? error.message : '';
 if (code === '28P01') {
  console.error('PostgreSQL rechazó la contraseña. Corrige TU_CLAVE_LOCAL en DATABASE_URL y DIRECT_URL dentro de .env.');
 } else if (code === '3D000') {
  console.error('La base busters_dev no existe. Completa el paso 4 del README antes de crear la cuenta.');
 } else if (code === '42P01' || code === '3F000') {
  console.error('Faltan las tablas de acceso. Completa todas las migraciones del paso 4 del README.');
 } else if (code === 'ECONNREFUSED') {
  console.error('No se pudo conectar con PostgreSQL. Comprueba que el servicio esté iniciado y que el puerto de .env sea correcto.');
 } else if (message) {
  console.error(message);
 } else {
  console.error('No se pudo crear la cuenta. Revisa la conexión y el alias.');
 }
 process.exitCode = 1;
} finally { rl.close(); await accessDb.end(); }
