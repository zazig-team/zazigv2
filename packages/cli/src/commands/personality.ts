/**
 * personality.ts — zazig personality <role> [--show | --archetype [name]]
 *
 * Manages exec agent personality configuration stored in Supabase.
 * Uses authenticated JWT for API calls. company_id from credentials.
 *
 * Usage:
 *   zazig personality cpo --show
 *   zazig personality cpo --archetype
 *   zazig personality cpo --archetype "The Strategist"
 */

import { getValidCredentials } from "../lib/credentials.js";

interface RoleRow {
  id: string;
  name: string;
}

interface ArchetypeRow {
  id: string;
  display_name: string;
  voice_notes: string;
  dimensions: Record<string, { default: number; bounds: [number, number]; rate?: number }>;
}

interface PersonalityRow {
  archetype_id: string;
  user_overrides: Record<string, number>;
  evolved_state: Record<string, number>;
  is_frozen: boolean;
  archetype: ArchetypeRow;
}

async function apiFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function personality(args: string[]): Promise<void> {
  const [role, ...flags] = args;

  if (!role) {
    console.error("Usage: zazig personality <role> [--show | --archetype [name]]");
    process.exitCode = 1;
    return;
  }

  const showFlag = flags.includes("--show");
  const archetypeIdx = flags.indexOf("--archetype");
  const hasArchetypeFlag = archetypeIdx >= 0;
  const archetypeRaw = hasArchetypeFlag ? flags[archetypeIdx + 1] : undefined;
  const archetypeValue =
    archetypeRaw && !archetypeRaw.startsWith("--") ? archetypeRaw : undefined;

  if (!showFlag && !hasArchetypeFlag) {
    console.error("Usage: zazig personality <role> [--show | --archetype [name]]");
    process.exitCode = 1;
    return;
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const companyId = creds.companyId;

  const headers: Record<string, string> = {
    apikey: creds.anonKey,
    Authorization: `Bearer ${creds.accessToken}`,
    "Content-Type": "application/json",
  };

  let roleRows: RoleRow[];
  try {
    roleRows = await apiFetch<RoleRow[]>(
      `${creds.supabaseUrl}/rest/v1/roles` +
        `?select=id,name` +
        `&name=eq.${encodeURIComponent(role)}` +
        `&limit=1`,
      headers
    );
  } catch (err) {
    console.error(`Failed to look up role: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (roleRows.length === 0) {
    console.error(`Unknown role: ${role}`);
    process.exitCode = 1;
    return;
  }

  const roleId = roleRows[0]!.id;

  try {
    if (showFlag) {
      await showPersonality(creds.supabaseUrl, companyId, headers, role, roleId);
    } else if (hasArchetypeFlag && archetypeValue) {
      await switchArchetype(
        creds.supabaseUrl,
        companyId,
        headers,
        role,
        roleId,
        archetypeValue
      );
    } else {
      await listArchetypes(creds.supabaseUrl, companyId, headers, role, roleId);
    }
  } catch (err) {
    console.error(`Error: ${String(err)}`);
    process.exitCode = 1;
  }
}

async function showPersonality(
  supabaseUrl: string,
  companyId: string,
  headers: Record<string, string>,
  roleName: string,
  roleId: string
): Promise<void> {
  const rows = await apiFetch<PersonalityRow[]>(
    `${supabaseUrl}/rest/v1/exec_personalities` +
      `?select=archetype_id,user_overrides,evolved_state,is_frozen,archetype:exec_archetypes(id,display_name,voice_notes,dimensions)` +
      `&company_id=eq.${encodeURIComponent(companyId)}` +
      `&role_id=eq.${encodeURIComponent(roleId)}` +
      `&limit=1`,
    headers
  );

  if (rows.length === 0) {
    console.log(`No personality configured for ${roleName}.`);
    console.log(`Run 'zazig personality ${roleName} --archetype' to select one.`);
    return;
  }

  const p = rows[0]!;
  const a = p.archetype;

  console.log(`${roleName.toUpperCase()} Personality — ${a.display_name}`);
  console.log("─".repeat(40));

  const dims = a.dimensions ?? {};
  const dimNames = Object.keys(dims);

  if (dimNames.length > 0) {
    const colWidth = Math.max(9, ...dimNames.map((d) => d.length)) + 2;
    console.log(
      "Dimension".padEnd(colWidth) +
        "Current".padEnd(9) +
        "Default".padEnd(9) +
        "Bounds"
    );
    for (const dim of dimNames) {
      const info = dims[dim]!;
      const current =
        p.user_overrides[dim] !== undefined
          ? p.user_overrides[dim]!
          : p.evolved_state[dim] !== undefined
            ? p.evolved_state[dim]!
            : info.default;
      console.log(
        dim.padEnd(colWidth) +
          String(current).padEnd(9) +
          String(info.default).padEnd(9) +
          `[${info.bounds[0]}, ${info.bounds[1]}]`
      );
    }
    console.log("");
  }

  if (a.voice_notes) {
    console.log(`Voice:  ${a.voice_notes}`);
  }
  console.log(`Status: active`);
  console.log(`Frozen: ${p.is_frozen ? "yes" : "no"}`);
}

async function listArchetypes(
  supabaseUrl: string,
  companyId: string,
  headers: Record<string, string>,
  roleName: string,
  roleId: string
): Promise<void> {
  const [archetypes, pRows] = await Promise.all([
    apiFetch<Array<Pick<ArchetypeRow, "id" | "display_name" | "voice_notes">>>(
      `${supabaseUrl}/rest/v1/exec_archetypes` +
        `?select=id,display_name,voice_notes` +
        `&role_id=eq.${encodeURIComponent(roleId)}` +
        `&order=display_name.asc`,
      headers
    ),
    apiFetch<Array<{ archetype_id: string }>>(
      `${supabaseUrl}/rest/v1/exec_personalities` +
        `?select=archetype_id` +
        `&company_id=eq.${encodeURIComponent(companyId)}` +
        `&role_id=eq.${encodeURIComponent(roleId)}` +
        `&limit=1`,
      headers
    ).catch(() => [] as Array<{ archetype_id: string }>),
  ]);

  if (archetypes.length === 0) {
    console.log(`No archetypes available for ${roleName}.`);
    return;
  }

  const currentArchetypeId = pRows.length > 0 ? pRows[0]!.archetype_id : null;

  console.log(`${roleName.toUpperCase()} Archetypes:`);
  const maxNameLen = Math.max(...archetypes.map((a) => a.display_name.length));

  for (const a of archetypes) {
    const voice = a.voice_notes ? a.voice_notes.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const suffix = voice ? ` — ${voice}` : "";
    console.log(`  ${a.display_name.padEnd(maxNameLen)}${suffix}`);
  }

  const currentName = archetypes.find((a) => a.id === currentArchetypeId)?.display_name ?? null;
  console.log("");
  console.log(`Current: ${currentName ?? "(none)"}`);
  console.log(`Run 'zazig personality ${roleName} --archetype "<name>"' to switch.`);
}

async function switchArchetype(
  supabaseUrl: string,
  companyId: string,
  headers: Record<string, string>,
  roleName: string,
  roleId: string,
  archetypeName: string
): Promise<void> {
  const archetypes = await apiFetch<Array<{ id: string; display_name: string }>>(
    `${supabaseUrl}/rest/v1/exec_archetypes` +
      `?select=id,display_name` +
      `&role_id=eq.${encodeURIComponent(roleId)}` +
      `&display_name=eq.${encodeURIComponent(archetypeName)}` +
      `&limit=1`,
    headers
  );

  if (archetypes.length === 0) {
    console.error(`No archetype found named "${archetypeName}" for role ${roleName}.`);
    process.exitCode = 1;
    return;
  }

  const archetype = archetypes[0]!;
  console.log(`Warning: switching archetype resets all evolved dimensions and overrides.`);
  console.log(`Switching ${roleName.toUpperCase()} to "${archetype.display_name}"...`);

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/exec_personalities?on_conflict=company_id,role_id`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: companyId,
        role_id: roleId,
        archetype_id: archetype.id,
        evolved_state: {},
        user_overrides: {},
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`HTTP ${resp.status} — ${errText}`);
  }

  console.log("Done. Evolved state and overrides reset.");
}
