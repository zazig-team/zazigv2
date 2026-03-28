status: pass
summary: Broke startup preflight check feature into 2 jobs covering required tool validation and optional tool warnings
jobs_created: 2
dependency_depth: 2

## Jobs

### Job 1: Implement core preflight: required tool version checks
- ID: 4008c4a4-2d85-47e2-8b3f-133db7df38d4
- Complexity: medium
- Role: senior-engineer
- depends_on: []

Implements the collect-all-failures pattern for required tools (git >=2.29.0, tmux any, node >=20.0.0, gh >=2.0.0, jq any), keeps existing claude check intact, adds version parsing helper with resilient format handling, exits with code 1 only after collecting all failures.

### Job 2: Add optional tool warnings to preflight (bun, codesign)
- ID: 0db5c3d4-4c3e-4d9a-b45e-52bdc48e1a9e
- Complexity: simple
- Role: junior-engineer
- depends_on: [4008c4a4-2d85-47e2-8b3f-133db7df38d4]

Adds bun warning (ZAZIG_ENV=staging only) and codesign warning (macOS only) as non-blocking optional checks. Preserves codexInstalled boolean for downstream config.

## Dependency Graph

```
Job 1 (core required checks) → Job 2 (optional warnings)
```

Max chain length: 2
