status: pass
summary: Implemented a new Supabase edge function at supabase/functions/idea-messages with authenticated GET/POST CRUD behavior, validation, and idea existence checks, and added a migration to set REPLICA IDENTITY FULL for idea_messages realtime payloads.
files_changed:
  - supabase/functions/idea-messages/index.ts
  - supabase/functions/idea-messages/deno.json
  - supabase/migrations/252_idea_messages_replica_identity.sql
failure_reason: ""
