# Phase 0.1 - 可观测性基线

- Status: Done
- Updated: 2026-04-09

## 目标

建立可追踪、可回放、可断言的最小观测链路。

## 交付

1. `docs/trace-model.md`
2. `src/observability/*`
3. `scripts/trace-tail.sh`
4. `src/__tests__/phase0_1_observability.test.ts`

## 验收

1. 生成并回放 `.trace/trace.jsonl`
2. 断言规则可识别链路异常
