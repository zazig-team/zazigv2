# WebUI Phase 3 — Direct SQL

Run these in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

## 1. `decisions` table

```sql
CREATE TABLE public.decisions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES public.companies(id),
  from_role                 text NOT NULL,
  category                  text NOT NULL DEFAULT 'tactical'
                            CHECK (category IN ('routine', 'tactical', 'strategic', 'foundational')),
  title                     text NOT NULL,
  context                   text,
  options                   jsonb NOT NULL DEFAULT '[]',
  recommendation_rationale  text,
  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'resolved', 'deferred', 'expired')),
  resolved_by               text,
  resolution                jsonb,
  expires_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  resolved_at               timestamptz
);

-- RLS
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company decisions"
ON public.decisions FOR SELECT
USING (public.user_in_company(company_id));

CREATE POLICY "Users can resolve own company decisions"
ON public.decisions FOR UPDATE
USING (public.user_in_company(company_id))
WITH CHECK (public.user_in_company(company_id));

-- Service role inserts (CPO writes via edge function — no policy needed, service_role bypasses RLS)

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.decisions;
```

## 2. `action_items` table

```sql
CREATE TABLE public.action_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id),
  source_role     text,
  source_job_id   uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  title           text NOT NULL,
  detail          text,
  cta_label       text NOT NULL DEFAULT 'Resolve',
  cta_type        text NOT NULL DEFAULT 'acknowledge'
                  CHECK (cta_type IN ('acknowledge', 'provide_secret', 'approve', 'external_link')),
  cta_payload     jsonb,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

-- RLS
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company action items"
ON public.action_items FOR SELECT
USING (public.user_in_company(company_id));

CREATE POLICY "Users can resolve own company action items"
ON public.action_items FOR UPDATE
USING (public.user_in_company(company_id))
WITH CHECK (public.user_in_company(company_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
```

## 3. Add `features` to Realtime publication

This was never added — Phase 2 realtime subscriptions on features won't fire without it.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.features;
```

## 4. Ideas table — authenticated SELECT policy

This was a Phase 1 gap. Without it, the Pipeline ideas column fails for authenticated users.

```sql
CREATE POLICY "Users can view own company ideas"
ON public.ideas FOR SELECT
USING (public.user_in_company(company_id));
```

## Verification

After running all four blocks, verify in the SQL Editor:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('decisions', 'action_items');

-- Check Realtime publication
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('decisions', 'action_items', 'ideas', 'exec_personalities');
```
