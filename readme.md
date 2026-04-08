# Claude Code 重写规划文档

> 创建日期：2026-04-07
> 状态：规划中
> 目标：完全重写一个简洁、可维护的 AI Coding CLI 工具
---

## 一、项目定位

### 1.1 产品目标
打造一个**精简、高效、可扩展**的 AI 编程助手 CLI 工具，核心功能：
- 与 AI 对话进行代码编写、重构、调试
- 支持文件操作（读/写/编辑）
- 支持执行命令和脚本
- 支持搜索代码和文档
- 可扩展的工具系统

### 1.2 与现有代码的关系
- **借鉴**：架构思路、工具定义、API 调用模式、系统提示词结构
- **舍弃**：反编译残留、Feature Flag 泛滥、过度抽象、冗余模块
- **目标规模**：从 2848 个文件精简到 ~200-300 个核心文件

---

## 二、全新架构设计

### 2.1 模块划分

```
src/
├── entrypoint.ts          # 唯一入口，极简启动
├── cli/                   # CLI 解析与路由
│   ├── parser.ts          # 命令行参数解析
│   └── commands/          # 子命令实现
├── core/                  # 核心引擎
│   ├── query.ts           # 主查询循环
│   ├── conversation.ts    # 会话管理
│   └── context.ts         # 上下文构建
├── api/                   # API 层
│   ├── client.ts          # Anthropic API 客户端
│   ├── streaming.ts       # 流式响应处理
│   └── providers.ts       # 多 Provider 支持
├── tools/                 # 工具系统
│   ├── base.ts            # 工具基类与接口
│   ├── registry.ts        # 工具注册表
│   └── implementations/   # 具体工具实现
├── ui/                    # 终端 UI (Ink)
│   ├── app.tsx            # 主应用组件
│   ├── components/        # UI 组件
│   └── hooks/             # 自定义 hooks
├── state/                 # 状态管理
│   └── store.ts           # Zustand store
├── services/              # 辅助服务
│   ├── mcp/               # MCP 协议支持
│   ├── config.ts          # 配置管理
│   └── auth.ts            # 认证
└── utils/                 # 工具函数
    ├── messages.ts        # 消息处理
    ├── permissions.ts     # 权限管理
    └── tokens.ts          # Token 计算
```

### 2.2 核心数据流

```
用户输入
    ↓
CLI Parser → 识别命令/进入 REPL
    ↓
REPL Loop:
    ┌─────────────────────────────────┐
    │  1. 构建上下文 (文件、git、记忆)  │
    │  2. 调用 API (流式)              │
    │  3. 处理响应                     │
    │     - 文本输出                   │
    │     - 工具调用 → 执行工具        │
    │  4. 更新会话状态                 │
    │  5. 循环或结束                   │
    └─────────────────────────────────┘
    ↓
输出结果给用户
```

### 2.3 技术栈选择

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Bun | 原有选择，性能好 |
| 语言 | TypeScript | 类型安全 |
| CLI 框架 | Commander.js | 原有选择，成熟稳定 |
| 终端 UI | Ink (React) | 原有选择，组件化开发 |
| 状态管理 | Zustand | 简洁，TypeScript 友好 |
| API SDK | @anthropic-ai/sdk | 官方 SDK |
| Schema 验证 | Zod | 类型安全的运行时验证 |
| 格式化 | Biome | 原有选择，快速 |

---

## 三、核心模块设计

### 3.1 工具系统 (Tool System)

**设计原则**：每个工具独立、可测试、可扩展

```typescript
// tools/base.ts
interface Tool<D, R> {
  name: string
  description: string
  inputSchema: z.ZodSchema<D>
  execute(ctx: ToolContext, input: D): Promise<R>
  render?(result: R): React.ReactNode  // 可选的 UI 渲染
}

// tools/registry.ts
class ToolRegistry {
  private tools: Map<string, Tool<unknown, unknown>>

  register(tool: Tool<unknown, unknown>): void
  get(name: string): Tool<unknown, unknown> | undefined
  getAll(): Tool<unknown, unknown>[]
  toAPISchema(): BetaToolUnion[]  // 转换为 API schema
}
```

**核心工具列表（优先实现）**：

| 工具 | 优先级 | 功能 |
|------|--------|------|
| Bash | P0 | 执行 shell 命令 |
| Read | P0 | 读取文件 |
| Write | P0 | 写入文件 |
| Edit | P0 | 编辑文件（字符串替换） |
| Glob | P0 | 文件模式匹配 |
| Grep | P0 | 内容搜索 |
| WebFetch | P1 | 获取网页内容 |
| WebSearch | P1 | 网页搜索 |
| AskUser | P1 | 向用户提问 |
| Agent | P2 | 子代理（复杂场景） |

### 3.2 查询引擎 (Query Engine)

```typescript
// core/query.ts
interface QueryOptions {
  messages: Message[]
  tools: ToolRegistry
  systemPrompt: string
  model: string
  onStream?: (event: StreamEvent) => void
}

async function query(options: QueryOptions): Promise<QueryResult> {
  // 1. 构建请求参数
  const params = buildRequestParams(options)

  // 2. 调用 API (流式)
  const stream = await apiClient.messages.stream(params)

  // 3. 处理流式响应
  for await (const event of stream) {
    yield processEvent(event)
  }

  // 4. 如果有工具调用，执行工具并递归
  if (hasToolCalls(result)) {
    const toolResults = await executeTools(result.toolCalls)
    return query({
      ...options,
      messages: [...options.messages, result.message, ...toolResults]
    })
  }
}
```

### 3.3 状态管理 (State Management)

**单一 Zustand Store**，消除现有三种模式并存的问题：

```typescript
// state/store.ts
interface AppState {
  // 会话状态
  sessionId: string
  messages: Message[]
  cwd: string

  // 工具状态
  tools: ToolRegistry
  toolResults: Map<string, ToolResult>

  // 权限状态
  permissionMode: 'ask' | 'auto' | 'plan'

  // UI 状态
  isStreaming: boolean
  currentTool: string | null
  error: string | null

  // Actions
  addMessage: (msg: Message) => void
  setPermissionMode: (mode: PermissionMode) => void
  startStreaming: () => void
  stopStreaming: () => void
}

const useStore = create<AppState>((set, get) => ({
  // ... implementation
}))
```

### 3.4 API 客户端 (API Client)

```typescript
// api/client.ts
class AnthropicClient {
  private client: Anthropic

  constructor(options: ClientOptions) {
    this.client = new Anthropic(options)
  }

  async *stream(params: MessageParams): AsyncGenerator<StreamEvent> {
    const stream = this.client.messages.stream(params)

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_delta':
          yield { type: 'text', text: event.delta.text }
          break
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            yield { type: 'tool_start', tool: event.content_block }
          }
          break
        case 'message_stop':
          yield { type: 'done' }
          break
      }
    }
  }
}
```

---

## 四、重写实施计划

### 阶段 1：骨架搭建（0.2day）✅ 已完成

**目标**：建立可运行的最小框架

- [x] 项目初始化（package.json, tsconfig.json）
- [x] 入口文件 `entrypoint.ts`
- [x] CLI 解析器（支持 --version, --help）
- [x] 基础 API 客户端
- [x] 工具注册表
- [x] 6 个 P0 工具实现（Bash, Read, Write, Edit, Glob, Grep）
- [x] 状态管理（Zustand）
- [x] UI 骨架（Ink）

**验收标准**：
```bash
bun run src/entrypoint.ts --version
# 输出: 0.1.0
bun run src/entrypoint.ts --help
# 显示帮助信息
```

### 阶段 2：核心循环（0.2day）✅ 已完成

**目标**：实现 REPL 基本对话能力

- [x] REPL 入口（Ink UI）
- [x] 流式 API 调用（实时 thinking + text）
- [x] 消息管理（用户输入、AI 输出、工具结果）
- [x] 工具注册与执行框架（含权限确认）
- [x] 6 个核心工具实现（Bash, Read, Write, Edit, Glob, Grep）

**验收标准**：
```bash
bun run dev
> 帮我创建一个 hello.txt 文件
# 能正确调用 Write 工具创建文件
```

**本次更新**（2026-04-07）：
- 升级 API 客户端为真正的流式调用（streaming API）
- 实时显示 AI 思考过程（thinking）和文本输出
- 添加工具执行权限确认（--ask 模式）
- 完善工具执行器错误处理
- **添加测试用例** `phase2.test.ts`（18 个测试通过）

### 阶段 3：工具完善（0.2day）✅ 已完成

**目标**：实现常用工具

- [x] Glob 工具
- [x] Grep 工具
- [x] WebFetch 工具
- [x] WebSearch 工具
- [x] AskUser 工具
- [x] 工具权限系统（基础实现，支持 ask/auto 模式）

**验收标准**：
```bash
bun run dev
  # 测试 Glob                                                                                                                                                                                                                           
  > 找出所有 .ts 文件                                                                                                                                                                                                                   
                                                                                                                                                                                                                                        
  # 测试 Grep                                                                                                                                                                                                                           
  > 搜索 "ToolRegistry" 在 src 目录                                                                                                                                                                                                     
                                                                                                                                                                                                                                        
  # 测试 WebFetch                                                                                                                                                                                                                       
  > 获取 https://example.com 的内容                                                                                                                                                                                                     
                                                                                                                                                                                                                                        
  # 测试 WebSearch                                                                                                                                                                                                                      
  > 搜索 TypeScript 相关信息                                                                                                                                                                                                            
                                                                                                                                                                                                                                        
  # 测试 AskUser                                                                                                                                                                                                                        
  > 问我一个问题    
```

**本次更新**（2026-04-07）：
- 实现 WebFetch 工具（获取网页内容，HTML 转 Markdown）
- 实现 WebSearch 工具（使用 DuckDuckGo 搜索）
- 实现 AskUser 工具（向用户提问获取输入）
- 修复 Glob 工具的 glob 模式匹配 bug
- 修复工具执行时机 bug（等待 input 完整后再执行）
- 扩展 Tool 类型定义支持嵌套 schema



### 阶段 4：体验优化（0.2day）✅ 已完成

**目标**：提升用户体验

- [x] 权限确认 UI - 使用 Ink 组件实现友好的权限确认界面
- [x] 进度显示 - Spinner 动画、工具执行状态、Token 统计
- [x] 错误处理与提示 - 分类错误（API/权限/网络/工具）+ 恢复建议
- [x] 配置文件支持（CLAUDE.md）- 多级查找（用户级/项目级/父目录）

**验收标准**：
```bash
bun run dev

# 测试权限确认（使用 --ask 模式）
bun run dev -- --ask
> 创建一个 test.txt 文件
# 应显示权限确认 UI，输入 y 确认或 n 拒绝

# 测试进度显示
> 帮我分析 package.json 文件
# 应显示 Spinner 动画和工具执行状态

# 测试错误处理
> 执行一个不存在的命令
# 应显示友好的错误提示和恢复建议

# 测试配置文件
# 创建 ~/.claude/CLAUDE.md 或项目 CLAUDE.md
# AI 应自动读取并遵循其中的指令
```

**本次更新**（2026-04-07）：
- 实现 `PermissionPrompt` 组件，支持 Ink 风格的权限确认 UI
- 实现 `ProgressIndicator` 组件，显示 Spinner 和工具执行状态
- 实现 `ErrorDisplay` 组件，分类错误并给出恢复建议
- 实现 `TokenUsage` 组件，实时显示 Token 使用量和预估成本
- 扩展 store 支持 pendingTool、toolProgress、token 统计状态
- 修改 executor.ts 使用新的权限确认方式
- 扩展 context.ts 支持多级 CLAUDE.md 查找和 memory 文件加载
- 扩展 prompt.ts 在系统提示词中包含 memory 内容
- 更新 API client 返回 token 使用统计
- **添加测试用例** `phase4.test.ts`

### 阶段 5：扩展功能（0.2 day）

**目标**：高级特性

- [ ] 多 Provider 支持（Bedrock, Vertex）
- [ ] Agent 模式（子任务委托）
- [ ] Plan 模式（规划后执行）
- [ ] 上下文压缩（长对话处理）

### 阶段 6：测试与文档（0.2 day）

**目标**：质量保障

- [ ] 单元测试覆盖（目标 80%）
- [ ] 集成测试
- [ ] CLI 文档
- [ ] 工具开发指南

---

## 四.五、测试方式

### 测试框架

使用 Bun 内置测试框架 (`bun:test`)，支持：
- `describe` / `test` 组织测试
- `expect` 断言
- `beforeEach` / `afterEach` 生命周期
- `mock.module()` 模块 mock

### 测试文件结构

```
rewrite/
├── phase2.test.ts        # 阶段2测试（18个测试）
├── phase3.test.ts        # 阶段3测试（20个测试）
└── src/__tests__/
    └── phase4.test.ts    # 阶段4测试（19个测试）
```

### 运行测试

```bash
# 运行所有测试
cd rewrite && bun test

# 运行单个测试文件
bun test phase2.test.ts
bun test src/__tests__/phase4.test.ts

# 带覆盖率报告
bun test --coverage
```

### 当前测试覆盖

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| Store 状态管理 | 8 | 消息、流式状态、权限、进度、Token |
| 工具注册表 | 4 | 注册、获取、API schema 生成 |
| Bash 工具 | 2 | 命令执行、错误处理 |
| Read 工具 | 2 | 文件读取、错误处理 |
| Write 工具 | 1 | 文件创建 |
| Edit 工具 | 2 | 内容编辑、错误处理 |
| Glob 工具 | 3 | 模式匹配、路径参数、无匹配 |
| Grep 工具 | 3 | 内容搜索、glob 过滤、大小写 |
| WebFetch 工具 | 2 | URL 验证、协议检查 |
| WebSearch 工具 | 2 | 查询验证、域名限制 |
| AskUser 工具 | 3 | 问题验证、数量限制 |
| 错误解析 | 5 | API/权限/网络/工具/未知错误 |
| Token 格式化 | 3 | 数字格式化（普通/K/M） |
| **总计** | **57** | - |

### 测试用例示例

```typescript
// 测试权限确认
test('should set pending tool', () => {
  const pendingTool: PendingTool = {
    id: 'test-tool-1',
    name: 'Bash',
    input: { command: 'echo test' },
    resolve: () => {},
  }

  store.getState().setPendingTool(pendingTool)
  expect(store.getState().pendingTool).toEqual(pendingTool)
})

// 测试工具执行进度
test('should set tool progress', () => {
  const progress: ToolProgress = {
    name: 'Bash',
    status: 'running',
    startTime: Date.now(),
  }

  store.getState().setToolProgress(progress)
  expect(store.getState().toolProgress).toEqual(progress)
})

// 测试错误解析
test('should identify API errors', () => {
  const result = parseError('API key invalid')
  expect(result.type).toBe('api')
  expect(result.suggestion).toContain('API key')
})
```

### Mock Store 创建

```typescript
// 创建测试用的 mock store
function createMockStore(overrides: Partial<AppState> = {}) {
  return create<StoreState>((set, get) => ({
    // 默认状态
    messages: [],
    cwd: process.cwd(),
    permissionMode: 'auto',
    // ... 其他状态

    // Actions
    addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    // ... 其他 actions

    ...overrides,
  }))
}
```

### 端到端测试（手动）

```bash
# 启动开发模式
cd rewrite && bun run dev

# 测试基本对话
> 你好，请介绍一下自己

# 测试工具调用
> 读取 package.json 文件
> 搜索 .ts 文件
> 执行 echo "hello world"

# 测试权限确认
bun run dev -- --ask
> 创建一个 test.txt 文件
# 输入 y 确认或 n 拒绝
```

---

## 五、从现有代码借鉴的关键内容

### 5.1 系统提示词结构

```typescript
// 借鉴 src/utils/systemPromptType.ts
// 系统提示词的构建模式：前缀 + 主提示 + 后缀
```

### 5.2 工具 Schema 定义

```typescript
// 借鉴 src/tools/*/ 目录下的 inputSchema 定义
// 使用 Zod 定义，转换为 JSON Schema
```

### 5.3 消息类型

```typescript
// 借鉴 src/types/message.ts
// 用户消息、助手消息、工具结果消息的类型定义
```

### 5.4 权限模式

```typescript
// 借鉴 src/types/permissions.ts
// ask / auto / plan 三种权限模式
```

### 5.5 上下文构建

```typescript
// 借鉴 src/context.ts
// 收集 git 状态、文件信息、CLAUDE.md 等
```

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 功能遗漏 | 中 | 高 | 对照原工具功能清单逐项验证 |
| 性能差距 | 低 | 中 | 保持相同技术栈，参考原有优化 |
| API 兼容性 | 低 | 高 | 使用相同版本的 SDK |
| 用户体验下降 | 中 | 中 | 参考 Ink 组件设计，保持相似交互 |

---

## 七、决策记录

### 7.1 已确认决策

| # | 问题 | 决策 | 备注 |
|---|------|------|------|
| 1 | 重写策略 | **完全重写** | 借鉴思路和代码，从头实现 |
| 2 | 项目目标 | 精简、可维护的 AI Coding CLI | 从 2848 文件精简到 200-300 |
| 3 | 代码位置 | **原仓库 `rewrite/` 目录** | 方便对照原代码 |
| 4 | VSCode 扩展集成 | **不需要** | CLI 工具在终端运行即可 |
| 5 | 多语言支持 | **不需要** | 原代码无翻译系统，仅英文 |
| 6 | 目标用户 | **程序员** | 和 Claude Code 一样 |
| 7 | npm 包名 | **暂不急** | 先完成功能，后续再发布 |
| 8 | P0 工具 | **Bash/Read/Write/Edit/Glob/Grep** | 第一阶段实现，后续补充 |
| 9 | 高级功能 | **第一版不需要** | MCP/多Provider/Agent/Plan 后续扩展 |
| 10 | 权限模式默认值 | **auto** | 用户可配置修改 |
| 11 | Buddy 功能 | **不要** | 移除 |
| 12 | CLI 命令名 | **zhgu-code** | 二进制名称 |
| 13 | 配置文件位置 | **~/.claude-code/** | 与原工具共享配置 |
| 14 | 日志级别 | **详细（默认）** | 提供 `--quiet` 开关控制 |

### 7.2 模型选择

| 配置项 | 默认值 | 备注 |
|--------|--------|------|
| 默认模型 | **Sonnet** | claude-sonnet-4-6 |
| Opus 支持 | TODO | 后续版本实现 |

**Sonnet vs Opus 区别**：
- **Sonnet**：速度快、成本低、适合日常开发，平衡性能与效率
- **Opus**：最强能力、速度较慢、成本高、适合复杂任务和深度推理

### 7.3 讨论历史

#### 2026-04-03 初始规划
- 确认完全重写策略
- 确认精简目标

#### 2026-04-07 范围确认
- 确认代码位置：`rewrite/` 目录
- 确认功能范围：P0 工具优先，高级功能后续
- 确认默认配置：Sonnet + auto 权限
- 确认移除：VSCode 集成、多语言、Buddy

---

## 八、下一步行动

1. **创建 `rewrite/` 目录结构** - 立即开始
2. **初始化项目配置** - package.json, tsconfig.json, biome.json
3. **实现阶段 1 骨架** - 入口文件、CLI 解析、基础 API 客户端

---

## 九、Step 1.1：思考过程与最终回答的区分显示

### 9.1 设计目标
将 AI 的思考过程（thinking）和最终回答（text）用不同颜色区分显示，提升用户体验。

### 9.2 Claude Code 原工程实现分析

**数据结构**：
- 消息内容块类型：`type: 'thinking'` | `type: 'redacted_thinking'` | `type: 'text'` | `type: 'tool_use'`
- 思考内容存储在 `thinking` 字段中

**渲染组件**：
- `src/components/messages/AssistantThinkingMessage.tsx` - 负责渲染思考块
- 使用 `dimColor={true} italic={true}` 样式显示思考内容
- 非详细模式下只显示 `∴ Thinking` 提示 + 按键提示展开
- 详细模式下显示完整思考内容

**消息区分逻辑**：
- 在 `MessageRow.tsx` 中，遍历消息内容时检查 `content?.type === 'thinking'`
- 思考块会被特殊处理，不计入普通内容

### 9.3 实现方案

**状态扩展**：
```typescript
// state/store.ts
interface AppState {
  // ... existing fields
  thinking: string        // 当前思考过程
}
```

**API 流处理扩展**：
```typescript
// core/query.ts - 需要处理 thinking_block_delta 事件
for await (const event of streamIterator) {
  switch (event.type) {
    case 'text':
      // 最终回答
      break
    case 'thinking_delta':
      // 思考过程，更新 state.thinking
      state.setThinking(event.thinking)
      break
  }
}
```

**UI 渲染**：
```tsx
// ui/App.tsx
const thinking = useStore(store, (s) => s.thinking)
const isStreaming = useStore(store, (s) => s.isStreaming)

// 思考中显示
{isStreaming && thinking && (
  <Box>
    <Text dimColor italic>∴ Thinking: {thinking.slice(0, 100)}...</Text>
  </Box>
)}
```

**颜色方案**：
- 思考过程：`dimColor={true} italic={true}` - 灰色 + 斜体
- 最终回答：普通 `Text` - 白色/默认色

### 9.4 实施步骤（已确认）

1. ~~扩展 `AppState` 添加 `thinking` 字段~~
2. ~~修改 `query.ts` 处理 `thinking_block_delta` 事件~~
3. ~~修改 `App.tsx` 添加思考过程显示区域~~
4. ~~调整消息渲染逻辑，区分思考和文本块~~

### 9.5 待讨论：思考内容持久化

**当前 rewrite 状态**：
- `state/store.ts` 中已有 `thinking: string | null` 字段（流式思考用）
- `messages: Message[]` 数组存储消息历史
- 消息内容目前只是简单存储，未区分 thinking/text/tool_use 类型

**持久化需要考虑的问题**：

1. **Token 消耗**：思考内容会占用 context token，是否需要限制长度？
2. **存储结构**：需要区分 `type: 'thinking'` 和 `type: 'text'` 两种内容块
3. **显示逻辑**：渲染时需要识别类型并应用不同样式
4. **API 兼容性**：消息历史回传时需要保持正确的 content 结构

**是否需要持久化？** 请确认。

> **当前确认**：先不实现持久化，只在流式过程中显示思考内容。流式结束后清空 thinking 状态。

---

### 9.6 Step 1.1 实施计划

**确认实现**：
1. 详细模式：直接显示完整思考内容（灰色 + 斜体）
2. 无需展开/收起
3. 不持久化到消息历史（流式结束后清空）

**代码改动**：
1. `rewrite/src/core/query.ts` - 添加 `thinking_delta` 事件处理
2. `rewrite/src/ui/App.tsx` - 添加思考内容显示区域

---

*文档持续更新中...*
