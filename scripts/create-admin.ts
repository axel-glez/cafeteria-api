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
 console.error(error instanceof Error && !('code' in error) ? error.message : 'No se pudo crear la cuenta. Revisa la conexión y el alias.');
 process.exitCode = 1;
} finally { rl.close(); await accessDb.end(); }
