# zazigv2 Roadmap

## Vision
A reliable, distributed orchestration system that manages zazig exec agents across multiple machines — deterministic dispatching, real-time communication, and automatic recovery. CPO remains the persistent human interface; everything else is ephemeral and card-driven.

## Now
- Scaffold TypeScript monorepo (orchestrator + local agent)
- Set up Supabase project (Postgres schema, Realtime channels, Edge Functions)
- Implement local agent daemon (websocket connect, heartbeat, command execution)
- Implement orchestrator core (poll job queue, check slots, dispatch to local agents, track jobs)

## Next
- **Triggers and events infrastructure** — the reactive layer that makes agents wake up and respond to events. 9 subsystems: deep heartbeat, cron/scheduler, universal wake, events queue (claim/ack), lifecycle hooks, concurrency lanes, external triggers, emergency stop, daemon restart recovery. Design complete (V2.2), ready to cardify. See [`triggers-and-events-design.md`](plans/2026-02-22-triggers-and-events-design.md)
- **Bidirectional messaging** — Slack inbound/outbound via platform adapters + MCP server. Pending unification with events queue (see triggers doc). See [`agent-messaging-bidirectional.md`](plans/2026-02-22-agent-messaging-bidirectional.md)
- CPO health monitoring + failover via local agent (covered by triggers doc Section 1: deep heartbeat)
- Card annotation parsing (complexity + card-type)
- Review pipeline (auto-dispatch reviewers based on card type)
- Web UI for job queue and machine status (Tom)

## Interaction Design
Voice interaction is critical to exec onboarding — how users first meet and calibrate their exec team. Tied to the web UI mockups.
- Voice interface for exec onboarding (spike ElevenAgents → evaluate Qwen3-TTS/Pipecat path)
- Exec intro flow: first conversation with each agent on onboarding
- Voice character derived from exec personality coordinates (VoiceDesign concept)

## Later
- Credential scrubbing in agent output
- Structured memory types (Supabase tables)
- Memory bulletin (ambient context for CPO)
- Message coalescing for multi-user chat
- Query-based model routing for CPO responses
