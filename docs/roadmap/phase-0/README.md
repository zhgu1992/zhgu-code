# Phase 0 - 架构冻结

- Status: Done
- Updated: 2026-04-09

## 目标

冻结核心架构边界，避免边做边改。

## 交付

1. 4 份 ADR（query / execution-permission / integration / orchestration）
2. 4 个核心契约接口（`IQueryEngine` / `IToolRuntime` / `IProvider` / `IOrchestrator`）
3. 最小目录重组（`application` / `platform` / `architecture`）

## 验收

1. `build / typecheck / test` 基线通过
2. 契约可被现有代码引用
