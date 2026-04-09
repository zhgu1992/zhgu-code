# Phase 1 - Query Engine v2

- Status: In Progress
- Updated: 2026-04-09

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
