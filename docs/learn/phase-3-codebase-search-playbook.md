# Phase 3 补充：大仓库代码定位实战手册（rg/Glob/Grep）

> 目的：当你说“我要改某个功能”时，快速定位到该改的文件与调用链，避免盲改。
>
> 这份文档是 [docs/tools/search-and-navigation.mdx](../../../docs/tools/search-and-navigation.mdx) 的实战版速查。

## 1. 先建立心智模型

在这个项目里，代码定位不是单个 `codebase` 模块，而是组合能力：

1. 提示词约束（优先用读/搜工具）
2. 搜索工具：`Glob`（按文件名）+ `Grep`（按内容）
3. 文件读取：`Read`
4. 迭代调用循环：搜 -> 读 -> 再搜 -> 缩小范围
5. 可选语义定位：`LSP`（definition/references）

核心文件：

- `src/tools.ts`（工具注册入口）
- `src/tools/GlobTool/GlobTool.ts`
- `src/tools/GrepTool/GrepTool.ts`
- `src/tools/FileReadTool/FileReadTool.ts`
- `src/utils/glob.ts`（基于 ripgrep 文件检索）
- `src/utils/ripgrep.ts`（rg 执行与容错）
- `src/query.ts`（工具调用主循环）
- `src/services/tools/toolOrchestration.ts`（并行调度）
- `src/tools/AgentTool/built-in/exploreAgent.ts`（大范围只读探索）

## 2. `rg` 是什么，为什么是核心

- `rg` 是 ripgrep 的命令名（`rg = ripgrep`）
- 对大仓库性能非常好，适合高频“先定位后修改”
- 支持正则、文件类型过滤、glob 过滤、仅返回文件名等模式

在本项目中：

- `Glob` 的底层依赖 `rg --files` + glob 过滤（见 `src/utils/glob.ts`）
- `Grep` 的底层依赖 `rg <pattern>`（见 `src/utils/ripgrep.ts`）

## 3. 改功能时的标准定位流程（建议固定执行）

1. 先找功能关键词（业务词/文案/接口名/事件名）
2. 用 `rg` 做第一轮全局扫描（宽搜索）
3. 从命中结果中挑 2-5 个入口文件精读
4. 沿调用链继续 `rg`（窄搜索）
5. 确认边界：谁读数据、谁改状态、谁触发副作用
6. 最后再进入修改

一个常用节奏：

```bash
# 1) 找所有相关文本（宽搜索）
rg -n "keyword|featureName|apiName" src

# 2) 只看命中文件列表（快速聚类）
rg -l "keyword|featureName|apiName" src

# 3) 按文件类型收敛
rg -n "keyword|featureName|apiName" src --glob "*.ts" --glob "*.tsx"

# 4) 查调用方/引用方（根据实际符号替换）
rg -n "\bTargetFunction\b\(" src

# 5) 查配置/常量/开关
rg -n "FEATURE_FLAG|configKey|ENV_NAME" src
```

## 4. 常见定位入口（按改动类型）

1. 改 UI 展示/交互
- 先搜文案、组件名、事件处理函数
- 再看状态来源（hook/store/context）

2. 改工具行为
- 从 `src/tools.ts` 确认工具是否注册
- 再进对应 `src/tools/*Tool/` 看 `call()` 实现

3. 改模型/循环策略
- 从 `src/query.ts` 查工具执行与消息推进
- 必要时看 `src/services/tools/toolOrchestration.ts` 的并行策略

4. 改检索本身
- `src/utils/ripgrep.ts`（命令执行、超时、重试、截断）
- `src/utils/glob.ts`（文件筛选、排序、忽略规则）

## 5. 这套能力的安全边界（避免误改）

- 先读后写：编辑/写入工具会检查是否已读文件
- 文件变化保护：若文件在读取后被改动，会要求重读
- 大结果限制：默认会限制返回量，防止上下文被搜索结果淹没

对应代码：

- `src/tools/FileEditTool/FileEditTool.ts`
- `src/tools/FileWriteTool/FileWriteTool.ts`

## 6. 后续开发建议（可直接复用）

1. 每次改功能前先跑一组固定 `rg` 命令，形成肌肉记忆
2. 先确认“入口文件 + 关键调用链 + 状态落点”再动手
3. 对不确定的符号，优先“多次小范围 grep”，不要一次性大改
4. 搜索结果太多时，先用 `-l` 聚类再逐个读文件

---

如果你只想记一句话：大仓库改功能的核心是“`rg` 快速定位 + 读文件确认 + 缩小范围后再改”，而不是直接编辑。

