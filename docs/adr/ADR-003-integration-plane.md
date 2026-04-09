# ADR-003 Integration Plane

## Context
- 当前 Provider 由 `src/api/client.ts` 直接绑定 Anthropic SDK。
- 外部能力（MCP/Plugin/Skill）尚未接入统一注册面。
- 后续需要把内建工具与外接能力并入同一集成平面。

## Decision
- 定义 `IProvider` 契约，冻结最小能力：`stream(params)` 与 `healthcheck()`。
- 在 `src/platform/provider/anthropic-provider.ts` 提供当前实现的适配器，避免 core 层直接依赖具体 SDK 细节。
- 新建 `src/platform/integration/` 占位模块，冻结 Integration Registry 的输入输出类型。

## Consequences
- 后续引入多 Provider/MCP/Plugin 时，可在 platform 层扩展，不侵入 query 核心。
- 当前仍以 Anthropic 为唯一 provider，行为保持不变。
- 需要在 Phase 3 补齐真实插件发现、加载与可用性管理。

## Rejected options
- 继续在 `api/client.ts` 直接扩展多 provider：会把协议、鉴权、降级逻辑混入单文件。
- 先做 MCP/Plugin 业务代码再定义边界：会导致集成方式不一致，难以收敛。
