# Phase 2.5 - Context Monitoring Plane：给读者的核心总结

> 读者定位：想理解系统“为什么要先做监控平面，再做压缩策略”的人。  
> 非目标：逐函数实现细节、逐行 API 文档。

## 1. Phase 2.5 到底在解决什么

Phase 2.5 的本质不是“先做一版压缩”，而是把 context 治理从“分散检查”升级成“统一监控平面”。

这里的“统一监控平面”指 4 件事：
1. 可见：每个回合都有统一的 context usage 与阈值状态。
2. 可判定：warning/blocking 语义与 reasonCode 固定，不靠临时判断。
3. 可追踪：监控信号可回放、可断言，而不是仅靠日志观察。
4. 可交接：为 Phase Extra 的压缩策略提供稳定输入与标准 TODO 包。

## 2. 核心能力解决了哪些问题

### 2.1 Context Health Snapshot（统一健康快照）

核心能力：在 `preflight/streaming/done` 三个采样点输出统一快照契约。

解决的问题：
1. usage 统计分散，来源口径不一致。
2. 阈值状态缺少统一抽象，策略接入点不稳定。
3. provider usage 缺失时，估算与真实值边界不清。

现在的收益：
1. `usage/limits/status/source/estimated` 语义收敛。
2. 不同采样点只数值变化，字段保持一致。
3. 后续策略可以直接消费快照，不必重复建模。

---

### 2.2 Context Warning/Blocking 事件统一

核心能力：把 `context.warning/context.blocking` 事件与 reasonCode 统一成结构化契约。

解决的问题：
1. warning/blocking 判定与发射路径分散，语义容易漂移。
2. 缺少稳定 reasonCode，观测层难做自动断言。
3. 监控写入异常可能影响主链路稳定性。

现在的收益：
1. 事件 payload 固化（metric/actual/limit/ratio/source/estimated）。
2. `context_near_limit/context_limit_exceeded` 可自动验证。
3. 采用 fail-open：观测失败降级为 info，不阻断 query 主流程。

---

### 2.3 `/context` 命令视图对齐

核心能力：命令层只消费健康快照，不允许二次推导 ratio/status。

解决的问题：
1. 命令展示与运行时实际状态可能出现偏差。
2. 命令层重复计算导致“看起来安全，实际已接近上限”。
3. 无快照时体验不稳定（空输出或异常堆栈）。

现在的收益：
1. `/context` 与 query 视图口径一致。
2. 无数据场景有结构化 `no_data` 响应。
3. 排障时以单一事实源为准，减少认知分叉。

---

### 2.4 Compression TODO Pack（交接包）

核心能力：把压缩后置任务整理为可执行交接包，供 Phase Extra 直接消费。

解决的问题：
1. 阶段切换时容易丢失约束、风险和验证基线。
2. Extra 阶段可能重复探索或越界实现。
3. 缺少“先消费文档再实现”的硬约束。

现在的收益：
1. 明确 Entry Criteria、Strategy Backlog、Risk Register、Verification Baseline、Rollback Plan。
2. CTXM 基线可继承扩展，而不是重定义语义。
3. Phase Extra 进入实现前有可检查的准入门。

---

### 2.5 System Prompt 缓存前缀对齐

核心能力：把 system prompt 从单字符串改为稳定前缀 + 动态后缀的 block 化组装。

解决的问题：
1. 动态字段可能污染前缀，导致缓存命中不稳定。
2. prompt 组装策略难以验证与回退。
3. 缺少“静态可缓存、动态短生命周期”的结构化表达。

现在的收益：
1. 前缀稳定可复用，提升跨 turn cache 命中机会。
2. 动态信息后置，避免影响前缀 hash。
3. 支持回退到 legacy 单字符串组装，保证兼容。

## 3. Phase 2.5 的核心设计思路（最重要）

1. **先监控，后策略**。  
   在自动化压缩前，先冻结观察口径与阈值语义。

2. **非侵入优先，主链路优先**。  
   监控能力异常时优先降级，不影响 query 主链路可用性。

3. **单一事实源优先**。  
   命令、事件、断言都应基于同一 Context Health 模型。

4. **阶段边界明确**。  
   Phase 2.5 只做监控与信号；压缩编排统一后置到 Phase Extra。

5. **交接可执行，不靠口头同步**。  
   TODO Pack 作为阶段接口，保证后续实现可继承、可验证、可回滚。

## 4. 截至 2026-04-10 的阶段状态

1. 阶段状态：`Not Started`。
2. 启动门禁：对标结论仍为 `Pending`，未完成对标前不得进入实现。
3. 已冻结范围：
- In Scope：context 监控、告警、阻断信号、命令输出统一、观测事件。
- Out of Scope：自动压缩策略、reactive/collapse 编排、复杂 overflow 恢复链。

## 5. 对学习者最值得带走的方法论

如果只带走一条链，建议是：

**健康快照（可见） -> 信号事件（可判定） -> 命令对齐（可操作） -> 交接包（可延续） -> 策略扩展（可治理）**

## 6. 相关文档（可跳转）

1. [Phase 2.5 路线与工作包](../../../roadmap/phase-2-5/README.md)
2. [Compression TODO Pack](../../../roadmap/phase-2-5/compression-todo-pack.md)
3. [Phase Extra 路线](../../../roadmap/phase-extra/README.md)
4. [总路线图](../../../roadmap/master-roadmap.md)
5. [Phase 2 读者导读](../phase-2-execution-plane/README.md)
