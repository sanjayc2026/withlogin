-- Farm profile per signed-in user
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  farm_profile jsonb,
  onboarded boolean NOT NULL DEFAULT false,
  active_crop_id text NOT NULL DEFAULT 'tomato',
  tasks jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Ledger (expenses / income)
CREATE TABLE public.ledger_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_user_idx ON public.ledger_entries(user_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users add own ledger" ON public.ledger_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ledger" ON public.ledger_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own ledger" ON public.ledger_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Leaf scan history
CREATE TABLE public.diagnoses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  date timestamptz NOT NULL DEFAULT now(),
  image text NOT NULL DEFAULT '',
  verdict text NOT NULL,
  name text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diagnoses_user_idx ON public.diagnoses(user_id, date DESC);
GRANT SELECT, INSERT, DELETE ON public.diagnoses TO authenticated;
GRANT ALL ON public.diagnoses TO service_role;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own diagnoses" ON public.diagnoses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users add own diagnoses" ON public.diagnoses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own diagnoses" ON public.diagnoses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();