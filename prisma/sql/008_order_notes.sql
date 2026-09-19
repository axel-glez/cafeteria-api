-- Aditiva y repetible. Los pedidos anteriores quedan sin indicaciones.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_notes_length') THEN
  ALTER TABLE public.orders ADD CONSTRAINT orders_notes_length CHECK (char_length(notes) <= 500);
 END IF;
END $$;
