-- Additive, repeatable migration. Tokens are only accessible through the API.
CREATE TABLE IF NOT EXISTS public.order_push_devices (
 token text PRIMARY KEY,
 session_hash text NOT NULL REFERENCES public.order_sessions(token_hash),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_push_devices_session_idx ON public.order_push_devices(session_hash);
CREATE TABLE IF NOT EXISTS public.order_push_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES public.orders(id),
 session_hash text NOT NULL,
 token text NOT NULL,
 status text NOT NULL,
 folio text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 ticket_id text,
 finished_at timestamptz,
 last_error text,
 UNIQUE(order_id,status,token)
);
CREATE INDEX IF NOT EXISTS order_push_jobs_pending_idx ON public.order_push_jobs(next_attempt_at) WHERE finished_at IS NULL;
ALTER TABLE public.order_push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_push_devices, public.order_push_jobs FROM anon, authenticated;
