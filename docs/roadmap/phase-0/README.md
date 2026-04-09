# Phase 0 - 架构冻结

- Status: Done
- Updated: 2026-04-09

## 启动前对标结论（归档）

- 对标状态: Completed
- 对标日期: 2026-04-09
- 对标范围: 架构边界、契约接口、目录重组
- 参考源码:
  - `claude-code-run/src/core/*`
  - `claude-code-run/src/tools/*`
  - `claude-code-run/src/services/*`

### 结论

1. 已对齐项: 核心边界抽象和契约冻结流程
2. 差异项: 深层能力实现仍在后续 Phase
3. 本阶段范围:
- In Scope: ADR + 接口冻结 + 最小重组
- Out of Scope: 业务能力追平

## 目标

冻结核心架构边界，避免边做边改。

## 交付

1. 4 份 ADR（query / execution-permission / integration / orchestration）
2. 4 个核心契约接口（`IQueryEngine` / `IToolRuntime` / `IProvider` / `IOrchestrator`）
3. 最小目录重组（`application` / `platform` / `architecture`）

## 验收

1. `build / typecheck / test` 基线通过
2. 契约可被现有代码引用
