import { randomBytes } from 'node:crypto';
import { accessDb, tokenHash } from '../src/lib/access';
export async function adminFixture() {
 const token = randomBytes(32).toString('hex');
 const account = (await accessDb.query("INSERT INTO cafe_access.accounts(username,password_hash,role) VALUES ($1,'test-no-login','admin') RETURNING id", ['test_'+randomBytes(8).toString('hex')])).rows[0];
 await accessDb.query("INSERT INTO cafe_access.sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '5 minutes')",[tokenHash(token),account.id]);
 return { headers: { 'Content-Type':'application/json', 'X-Cafe-Request':'1', Cookie:`cafe_session=${token}` },
  async cleanup() { await accessDb.query('DELETE FROM cafe_access.accounts WHERE id=$1',[account.id]); await accessDb.end(); } };
}
