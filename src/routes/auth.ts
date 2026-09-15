import { Router, type Request, type RequestHandler, type Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { accessDb, tokenHash, verifyPassword, createAccount, usernameSchema } from "../lib/access";

export const authRouter = Router();
const cookieName = process.env.NODE_ENV === 'production' ? '__Host-cafe_session' : 'cafe_session';
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
function token(req: Request) {
 const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
 return value && /^[a-f0-9]{64}$/.test(value) ? value : '';
}
async function startSession(req: Request, res: Response, accountId: string) {
 await accessDb.query('DELETE FROM cafe_access.sessions WHERE token_hash=$1 OR expires_at <= now()', [tokenHash(token(req))]);
 const value = randomBytes(32).toString('hex');
 await accessDb.query("INSERT INTO cafe_access.sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '8 hours')", [tokenHash(value), accountId]);
 res.cookie(cookieName, value, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
}
export const requireSession: RequestHandler = async (req, res, next) => {
 if (!token(req)) { res.status(401).json({ error: 'Inicia sesión para continuar' }); return; }
 const result = await accessDb.query('SELECT a.id,a.username,a.role,a.active FROM cafe_access.sessions s JOIN cafe_access.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true', [tokenHash(token(req))]);
 if (!result.rows[0]) { res.clearCookie(cookieName, cookieOptions); res.status(401).json({ error: 'Tu sesión terminó. Vuelve a ingresar' }); return; }
 res.locals.account = result.rows[0]; next();
};
export const requireAdmin: RequestHandler = (_req, res, next) => {
 if (res.locals.account?.role !== 'admin') { res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' }); return; }
 next();
};
export const productPermission: RequestHandler = (req, res, next) => {
 if (req.method === 'GET' || req.method === 'HEAD' || res.locals.account.role === 'admin') { next(); return; }
 if (req.method === 'PATCH' && req.body && Object.keys(req.body).length === 1 && typeof req.body.available === 'boolean') { next(); return; }
 res.status(403).json({ error: 'El empleado solo puede cambiar la disponibilidad' });
};

// Límites persistentes sin guardar IP, navegador o datos personales.
export async function consumeLoginAttempt(username: string) {
 await accessDb.query('DELETE FROM cafe_access.login_limits WHERE expires_at<=now()');
 const result = await accessDb.query(`INSERT INTO cafe_access.login_limits(bucket,attempts,expires_at) VALUES ($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=cafe_access.login_limits.attempts+1 RETURNING attempts`, [tokenHash('account:' + username)]);
 const global = await accessDb.query(`INSERT INTO cafe_access.login_limits(bucket,attempts,expires_at) VALUES ('global',1,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET attempts=cafe_access.login_limits.attempts+1 RETURNING attempts`);
 return result.rows[0].attempts <= 10 && global.rows[0].attempts <= 60;
}
let hashing = 0;
authRouter.post('/login', async (req, res) => {
 const data = z.strictObject({ username: usernameSchema, password: z.string().min(1).max(128) }).parse(req.body);
 if (!await consumeLoginAttempt(data.username)) { res.set('Retry-After', '900').status(429).json({ error: 'Demasiados intentos. Espera 15 minutos' }); return; }
 if (hashing >= 2) { res.status(429).json({ error: 'Intenta nuevamente en unos segundos' }); return; }
 hashing++;
 try {
  const result = await accessDb.query('SELECT id,username,role,password_hash,active FROM cafe_access.accounts WHERE username=$1', [data.username]);
  const account = result.rows[0];
  const valid = await verifyPassword(data.password, account?.password_hash);
  if (!valid || !account?.active) { res.status(401).json({ error: 'Usuario o contraseña incorrectos' }); return; }
  await startSession(req, res, account.id);
  await accessDb.query('DELETE FROM cafe_access.login_limits WHERE bucket=$1', [tokenHash('account:' + data.username)]);
  res.json({ id: account.id, username: account.username, role: account.role });
 } finally { hashing--; }
});
authRouter.post('/logout', async (req, res) => {
 await accessDb.query('DELETE FROM cafe_access.sessions WHERE token_hash=$1', [tokenHash(token(req))]);
 res.clearCookie(cookieName, cookieOptions).status(204).end();
});
authRouter.get('/me', requireSession, (_req, res) => { res.json(res.locals.account); });
authRouter.get('/accounts', requireSession, requireAdmin, async (_req, res) => {
 res.json((await accessDb.query('SELECT id,username,role,active FROM cafe_access.accounts ORDER BY username')).rows);
});
authRouter.post('/accounts', requireSession, requireAdmin, async (req, res) => {
 try { res.status(201).json(await createAccount(req.body)); }
 catch (error) { if ((error as { code?: string }).code === '23505') { res.status(409).json({ error: 'Ese alias ya está en uso' }); return; } throw error; }
});
authRouter.patch('/accounts/:id', requireSession, requireAdmin, async (req, res) => {
 const id = z.uuid().parse(req.params.id);
 const { active } = z.strictObject({ active: z.boolean() }).parse(req.body);
 if (id === res.locals.account.id) { res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' }); return; }
 const result = await accessDb.query('UPDATE cafe_access.accounts SET active=$1 WHERE id=$2 RETURNING id,username,role,active', [active, id]);
 if (!result.rows[0]) { res.status(404).json({ error: 'Cuenta no encontrada' }); return; }
 await accessDb.query('DELETE FROM cafe_access.sessions WHERE account_id=$1', [id]);
 res.json(result.rows[0]);
});
