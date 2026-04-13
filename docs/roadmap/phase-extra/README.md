# Phase Extra - Advanced Modules（总览）

- Status: Not Started
- Updated: 2026-04-13

## 文档拆分

为避免 Extra-A（压缩）和 Extra-B（MCP/集成）混写，本目录按能力拆分为两份执行文档：

1. [Extra-A - Context Advanced（压缩/恢复/质量）](./extra-a-context-advanced.md)
2. [Extra-B - Integration Advanced（MCP/Plugin/Skill）](./extra-b-integration-advanced.md)

## 阶段目标

作为 Phase 5 之后的“复杂能力缓冲层”，承接独立模块化的高复杂度工作，并确保：

1. 复杂能力可独立灰度、独立回滚。
2. 任一 Extra 模块不反向污染主链路。
3. 不破坏 `phase1_* ~ phase5_*` 前置门。

## 前置约束

1. 先完成 [Phase 2.5 - Context Monitoring Plane](../phase-2-5/README.md)。
2. Extra-A 实现前必须先消费 [Compression TODO Pack](../phase-2-5/compression-todo-pack.md)。
3. Extra-B 实现前必须先消费 [Phase 3 Deferred 清单](../phase-3/README.md)。

## 共通原则

1. 模块解耦优先：复杂能力以独立模块接入，不改动主干职责边界。
2. 灰度可控优先：所有新能力必须具备 feature flag 和快速回退路径。
3. 量化验收优先：每条子轨都必须有指标、测试、回滚三件套。

## 共通 WIP（阶段级）

执行规则：当进入“执行小步骤”或“讨论 wipxxx”时，若未完成门禁讨论，先补讨论再实现。  
门禁新增要求：`为什么做 + 问题与边界` 为必填；未补齐不得从 `Pending` 进入 `In Progress`。

| WIP | 为什么做 + 问题与边界 | 超越目标 | 核心设计 | 验证Case/DoD | 风险回滚 | 状态 |
|---|---|---|---|---|---|---|
| `wipx-01` 对标与门禁基线 | Extra 阶段需要统一承接复杂模块，避免临时插单 | 固化 A/B 双子轨准入规则与文档模板 | 完成对标结论、里程碑、执行与回滚框架 | 文档可直接排期且门禁字段完整 | 不通过仅回退文档 | Pending |
| `wipx-08` Future 模块扩展位 | 后续复杂项缺少落位策略 | 把后续复杂功能统一纳入 Extra | 新增模块接入模板与准入条件 | `XMOD-001~004` 通过 | 不满足准入不允许入场 | Pending |
| `wipx-09` 阶段收口与主路线回写 | 缺少 Extra 阶段收口机制 | 形成可持续迭代的复杂模块池 | 汇总验证证据、风险豁免、回滚清单 | `phase-extra_* + 前置门` 全绿 | 未达标不并入默认策略 | Pending |

## 执行顺序

1. 阶段公共入口：`wipx-01`
2. 子轨并行：
   - Extra-A: 见 `extra-a-context-advanced.md`
   - Extra-B: 见 `extra-b-integration-advanced.md`
3. 阶段收口：`wipx-09`

## 阶段完成标准（DoD）

1. Extra 模块具备统一接入模板、验证模板、回滚模板。
2. A/B 子轨均通过各自专项门禁并保留证据。
3. 不引入 Phase 1~5 回归失败。
4. 完成主路线图与架构文档回写。
