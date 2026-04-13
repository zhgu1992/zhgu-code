# Phase 3 - Integration Plane：给读者的核心总结

> 读者定位：想理解系统“如何把 MCP/Plugin/Skill 接入做成统一治理平面”的人。  
> 非目标：逐函数实现细节、逐行 API 文档。

## 1. Phase 3 到底在解决什么

Phase 3 的本质不是“接上几个外部能力”，而是把外部能力接入从“能用”升级为“可注册、可隔离、可观测、可回退”。

这里的“接入治理”核心是 4 件事：
1. 可统一：内建与外接能力进入同一注册面，不再多入口拼接。
2. 可控边界：来源校验、安全门、熔断策略统一收敛。
3. 可解释：接入失败与禁用都有结构化原因（reasonCode + module + userMessage）。
4. 可回退：异常时可按 provider/plugin 粒度禁用，必要时回到仅内建模式。

## 2. 核心能力解决了哪些问题

### 2.1 最小 MCP 生命周期通路（WP3-A）

核心能力：统一 provider 生命周期状态（ready/degraded/disabled）与失败语义。

解决的问题：
1. 连接状态分散，失败定位成本高。
2. 没有统一重试/降级语义。
3. 连接异常容易污染主链路。

现在的收益：
1. 连接状态可追踪、可测试。
2. 失败路径结构化，便于审计与排障。
3. 为后续熔断和注册面提供稳定输入。

---

### 2.2 最小 Plugin/Skill 装载协议（WP3-B）

核心能力：统一 `discovered -> loaded|disabled` 装载状态机与最小 manifest/目录协议。

解决的问题：
1. 各来源装载口径不一致，成功/失败行为分叉。
2. 失败原因不可归一，难做批量治理。
3. 来源元数据（`loadedFrom`）缺失导致后续不可判定。

现在的收益：
1. Plugin/Skill 装载链路统一。
2. 失败语义一致（可回放）。
3. 为统一注册面提供来源和状态基础。

---

### 2.3 统一注册面（WP3-C）

核心能力：把 builtin/mcp/plugin/skill 聚合成单一 capability 目录，供 query/runtime 单入口消费。

解决的问题：
1. 多来源能力分散，调度口径不一致。
2. 同名冲突难以统一处理。
3. 上层调用前缺少稳定 `callable` 判定入口。

现在的收益：
1. `listCapabilities/listModelCallableTools/resolveToolCall` 语义稳定。
2. 冲突处理与来源优先级可控。
3. 主链路对接入来源解耦。

---

### 2.4 最小安全隔离与熔断（WP3-D）

核心能力：来源信任校验 + provider/plugin 粒度熔断。

解决的问题：
1. 外接能力默认放行风险高。
2. 异常 provider/plugin 会持续重试放大故障。
3. 安全拒绝不可解释。

现在的收益：
1. 默认 deny + 明确 reasonCode（如 `security_untrusted_source`）。
2. 故障局部化，不拖垮整条链路。
3. 安全决策进入统一可观测事件。

---

### 2.5 最小可视化接线（WP3-E/WP3-07）

核心能力：`integration graph` 快照输出，支持对能力来源/状态/冲突的可视化核对。

解决的问题：
1. 接入问题排查长期依赖日志逐行读。
2. “到底加载了什么、为什么不可调用”难以直接回答。
3. 快照新旧混淆导致误判。

现在的收益：
1. 一条命令可看整体接线状态。
2. `--latest` 可直接查看最新原始快照事件，减少误读。

## 3. Phase 3 的核心设计思路（最重要）

1. **先统一注册面，再谈能力扩展**。  
   没有统一 capability 目录，接入只会增加分叉。

2. **最小可用优先，重型能力后置**。  
   Phase 3 只做最小闭环，复杂 transport/鉴权/企业策略延期到 Extra-B。

3. **安全默认保守**。  
   来源不可信默认拒绝，再通过策略放开。

4. **失败语义先结构化，再优化体验文案**。  
   先保证机器可判定、可追溯，再做交互层优化。

5. **可视化必须基于快照证据**。  
   接入状态以 trace 快照为准，不靠口头推断。

## 4. 截至 2026-04-13 的阶段状态

1. 阶段总状态：`In Progress`（见 roadmap）。
2. 已完成：`wip3-01`（对标与门禁）、`wip3-03`（Plugin/Skill 协议）、`wip3-06`（收口与延期交接）。
3. 进行中：`wip3-07`（最小可视化接线，设计冻结）。
4. 重点约束：重型接入能力（多 transport、复杂鉴权、企业策略）已冻结为 Deferred，统一进入 Extra-B。

## 5. 对学习者最值得带走的方法论

如果只带走一条链，建议是：

**生命周期（可发现） -> 装载协议（可落库） -> 统一注册（可调度） -> 安全熔断（可隔离） -> 快照可视化（可验证）**

## 6. 快速验证命令（实操）

1. 进入项目：

```bash
cd rewrite
```

2. 先跑一轮 query，生成新快照：

```bash
bun run dev -- "hello"
```

3. 查看整理后的 integration 视图：

```bash
bun run dev -- integration graph
```

4. 查看 trace 中“最新原始快照事件”（推荐排障）：

```bash
bun run dev -- integration graph --latest
```

5. 覆盖默认 skill 目录（可选）：

```bash
ZHGU_INTEGRATION_SKILL_DIRS=/abs/skillsA,/abs/skillsB bun run dev -- "hello"
bun run dev -- integration graph --latest
```

## 7. 相关文档（可跳转）

1. [Phase 3 路线与工作包](../../../roadmap/phase-3/README.md)
2. [Phase 3 验收报告](../../../roadmap/phase-3/phase3-acceptance.md)
3. [Phase 3 Deferred 映射](../../../roadmap/phase-3/phase3-deferred-map.md)
4. [Phase Extra-B（Integration Advanced）](../../../roadmap/phase-extra/extra-b-integration-advanced.md)
5. [Phase 2 读者导读](../phase-2-execution-plane/README.md)
