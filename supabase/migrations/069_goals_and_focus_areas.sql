-- Migration: Goals and Focus Areas
-- Date: 2026-02-27
-- Adds four tables for strategic planning:
--   goals           — company-level objectives with time horizons and status
--   focus_areas     — active investment areas with domain tags
--   focus_area_goals — junction: which goals a focus area targets
--   feature_focus_areas — junction: which focus areas a feature belongs to

-- ============================================================
-- Shared trigger function (created in 003; recreated here for safety)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- goals
-- Company-level objectives tracked over time.
-- ============================================================

CREATE TABLE public.goals (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title        text        NOT NULL,
    description  text,
    time_horizon text        CHECK (time_horizon IN ('near', 'medium', 'long')),
    metric       text,
    target       text,
    target_date  date,
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'achieved', 'abandoned')),
    achieved_at  timestamptz,
    position     integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_goals_company_status ON public.goals(company_id, status);
CREATE INDEX idx_goals_created_at     ON public.goals(created_at);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.goals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.goals
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.goals
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- focus_areas
-- Active investment areas that group related goals and features.
-- ============================================================

CREATE TABLE public.focus_areas (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title        text        NOT NULL,
    description  text,
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'paused')),
    position     integer     NOT NULL DEFAULT 0,
    domain_tags  text[]      NOT NULL DEFAULT '{}',
    proposed_by  text,
    approved_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER focus_areas_updated_at
    BEFORE UPDATE ON public.focus_areas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_focus_areas_company_status ON public.focus_areas(company_id, status);
CREATE INDEX idx_focus_areas_created_at     ON public.focus_areas(created_at);
CREATE INDEX idx_focus_areas_domain_tags    ON public.focus_areas USING GIN(domain_tags);

ALTER TABLE public.focus_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.focus_areas
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.focus_areas
    FOR SELECT
    TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.focus_areas
    FOR INSERT
    TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- ============================================================
-- focus_area_goals (junction)
-- Links focus areas to the goals they pursue.
-- ============================================================

CREATE TABLE public.focus_area_goals (
    focus_area_id uuid NOT NULL REFERENCES public.focus_areas(id) ON DELETE CASCADE,
    goal_id       uuid NOT NULL REFERENCES public.goals(id)       ON DELETE CASCADE,
    PRIMARY KEY (focus_area_id, goal_id)
);

ALTER TABLE public.focus_area_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.focus_area_goals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.focus_area_goals
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.focus_areas fa
            WHERE fa.id = focus_area_id
              AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
        )
    );

CREATE POLICY "authenticated_insert_own" ON public.focus_area_goals
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.focus_areas fa
            WHERE fa.id = focus_area_id
              AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
        )
    );

-- ============================================================
-- feature_focus_areas (junction)
-- Links features to the focus areas they contribute to.
-- ============================================================

CREATE TABLE public.feature_focus_areas (
    feature_id    uuid NOT NULL REFERENCES public.features(id)     ON DELETE CASCADE,
    focus_area_id uuid NOT NULL REFERENCES public.focus_areas(id)  ON DELETE CASCADE,
    PRIMARY KEY (feature_id, focus_area_id)
);

ALTER TABLE public.feature_focus_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.feature_focus_areas
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.feature_focus_areas
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.focus_areas fa
            WHERE fa.id = focus_area_id
              AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
        )
    );

CREATE POLICY "authenticated_insert_own" ON public.feature_focus_areas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.focus_areas fa
            WHERE fa.id = focus_area_id
              AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
        )
    );
