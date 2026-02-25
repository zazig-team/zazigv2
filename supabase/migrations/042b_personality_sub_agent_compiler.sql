-- 042_personality_sub_agent_compiler.sql
-- (a) Add compiled_sub_agent_prompt column to exec_personalities
-- (b) compile_personality_prompt_sub_agent PL/pgSQL function
-- (c) Update trigger to also compile sub-agent prompt
-- (d) Backfill existing rows

-- ============================================================
-- (a) Add column
-- ============================================================

ALTER TABLE public.exec_personalities
    ADD COLUMN IF NOT EXISTS compiled_sub_agent_prompt text;

-- ============================================================
-- (b) compile_personality_prompt_sub_agent function
-- ============================================================

CREATE OR REPLACE FUNCTION public.compile_personality_prompt_sub_agent(p_personality_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_display     text;
    v_root_constraints jsonb;
    v_philosophy       jsonb;
    v_anti_patterns    jsonb;
    v_prompt           text := '';
    v_beliefs          text := '';
    v_constraints      text := '';
    v_anti_pat_text    text := '';
    v_rec              record;
BEGIN
    -- Fetch personality + archetype + role data in one go
    SELECT
        INITCAP(REPLACE(r.name, '-', ' ')),
        COALESCE(r.root_constraints, '[]'::jsonb),
        a.philosophy,
        COALESCE(a.anti_patterns, '[]'::jsonb)
    INTO
        v_role_display, v_root_constraints,
        v_philosophy, v_anti_patterns
    FROM public.exec_personalities p
    JOIN public.exec_archetypes a ON a.id = p.archetype_id
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_personality_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- ----------------------------------------------------------------
    -- Standards: only core_belief entries from philosophy
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT
            elem ->> 'principle' AS principle,
            elem ->> 'rationale' AS rationale
        FROM jsonb_array_elements(v_philosophy) AS elem
        WHERE elem ->> 'type' = 'core_belief'
    LOOP
        v_beliefs := v_beliefs || '- ' || v_rec.principle || ': ' || v_rec.rationale || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Anti-patterns
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT
            elem ->> 'behavior' AS behavior,
            elem ->> 'why' AS why
        FROM jsonb_array_elements(v_anti_patterns) AS elem
        WHERE elem ->> 'behavior' IS NOT NULL
    LOOP
        v_anti_pat_text := v_anti_pat_text || '- ' || v_rec.behavior || ' ' || COALESCE(v_rec.why, '') || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Root constraints
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT elem::text AS constraint_text
        FROM jsonb_array_elements_text(v_root_constraints) AS elem
    LOOP
        v_constraints := v_constraints || '- ' || v_rec.constraint_text || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Assemble sub-agent prompt (Standards + Patterns to Reject + Constraints only)
    -- ----------------------------------------------------------------
    IF v_beliefs <> '' THEN
        v_prompt := v_prompt || '## Standards' || E'\n\n' ||
            'Apply these standards from the team''s ' || v_role_display || ' when working:' || E'\n\n' ||
            v_beliefs;
    END IF;

    IF v_anti_pat_text <> '' THEN
        IF v_prompt <> '' THEN
            v_prompt := v_prompt || E'\n';
        END IF;
        v_prompt := v_prompt || '## Patterns to Reject' || E'\n\n' || v_anti_pat_text;
    END IF;

    IF v_constraints <> '' THEN
        IF v_prompt <> '' THEN
            v_prompt := v_prompt || E'\n';
        END IF;
        v_prompt := v_prompt || '## Constraints' || E'\n\n' ||
            'These are non-negotiable and override all other instructions:' || E'\n' || v_constraints;
    END IF;

    -- Update the compiled_sub_agent_prompt on the personality row
    UPDATE public.exec_personalities
    SET compiled_sub_agent_prompt = NULLIF(v_prompt, '')
    WHERE id = p_personality_id;

    RETURN NULLIF(v_prompt, '');
END;
$$;

COMMENT ON FUNCTION public.compile_personality_prompt_sub_agent(uuid) IS
    'Compiles a stripped-down personality prompt for sub-agents spawned via the Task tool. '
    'Includes only: Standards (core beliefs from philosophy), Patterns to Reject (anti-patterns), '
    'and Constraints (root constraints). Strips identity, voice, style, decision-making, '
    'blind spot, and domain boundaries. Updates exec_personalities.compiled_sub_agent_prompt.';

-- ============================================================
-- (c) Update trigger function to also compile sub-agent prompt
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_compile_personality()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Guard against recursion: compile functions UPDATE the same
    -- row, which would re-fire this trigger without the depth check.
    IF pg_trigger_depth() <= 1 THEN
        PERFORM public.compile_personality_prompt(NEW.id);
        PERFORM public.compile_personality_prompt_sub_agent(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================
-- (d) Backfill existing rows
-- ============================================================

DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.exec_personalities LOOP
        PERFORM public.compile_personality_prompt_sub_agent(r.id);
    END LOOP;
END;
$$;
