# Phase 1 - Query Engine v2

- Status: In Progress
- Updated: 2026-04-09

## 启动前对标结论（必填）

- 对标状态: Completed
- 对标日期: 2026-04-09
- 对标范围: Query Engine / Streaming / Transcript / Error Recovery
- 参考源码:
  - `claude-code-run/src/core/query.ts`
  - `claude-code-run/src/api/*`
  - `claude-code-run/src/state/*`

### 结论

1. 已对齐项: 待持续更新
2. 差异项:
- 能力覆盖: 待持续更新
- 稳定性: 待持续更新
- 可观测性: 待持续更新
- 安全边界: 待持续更新
- 复杂度: 待持续更新
3. 本阶段范围:
- In Scope: 状态机、预算、恢复、transcript 最小实现
- Out of Scope: 多 Provider、完整编排平面

## 目标

把 Query 引擎从“可跑”升级为“可持续”。

## 核心任务

1. turn 状态机（idle/streaming/tool-running/recovering/stopped）
2. token/context budget
3. compact/collapse 插件点
4. 错误分类与恢复路径
5. 最小 transcript（turn 输入/工具/输出可回放）

## 验收

1. 20+ 轮对话稳定
2. 中断/恢复/重试可测试
3. transcript 可复原主链路
