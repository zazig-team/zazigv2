# Terminal Notifications Feature Research — Index

**Research completed:** 2026-03-01  
**Feature ID:** d4f1866 (merged to master 2026-02-24)  
**Status:** Fully implemented and deployed

---

## Research Documents

Three comprehensive documents have been written to this workspace:

### 1. TERMINAL_NOTIFICATIONS_SUMMARY.md
**Quick reference guide for executives and builders**

- What the feature does (real-time notifications to CPO terminal)
- High-level architecture diagram
- 8 notification triggers in pipeline
- Technical requirements (database, infrastructure, system)
- Step-by-step "how it works"
- Error handling matrix
- Performance characteristics
- Manual build checklist
- Known limitations
- Test coverage overview

**Use this for:** Understanding the feature at a glance, verifying it's working, writing high-level docs

### 2. TERMINAL_NOTIFICATIONS_RESEARCH.md
**Comprehensive technical architecture document**

- Complete overview of the notification system
- Detailed component descriptions (orchestrator, local agent, message protocol)
- All 8 notification triggers with message formats and purposes
- Wiring requirements for manual build
- Implementation status (what's merged, what's tested, what's deployed)
- Known limitations and workarounds
- Code references with line numbers
- Suggestions for manual documentation structure

**Use this for:** Technical implementation decisions, design reviews, comprehensive build documentation

### 3. TERMINAL_NOTIFICATIONS_CODE_GUIDE.md
**Line-by-line code reference with examples**

- Complete `notifyCPO` function source code (lines 1653-1700)
- Database queries with SQL
- Message payload structure
- Error handling matrix
- All 5 notification trigger code snippets (with examples)
- Local agent message handler source code
- Message queue management implementation
- Message injection with tmux integration
- Shared protocol `MessageInbound` type definition
- Test code (2 passing tests)
- Verification checklist with bash commands
- Debugging guide for common issues
- Integration points summary

**Use this for:** Implementation reference, copying exact code, debugging, test verification

---

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Feature ID** | d4f1866 |
| **Status** | Merged to master |
| **Merge date** | 2026-02-24 |
| **Test status** | 2/2 tests passing |
| **Dependencies** | Supabase Realtime, tmux, local agent v2.0+ |
| **Notification triggers** | 8 points in pipeline |
| **Code files** | 5 (orchestrator, local agent, shared, tests) |
| **Lines changed** | 570 insertions, 146 deletions |
| **Performance** | <100ms latency (orchestrator to terminal) |

---

## Code Locations

**Orchestrator function:**
- File: `supabase/functions/orchestrator/index.ts`
- Function: `notifyCPO(supabase, companyId, text)`
- Lines: 1653-1700
- Callers: 1191, 1250, 1269, 1299, 1316, 1343, 2608, 3023, 3137, 3154, 3284

**Local agent handler:**
- File: `packages/local-agent/src/executor.ts`
- Methods: `handleMessageInbound`, `enqueueMessage`, `processMessageQueue`, `injectMessage`
- Constant: `CPO_STARTUP_DELAY_MS = 15_000`

**Shared protocol:**
- File: `packages/shared/src/messages.ts`
- Type: `MessageInbound` interface
- Type guard: `isMessageInbound(msg)`

**Tests:**
- File: `supabase/functions/orchestrator/orchestrator.test.ts`
- Tests: "notifyCPO — sends MessageInbound to CPO machine", "notifyCPO — no active CPO..."

---

## Notification Triggers

| # | Trigger | When | Message Format |
|---|---------|------|-----------------|
| 1 | Breakdown Complete | Job type = "breakdown" | Feature "{title}" broken into {N} jobs. {M} immediately dispatchable. |
| 2 | Project Created | Job role = "project-architect" | Project "{name}" created with {N} feature outlines. Ready for your review. |
| 3 | Verification Passed | Combine job, result starts "PASSED" | Feature "{title}" verified — PR ready for review: {url} |
| 4 | Verification Inconclusive | Combine job, result starts "INCONCLUSIVE" | Verification inconclusive for feature {id}: {snippet}. Needs manual triage. |
| 5 | Verification Failed | Verify job, passed = false | Feature "{title}" failed verification: {snippet}. Needs triage. |
| 6 | Test Deploy Failed | Deploy job, no URL match | Test deploy failed for feature {id}: {snippet} |
| 7 | Verification Retry | handleVerificationFailed | Verification failed for "{title}": {snippet}. Returning to building with a fix job. |
| 8 | Stuck Recovery | processFeatureLifecycle | Feature {id} was stuck in deploying_to_test. Rolled back to verifying for retry. |

---

## How to Use These Documents

### For Manual Build Documentation

1. Start with **TERMINAL_NOTIFICATIONS_SUMMARY.md**
   - Copy the architecture diagram
   - Reference the checklist
   - Adapt the "How It Works" section

2. Use **TERMINAL_NOTIFICATIONS_RESEARCH.md**
   - Copy wiring requirements section
   - Reference notification catalog for triggers
   - Use known limitations section
   - Copy code references

3. Reference **TERMINAL_NOTIFICATIONS_CODE_GUIDE.md**
   - For exact function signatures
   - For complete code snippets to include
   - For test examples
   - For debugging troubleshooting

### For Code Review

1. Read **TERMINAL_NOTIFICATIONS_SUMMARY.md** for context
2. Review exact code in **TERMINAL_NOTIFICATIONS_CODE_GUIDE.md**
3. Check test coverage section
4. Reference implementation status in **TERMINAL_NOTIFICATIONS_RESEARCH.md**

### For Troubleshooting

1. Check known limitations section of **TERMINAL_NOTIFICATIONS_SUMMARY.md**
2. Follow debugging guide in **TERMINAL_NOTIFICATIONS_CODE_GUIDE.md**
3. Review error handling matrix in **TERMINAL_NOTIFICATIONS_SUMMARY.md**
4. Refer to wiring requirements in **TERMINAL_NOTIFICATIONS_RESEARCH.md**

---

## Key Takeaways

1. **Feature is complete:** All code is in master, tested, and operational
2. **No build changes needed:** Feature requires no configuration beyond standard setup
3. **Fully documented:** All 3 documents provide comprehensive reference material
4. **Easy to verify:** Checklist and debugging guide provided for manual validation
5. **Production-ready:** Used in live pipeline, 8 notification triggers active

---

## Next Steps for Manual Build Documentation

Recommended structure for a comprehensive build manual:

```
1. Introduction
   - What Terminal Notifications are
   - Why they matter (CPO visibility)
   - Quick example

2. Architecture Overview
   - System diagram (from SUMMARY)
   - Component descriptions (from RESEARCH)
   - Message flow (from RESEARCH)

3. Implementation Details
   - Orchestrator function (from CODE_GUIDE)
   - Local agent handler (from CODE_GUIDE)
   - Protocol definition (from CODE_GUIDE)

4. Notification Catalog
   - All 8 triggers (from RESEARCH)
   - Message formats (from CODE_GUIDE)
   - When they occur in pipeline

5. Setup & Deployment
   - Requirements checklist (from SUMMARY)
   - Wiring requirements (from RESEARCH)
   - Verification steps (from CODE_GUIDE)

6. Testing
   - Test descriptions (from CODE_GUIDE)
   - How to run tests (from CODE_GUIDE)
   - Expected outcomes

7. Troubleshooting
   - Common issues (from CODE_GUIDE)
   - Debugging steps (from CODE_GUIDE)
   - Error handling (from SUMMARY)

8. Appendix
   - Code references (from all three)
   - File locations (from CODE_GUIDE)
   - SQL queries (from CODE_GUIDE)
```

---

## Document Quality Checklist

All three documents include:

- [x] Clear title and purpose statement
- [x] Specific code locations with line numbers
- [x] Complete function definitions
- [x] Example message formats
- [x] Error handling scenarios
- [x] Testing guidance
- [x] SQL queries where applicable
- [x] Troubleshooting section
- [x] Integration points
- [x] Known limitations
- [x] Performance characteristics

---

## Research Metadata

- **Researcher:** Claude Opus 4.6
- **Repository:** /Users/tomweaver/Documents/GitHub/zazigv2
- **Branch:** master
- **Research date:** 2026-03-01
- **Feature status:** Merged and deployed
- **Related feature:** DAG-aware job dispatch (same commit d4f1866)
- **Related feature:** CPO deference system (depends on this feature)

---

## Files Generated

1. `/Users/tomweaver/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/TERMINAL_NOTIFICATIONS_SUMMARY.md` — Executive summary
2. `/Users/tomweaver/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/TERMINAL_NOTIFICATIONS_RESEARCH.md` — Technical research
3. `/Users/tomweaver/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/TERMINAL_NOTIFICATIONS_CODE_GUIDE.md` — Code reference
4. `/Users/tomweaver/.zazigv2/00000000-0000-0000-0000-000000000001-cpo-workspace/RESEARCH_INDEX.md` — This index

---

## Conclusion

The Terminal Notifications feature is fully implemented, tested, and ready for manual build documentation. All three research documents provide different levels of detail suitable for different audiences and use cases. Start with the SUMMARY for context, use RESEARCH for architecture decisions, and refer to CODE_GUIDE for implementation details.

