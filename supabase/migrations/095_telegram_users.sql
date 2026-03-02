-- 092: Add Telegram user-to-company mapping table for telegram-bot edge function.
-- The bot resolves company_id from telegram_user_id before inserting into ideas.

CREATE TABLE IF NOT EXISTS public.telegram_users (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    telegram_user_id  text        NOT NULL,
    telegram_username text,
    is_active         boolean     NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Ensure a Telegram user can only have one active company mapping at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_one_active_per_user
    ON public.telegram_users (telegram_user_id)
    WHERE is_active = true;

-- Prevent duplicate mappings for the same company/user pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_company_user
    ON public.telegram_users (company_id, telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_users_company_active
    ON public.telegram_users (company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_telegram_users_active_user
    ON public.telegram_users (telegram_user_id)
    WHERE is_active = true;

ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read mappings for companies they belong to.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'telegram_users'
          AND policyname = 'telegram_users_authenticated_read_own'
    ) THEN
        CREATE POLICY telegram_users_authenticated_read_own
            ON public.telegram_users
            FOR SELECT
            TO authenticated
            USING (public.user_in_company(company_id));
    END IF;
END
$$;

DROP TRIGGER IF EXISTS telegram_users_updated_at ON public.telegram_users;
CREATE TRIGGER telegram_users_updated_at
    BEFORE UPDATE ON public.telegram_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
