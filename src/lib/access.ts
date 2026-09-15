import "dotenv/config";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { z } from "zod";

export const accessDb = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 5 });
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/, 'Usa un alias ficticio de 3 a 32 letras, números, guiones o guiones bajos; sin correo ni nombre real');
export const passwordSchema = z.string().min(15, 'Usa al menos 15 caracteres').max(128);
export const accountSchema = z.strictObject({ username: usernameSchema, password: passwordSchema, role: z.enum(['admin', 'employee']) });
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
 return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
 const salt = randomBytes(16).toString('hex');
 return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded?: string) {
 const [, salt, hash] = (encoded || '').split('$');
 const actual = await derive(password, salt || '00000000000000000000000000000000');
 const expected = Buffer.from(hash || '00'.repeat(64), 'hex');
 return expected.length === actual.length && timingSafeEqual(expected, actual) && Boolean(encoded);
}
export async function createAccount(input: unknown) {
 const data = accountSchema.parse(input);
 const hash = await hashPassword(data.password);
 const result = await accessDb.query('INSERT INTO cafe_access.accounts(username,password_hash,role) VALUES ($1,$2,$3) RETURNING id, username, role, active', [data.username, hash, data.role]);
 return result.rows[0];
}
