# Phase 0.1 - 可观测性基线

- Status: Done
- Updated: 2026-04-09

## 启动前对标结论（归档）

- 对标状态: Completed
- 对标日期: 2026-04-09
- 对标范围: Trace Model / Bus / Sink / Replay Assertions
- 参考源码:
  - `claude-code-run/src/observability/*`
  - `claude-code-run/src/core/query.ts`

### 结论

1. 已对齐项: 最小可追踪、可回放、可断言链路
2. 差异项: 与 Query 状态机语义深度对齐待 Phase 1 完成
3. 本阶段范围:
- In Scope: 观测基线
- Out of Scope: 全量调试平台能力

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
