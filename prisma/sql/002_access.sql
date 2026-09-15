CREATE SCHEMA IF NOT EXISTS cafe_access;
REVOKE ALL ON SCHEMA cafe_access FROM PUBLIC;
CREATE TABLE IF NOT EXISTS cafe_access.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_-]{3,32}$'),
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin', 'employee')),
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS cafe_access.sessions (
 token_hash text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES cafe_access.accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON cafe_access.sessions(account_id);
CREATE TABLE IF NOT EXISTS cafe_access.login_limits (
 bucket text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA cafe_access FROM PUBLIC;
ALTER TABLE cafe_access.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_access.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_access.login_limits ENABLE ROW LEVEL SECURITY;
