# AuraBrain

Give your AuraCore a brain. / 给 AuraCore 装上大脑。

基于 [Mastra](https://mastra.ai) 的 TypeScript 云端 AI 框架，连接云端智能与物理世界。本项目也是一个**系统性学习 Mastra 的系列项目**，最终为 [AuraCore](https://github.com/duwenlong2/AuraCore) 构建云端 AI 大脑。

🧠 Think – 理解自然语言，拆解意图（Agent + Workflow）
📡 Connect – 通过 MQTT 与 ESP32 设备通信
⚡ Act – 把意图解析为硬件指令，驱动真实设备（小车 / 摄像头 / 机械臂）

## 目录结构

```
AuraBrain/
├── docs/
│   └── blog/        ← 系列博客（编号和 examples 一一对应）
│       ├── 00-为什么选Mastra.md   ← 系列开篇（调研 + 规划）
│       ├── 01-basic-agent.md      ← 对应 examples/01
│       ├── 02-mini-agent.md       ← 对应 examples/02
│       └── 03-workflow.md         ← 对应 examples/03
├── examples/        ← 学习示例（从 helloworld 起步，最小 MVP）
│   ├── 01-basic-agent   ← 我们自己的 Agent 学习示例（参考 Harness 能力）
│   ├── 02-mini-agent    ← 极简 Agent（从 0 手写：工具/记忆/存储/观测）
│   └── 03-workflow      ← 极简 Workflow（从 0 手写：顺序/并行/分支）
└── mastra/          ← Mastra 框架源码（独立拉取，见下）
```

## 快速开始

```bash
# 1. 拉取 Mastra 源码（本仓库不包含源码，学习/深挖用）
git clone https://github.com/mastra-ai/mastra.git mastra
# 更新源码：cd mastra && git pull

# 2. 跑示例（推荐从 02-mini-agent 开始，最简）
cd examples/02-mini-agent
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（默认用 DeepSeek）
npm install
npm run dev            # 打开 http://localhost:4111 访问 Mastra Studio
```

> **API Key 安全**：所有 key 都放在 `.env`（已被 `.gitignore` 忽略），不会提交到 GitHub。
> 默认模型 DeepSeek（`deepseek/deepseek-v4-flash`），也可换 OpenAI——改 `model` 字符串 + `.env` 填 `OPENAI_API_KEY`。

## 学习大纲

学习依据三部分：

```text
Mastra 官方文档：https://mastra.ai/docs/
Mastra 官方源码：mastra/
官方 examples/templates：mastra/examples/、mastra/templates/
```

官方目录负责告诉我们 Mastra 能做什么，我们的 `examples/` 负责把一个能力拆成小例子，博客负责用通俗语言解释数据从哪里来。

### 阶段 0：TypeScript 和项目基础

先掌握阅读 Mastra 代码需要的语法：

```text
对象、数组、函数、箭头函数、async/await、解构、展开运算符
const / let、类型、接口、Zod schema、配置对象
```

### 阶段 1：Agent 核心

对应官方文档的 Agents 和我们现有的 `01-basic-agent`、`02-mini-agent`：

```text
Model -> Agent -> instructions -> Tool -> inputSchema -> execute
Studio、模型选择、工具注册、工具参数和返回值
```

### 阶段 2：Agent 工作台

对照官方 `mastra/templates/template-agent-harness`：

```text
Memory / Storage / Workspace / Filesystem / Sandbox
Approval / Human-in-the-loop / Request Context
Schedules / Signals / 多步执行控制
```

### 阶段 3：上下文和知识

对照官方 `template-company-knowledge`、`template-chat-with-pdf` 和 RAG 文档：

```text
Conversation Memory / Working Memory / Semantic Recall
Embeddings / Vector Store / RAG / 引用 / 权限过滤 / 时间上下文
```

### 阶段 4：固定流程

对应官方 Workflows 文档和我们自己的 `03-workflow`：

```text
then / parallel / branch / map / foreach / loop
State / suspend-resume / retries / Storage 持久化
```

Workflow 不是所有 Agent 都需要。只有固定步骤、人工确认、重试或长流程时才使用。

### 阶段 5：可靠运行和后台任务

对照官方 `mastra/examples/durable-agents` 和 `mastra/examples/inngest`：

```text
Durable Agent / 可恢复流 / runId / Redis / Inngest / Background Tasks
```

### 阶段 6：质量和产品化

对应官方 Observability、Evals、Server、Deployment 文档：

```text
Trace / Observability / Scorers / Dataset / Evals
API / Mastra Client / React 或 Next.js UI / Auth / Deploy
```

### 阶段 7：按需扩展

根据真实项目需要再学习：

```text
MCP / Agent Network / Browser / Channels / Voice / Agent Builder
```

### AI Workspace 的优先路线

你未来想做邮件、会议和文档关联的 AI Workspace，优先学习：

```text
Agent + Tool
	-> Memory / Storage
	-> Request Context / 权限
	-> RAG / Embeddings / 时间上下文
	-> Observability / Evals
	-> 必要时用 Workflow 做同步和索引任务
```

每次只增加一个概念：先解释语法和数据来源，再写最小例子，最后运行验证。不直接照搬官方大模板。

## 学习方式

每篇博客对应一个 `examples/` 示例，都是最小 MVP：能跑、验证一个知识点、讲清楚怎么初始化怎么学。**博客编号和示例编号一一对应**：

```
blog/00-为什么选Mastra.md   → 系列开篇（为什么学、怎么学）
blog/01-basic-agent.md      → examples/01-basic-agent（我们自己的 Agent 学习示例）
blog/02-mini-agent.md       → examples/02-mini-agent（极简 Agent：工具/记忆/存储/观测）
blog/03-workflow.md         → examples/03-workflow（极简 Workflow：顺序/并行/分支）
```

- 从 [00 · 为什么选 Mastra](docs/blog/00-为什么选Mastra.md) 开始看
- 按博客编号逐步学习（01、02、03...），每篇对应一个示例
- 想"对着源码学"：看 [Mastra 源码导读](docs/mastra-source-guide.md)（博客知识点 ↔ 源码文件索引）

## License

MIT
