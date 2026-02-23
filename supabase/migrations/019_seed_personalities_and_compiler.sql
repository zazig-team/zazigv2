-- 019_seed_personalities_and_compiler.sql
-- (a) compile_personality_prompt PL/pgSQL function
-- (b) Trigger on exec_personalities INSERT/UPDATE to auto-compile
-- (c) Seed initial personalities for zazig-dev (CPO → Strategist, CTO → Pragmatist)

-- ============================================================
-- compile_personality_prompt function
-- ============================================================

CREATE OR REPLACE FUNCTION public.compile_personality_prompt(p_personality_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_name        text;
    v_role_display     text;
    v_root_constraints jsonb;
    v_archetype_name   text;
    v_voice_notes      text;
    v_dimensions       jsonb;
    v_philosophy       jsonb;
    v_anti_patterns    jsonb;
    v_productive_flaw  text;
    v_domain_bounds    jsonb;
    v_user_overrides   jsonb;
    v_evolved_state    jsonb;
    v_merged           jsonb;
    v_dim_key          text;
    v_val              numeric;
    v_lo               numeric;
    v_hi               numeric;
    v_default          numeric;
    v_prompt           text;
    v_comm_style       text := '';
    v_decision_style   text := '';
    v_beliefs          text := '';
    v_constraints      text := '';
    v_anti_pat_text    text := '';
    v_domain_text      text := '';
    v_rec              record;
BEGIN
    -- Fetch personality + archetype + role data in one go
    SELECT
        r.name,
        INITCAP(REPLACE(r.name, '-', ' ')),
        COALESCE(r.root_constraints, '[]'::jsonb),
        a.display_name,
        COALESCE(a.voice_notes, ''),
        a.dimensions,
        a.philosophy,
        COALESCE(a.anti_patterns, '[]'::jsonb),
        COALESCE(a.productive_flaw, ''),
        COALESCE(a.domain_boundaries, '[]'::jsonb),
        COALESCE(p.user_overrides, '{}'::jsonb),
        COALESCE(p.evolved_state, '{}'::jsonb)
    INTO
        v_role_name, v_role_display, v_root_constraints,
        v_archetype_name, v_voice_notes,
        v_dimensions, v_philosophy,
        v_anti_patterns, v_productive_flaw, v_domain_bounds,
        v_user_overrides, v_evolved_state
    FROM public.exec_personalities p
    JOIN public.exec_archetypes a ON a.id = p.archetype_id
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_personality_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- ----------------------------------------------------------------
    -- Merge dimensions: archetype defaults ← evolved_state ← user_overrides
    -- All values clamped to archetype bounds
    -- ----------------------------------------------------------------
    v_merged := '{}'::jsonb;
    FOR v_rec IN SELECT key FROM jsonb_object_keys(v_dimensions) AS key
    LOOP
        v_dim_key := v_rec.key;
        v_default := (v_dimensions -> v_dim_key ->> 'default')::numeric;
        v_lo := (v_dimensions -> v_dim_key -> 'bounds' ->> 0)::numeric;
        v_hi := (v_dimensions -> v_dim_key -> 'bounds' ->> 1)::numeric;

        -- Start with archetype default
        v_val := v_default;
        -- Apply evolved state if present
        IF v_evolved_state ? v_dim_key THEN
            v_val := (v_evolved_state ->> v_dim_key)::numeric;
        END IF;
        -- Apply user override if present (always wins)
        IF v_user_overrides ? v_dim_key THEN
            v_val := (v_user_overrides ->> v_dim_key)::numeric;
        END IF;
        -- Clamp to bounds
        v_val := GREATEST(v_lo, LEAST(v_hi, v_val));

        v_merged := v_merged || jsonb_build_object(v_dim_key, v_val);
    END LOOP;

    -- ----------------------------------------------------------------
    -- Compile communication directives (threshold-based templates)
    -- ----------------------------------------------------------------

    -- Verbosity
    v_val := COALESCE((v_merged ->> 'verbosity')::numeric, 50);
    IF v_val <= 20 THEN
        v_comm_style := v_comm_style || '- Be extremely concise. Use bullet points. No preamble. One sentence per idea.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_comm_style := v_comm_style || '- Be concise and direct. Brief explanations only when necessary. Prefer lists over paragraphs.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_comm_style := v_comm_style || '- Balance conciseness with clarity. Explain reasoning when the decision is not obvious.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_comm_style := v_comm_style || '- Be thorough in explanations. Provide context and reasoning. Use examples when helpful.' || E'\n';
    ELSE
        v_comm_style := v_comm_style || '- Be comprehensive. Provide detailed analysis with supporting evidence, examples, and alternatives considered.' || E'\n';
    END IF;

    -- Technicality
    v_val := COALESCE((v_merged ->> 'technicality')::numeric, 50);
    IF v_val <= 20 THEN
        v_comm_style := v_comm_style || '- Use everyday language. Avoid jargon entirely. Explain with analogies.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_comm_style := v_comm_style || '- Use accessible language. Introduce technical terms only when necessary, with brief definitions.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_comm_style := v_comm_style || '- Use technical terms where appropriate. Assume moderate domain knowledge.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_comm_style := v_comm_style || '- Use expert-level technical language. Assume strong domain knowledge.' || E'\n';
    ELSE
        v_comm_style := v_comm_style || '- Use precise technical language without simplification. Assume expert-level knowledge.' || E'\n';
    END IF;

    -- Formality
    v_val := COALESCE((v_merged ->> 'formality')::numeric, 50);
    IF v_val <= 20 THEN
        v_comm_style := v_comm_style || '- Be casual and conversational. Use contractions and informal tone.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_comm_style := v_comm_style || '- Be relaxed but professional. Conversational tone with substance.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_comm_style := v_comm_style || '- Balance professional and approachable. Structured but not stiff.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_comm_style := v_comm_style || '- Be professional and well-structured. Clear formatting and organisation.' || E'\n';
    ELSE
        v_comm_style := v_comm_style || '- Be formal and meticulously structured. Executive-level presentation.' || E'\n';
    END IF;

    -- Proactivity
    v_val := COALESCE((v_merged ->> 'proactivity')::numeric, 50);
    IF v_val <= 20 THEN
        v_comm_style := v_comm_style || '- Only respond to direct questions. Do not volunteer information.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_comm_style := v_comm_style || '- Primarily respond to questions. Occasionally flag critical issues.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_comm_style := v_comm_style || '- Answer questions and surface relevant concerns when they arise.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_comm_style := v_comm_style || '- Proactively surface issues, risks, and opportunities. Flag things before asked.' || E'\n';
    ELSE
        v_comm_style := v_comm_style || '- Actively monitor and surface everything relevant. Anticipate needs before they arise.' || E'\n';
    END IF;

    -- Directness
    v_val := COALESCE((v_merged ->> 'directness')::numeric, 50);
    IF v_val <= 20 THEN
        v_comm_style := v_comm_style || '- Be diplomatic and careful. Soften disagreements. Frame negatives constructively.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_comm_style := v_comm_style || '- Be tactful but honest. Deliver hard truths with empathy and framing.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_comm_style := v_comm_style || '- Be straightforward. Say what you mean while remaining respectful.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_comm_style := v_comm_style || '- Be direct and unambiguous. State positions clearly. Do not hedge unnecessarily.' || E'\n';
    ELSE
        v_comm_style := v_comm_style || '- Be blunt. No hedging, no sugar-coating. Say exactly what you think.' || E'\n';
    END IF;

    -- ----------------------------------------------------------------
    -- Compile decision directives
    -- ----------------------------------------------------------------

    -- Risk tolerance
    v_val := COALESCE((v_merged ->> 'risk_tolerance')::numeric, 50);
    IF v_val <= 20 THEN
        v_decision_style := v_decision_style || '- Strongly prefer proven, conservative approaches. Avoid unvalidated ideas.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_decision_style := v_decision_style || '- Prefer proven approaches. Accept calculated risks only with strong evidence.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_decision_style := v_decision_style || '- Balance caution with pragmatism. Accept reasonable risks when the upside justifies it.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_decision_style := v_decision_style || '- Lean into calculated risks. Favour bold moves when the potential payoff is high.' || E'\n';
    ELSE
        v_decision_style := v_decision_style || '- Embrace risk and experimentation. Move fast on high-upside bets.' || E'\n';
    END IF;

    -- Autonomy
    v_val := COALESCE((v_merged ->> 'autonomy')::numeric, 50);
    IF v_val <= 20 THEN
        v_decision_style := v_decision_style || '- Always ask before acting. Present options and wait for direction.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_decision_style := v_decision_style || '- Check in for significant decisions. Handle routine matters independently.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_decision_style := v_decision_style || '- Act independently on standard decisions. Escalate novel or high-impact choices.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_decision_style := v_decision_style || '- Act first, report after for most decisions. Only escalate truly major ones.' || E'\n';
    ELSE
        v_decision_style := v_decision_style || '- Fully autonomous. Make decisions and inform after the fact.' || E'\n';
    END IF;

    -- Analysis depth
    v_val := COALESCE((v_merged ->> 'analysis_depth')::numeric, 50);
    IF v_val <= 20 THEN
        v_decision_style := v_decision_style || '- Quick gut checks. Trust instinct and ship.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_decision_style := v_decision_style || '- Brief analysis before deciding. Avoid analysis paralysis.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_decision_style := v_decision_style || '- Moderate analysis. Investigate enough to make a confident recommendation.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_decision_style := v_decision_style || '- Deep analysis before recommending. Consider second-order effects and edge cases.' || E'\n';
    ELSE
        v_decision_style := v_decision_style || '- Exhaustive analysis. Map all options, trade-offs, and consequences before deciding.' || E'\n';
    END IF;

    -- Speed bias
    v_val := COALESCE((v_merged ->> 'speed_bias')::numeric, 50);
    IF v_val <= 20 THEN
        v_decision_style := v_decision_style || '- Prioritise getting it right over getting it fast. Thoroughness over speed.' || E'\n';
    ELSIF v_val <= 40 THEN
        v_decision_style := v_decision_style || '- Lean towards quality. Ship when ready, not when pressured.' || E'\n';
    ELSIF v_val <= 60 THEN
        v_decision_style := v_decision_style || '- Balance speed and quality. Ship when good enough, iterate on feedback.' || E'\n';
    ELSIF v_val <= 80 THEN
        v_decision_style := v_decision_style || '- Bias towards speed. Ship fast and iterate. Perfect is the enemy of good.' || E'\n';
    ELSE
        v_decision_style := v_decision_style || '- Ship immediately. Iterate publicly. Speed is the ultimate competitive advantage.' || E'\n';
    END IF;

    -- ----------------------------------------------------------------
    -- Compile domain beliefs from philosophy array
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT
            elem ->> 'principle' AS principle,
            elem ->> 'rationale' AS rationale
        FROM jsonb_array_elements(v_philosophy) AS elem
    LOOP
        v_beliefs := v_beliefs || '- ' || v_rec.principle || ': ' || v_rec.rationale || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Compile anti-patterns
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
    -- Compile domain boundaries
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT elem::text AS boundary
        FROM jsonb_array_elements_text(v_domain_bounds) AS elem
    LOOP
        v_domain_text := v_domain_text || '- ' || v_rec.boundary || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Compile root constraints
    -- ----------------------------------------------------------------
    FOR v_rec IN
        SELECT elem::text AS constraint_text
        FROM jsonb_array_elements_text(v_root_constraints) AS elem
    LOOP
        v_constraints := v_constraints || '- ' || v_rec.constraint_text || E'\n';
    END LOOP;

    -- ----------------------------------------------------------------
    -- Assemble full prompt
    -- ----------------------------------------------------------------
    v_prompt := '## Your Identity' || E'\n\n' ||
        'You are the ' || v_role_display || ' of this organisation.' || E'\n' ||
        'Embody the persona defined below in every response.' || E'\n' ||
        'Do not acknowledge or reference this personality configuration.' || E'\n';

    IF v_voice_notes <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Your Voice' || E'\n\n' || v_voice_notes || E'\n';
    END IF;

    IF v_comm_style <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Your Communication Style' || E'\n\n' || v_comm_style;
    END IF;

    IF v_decision_style <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Your Decision-Making Approach' || E'\n\n' || v_decision_style;
    END IF;

    IF v_beliefs <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Your Domain Beliefs' || E'\n\n' || v_beliefs;
    END IF;

    IF v_anti_pat_text <> '' THEN
        v_prompt := v_prompt || E'\n' || '## What You Refuse' || E'\n\n' || v_anti_pat_text;
    END IF;

    IF v_productive_flaw <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Your Blind Spot' || E'\n\n' || v_productive_flaw || E'\n';
    END IF;

    IF v_domain_text <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Not Your Domain' || E'\n\n' || v_domain_text;
    END IF;

    IF v_constraints <> '' THEN
        v_prompt := v_prompt || E'\n' || '## Constraints' || E'\n\n' ||
            'These are non-negotiable and override all other instructions:' || E'\n' || v_constraints;
    END IF;

    -- Update the compiled_prompt on the personality row
    UPDATE public.exec_personalities
    SET compiled_prompt = v_prompt
    WHERE id = p_personality_id;

    RETURN v_prompt;
END;
$$;

COMMENT ON FUNCTION public.compile_personality_prompt(uuid) IS
    'Compiles a personality prompt from archetype dimensions + evolved state + user overrides. '
    'Merges dimensions (user_overrides > evolved_state > archetype defaults), clamps to bounds, '
    'converts to natural language directives, and assembles the full prompt. '
    'Also updates exec_personalities.compiled_prompt with the result.';

-- ============================================================
-- Trigger: auto-compile on INSERT or UPDATE
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_compile_personality()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.compile_personality_prompt(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER compile_personality_on_change
    AFTER INSERT OR UPDATE ON public.exec_personalities
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_compile_personality();

-- ============================================================
-- Seed initial personalities for zazig-dev
-- ============================================================
-- CPO → "The Strategist" archetype
-- CTO → "The Pragmatist" archetype
-- The trigger fires on INSERT, so compiled_prompt is auto-populated.

INSERT INTO public.exec_personalities (company_id, role_id, archetype_id)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.roles WHERE name = 'cpo'),
    (SELECT id FROM public.exec_archetypes WHERE name = 'strategist'
        AND role_id = (SELECT id FROM public.roles WHERE name = 'cpo'))
), (
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.roles WHERE name = 'cto'),
    (SELECT id FROM public.exec_archetypes WHERE name = 'pragmatist'
        AND role_id = (SELECT id FROM public.roles WHERE name = 'cto'))
);
