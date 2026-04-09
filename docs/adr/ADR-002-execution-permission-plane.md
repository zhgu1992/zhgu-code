# ADR-002 Execution Permission Plane

## Context
- 工具执行入口在 `src/tools/executor.ts`，权限模式当前仅有 `auto/ask/plan` 的最小分支。
- Bash 等工具具备执行能力，但缺少统一风险分级与可追踪审计字段。
- Phase 2 目标是从“可调用”升级到“可治理”。

## Decision
- 定义 `IToolRuntime` 契约，冻结执行入口签名：`execute(name, input, store)`。
- 在契约中引入审计结构 `ToolExecutionAudit`，先冻结字段（requestId、风险级别、开始结束时间、是否成功）。
- 维持当前审批 UI 与执行流程，不在 Phase 0 引入新权限策略引擎。

## Consequences
- 后续可在不改调用方的情况下替换工具执行实现（如策略引擎、审计上报、沙箱隔离）。
- 现有执行链路继续可用，Phase 0 回归风险低。
- 风险分级仍是静态占位，真正规则匹配逻辑需在 Phase 2 完成。

## Rejected options
- 在工具定义中直接耦合权限判断：会让每个工具重复实现治理逻辑。
- 等 Phase 2 再定义契约：会导致中间 PR 继续扩散执行入口，增加收敛成本。
