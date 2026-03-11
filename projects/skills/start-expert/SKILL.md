# Start Expert Session

Use when the user needs or you are suggesting specialized expert help. Compose a structured brief from the current conversation context and trigger an expert session.

Experts run on a dedicated branch named `expert/{role}-{session-id}`. The session manager automatically pushes that branch, merges it to `master`, and cleans it up when the expert is done.

## Skill Steps

1. **Identify the need**: What specific expertise is required? What should the expert accomplish?

2. **Choose the role**: Select from the expert roster in your CLAUDE.md. Use the exact `name` value.

3. **Compose the brief** — structured handoff with:
   - **Goal**: What the expert needs to accomplish
   - **Context**: Relevant background, current state, constraints
   - **Expected output**: What should be delivered (code merged, report written, etc.)
   - **Resources**: Any specific files, repos, or tools the expert will need

4. **Get machine_id**: Read from `.claude/workspace-config.json` (field: `machineId`) or from the `ZAZIG_MACHINE_ID` environment variable.

5. **Call the MCP tool**:

   ```
   start_expert_session({
     role_name: "<exact role name>",
     brief: "<structured brief>",
     machine_id: "<machineId>",
     project_id: "<project_id if repo access needed>"
   })
   ```

6. **Confirm to user**: "Expert session started. Your terminal will switch to the expert window. The expert's summary will appear here when done."
