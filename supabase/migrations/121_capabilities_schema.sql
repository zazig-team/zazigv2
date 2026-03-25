-- Migration: Capabilities schema
-- Date: 2026-03-08
-- Adds capability lanes/capabilities, links features to capabilities, and enables realtime.

-- Shared trigger function (created in 003; recreated here for safety)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- capability_lanes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.capability_lanes (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name       text        NOT NULL,
    sort_order integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capability_lanes_company
    ON public.capability_lanes(company_id, sort_order);

ALTER TABLE public.capability_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.capability_lanes;
CREATE POLICY "service_role_full_access" ON public.capability_lanes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_own" ON public.capability_lanes;
CREATE POLICY "authenticated_read_own" ON public.capability_lanes
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- capabilities
-- ============================================================

CREATE TABLE IF NOT EXISTS public.capabilities (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lane_id    uuid        NOT NULL REFERENCES public.capability_lanes(id) ON DELETE CASCADE,
    title      text        NOT NULL,
    icon       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('shipped', 'active', 'draft', 'locked')),
    progress   integer     NOT NULL DEFAULT 0
                           CHECK (progress >= 0 AND progress <= 100),
    depends_on uuid[]      NOT NULL DEFAULT '{}',
    sort_order integer     NOT NULL DEFAULT 0,
    details    text,
    tooltip    text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS capabilities_updated_at ON public.capabilities;
CREATE TRIGGER capabilities_updated_at
    BEFORE UPDATE ON public.capabilities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_capabilities_company_lane
    ON public.capabilities(company_id, lane_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_capabilities_status
    ON public.capabilities(company_id, status);

ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON public.capabilities;
CREATE POLICY "service_role_full_access" ON public.capabilities
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_own" ON public.capabilities;
CREATE POLICY "authenticated_read_own" ON public.capabilities
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- features.capability_id
-- ============================================================

ALTER TABLE public.features
    ADD COLUMN IF NOT EXISTS capability_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'features_capability_id_fkey'
    ) THEN
        ALTER TABLE public.features
            ADD CONSTRAINT features_capability_id_fkey
            FOREIGN KEY (capability_id) REFERENCES public.capabilities(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_features_capability
    ON public.features(capability_id)
    WHERE capability_id IS NOT NULL;

-- ============================================================
-- Realtime publication
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'capability_lanes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.capability_lanes;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'capabilities'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.capabilities;
    END IF;
END $$;
