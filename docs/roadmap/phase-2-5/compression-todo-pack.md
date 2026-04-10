# Compression TODO Pack (WP2.5-D / wip2_5-05)

- Status: Ready for Phase Extra consumption
- Updated: 2026-04-10
- Owner: Phase 2.5
- Scope: Handoff package only, no compression strategy implementation in Phase 2.5

## Entry Criteria

Phase Extra may start compression implementation only after all the following are true:

1. `CTXM-001~004` passed (`phase2_5_context_health.test.ts`).
2. `CTXM-005~008` passed (`phase2_5_context_events.test.ts`).
3. `CTXM-009~010` passed (`phase2_5_context_view.test.ts`).
4. `/context` command is aligned to query snapshot contract (`context-view.ts`).
5. Context warning/blocking events are trace-assertable with reason codes.

## Strategy Backlog

The following candidates are explicitly deferred to Phase Extra:

1. `auto`: proactive compression triggered before hard blocking.
2. `reactive`: recovery-oriented compression after risk escalation.
3. `collapse`: semantic collapsing for low-priority historical turns.
4. `overflow`: overflow handling path with retry/stop governance.

Implementation note:
- Any strategy rollout must be behind feature flags and support `monitoring-only` fallback.

## Risk Register

1. Mis-compression risk: critical context may be removed and cause incorrect tool actions.
2. Jitter risk: repeated compress/restore loops may increase latency and instability.
3. False blocking risk: over-sensitive thresholds may block safe execution paths.
4. Observability drift risk: strategy behavior and trace events may become misaligned.

Mitigation baseline:
- Keep `context.warning/context.blocking` event semantics stable.
- Enforce canary rollout with rollback-ready flags.
- Require regression gates before default enablement.

## Verification Baseline

Phase Extra must inherit and extend CTXM baselines instead of redefining semantics.

Inherited baseline:
1. `CTXM-001~004`: context health snapshot contract.
2. `CTXM-005~008`: warning/blocking events and fail-open behavior.
3. `CTXM-009~010`: `/context` view alignment and `no_data` fallback.
4. `CTXM-011~012`: handoff package completeness and Phase Extra reference consistency.

Planned extension baseline (Phase Extra):
1. `CTXC-*`: compression strategy behavior and quality gate.
2. `CTXR-*`: overflow recovery and circuit-breaker behavior.
3. `CTXQ-*`: compression effectiveness and false-positive guardrails.

## Rollback Plan

Strategy-level rollback:
1. Disable strategy feature flag (`auto/reactive/collapse/overflow`) to stop new behavior.
2. Keep monitoring events enabled for diagnosis.
3. Route execution back to current `budget stop + observability` baseline.

System-level rollback:
1. Enter `monitoring-only` mode for context governance.
2. Freeze Phase Extra rollout and reopen risk review.
3. Re-run hard gates: `build/type/lint/phase1*/phase2*` before retry.

## Dependencies

1. [Phase 2.5 README](./README.md) is the source of CTXM acceptance definitions.
2. [Phase Extra README](../phase-extra/README.md) must reference this TODO pack before implementation.
3. `src/application/query/context-health.ts`, `context-events.ts`, and `context-view.ts` are required inputs for downstream strategy design.
