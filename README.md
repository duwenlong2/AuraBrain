# AuraBrain

AuraBrain 是一个可独立运行、可通过接口调用、也可被二次开发的开源 AI Runtime。

它负责在后台运行 Agent、Tool 和 Workflow，并通过 HTTP 对外提供能力；CLI 用于启动、检查、调用和开发调试；管理界面用于配置 Runtime、查看状态和调试执行过程。

AuraBrain 基于 [Mastra](https://mastra.ai) 构建，但 Mastra 是内部实现基础，不是 AuraBrain 对外的产品边界。

```text
AuraBrain
├── Runtime       后台进程和执行能力
├── CLI            启动、检查、调用和调试
├── API            面向客户端和第三方的接口层
├── Console        配置、状态和调试界面
└── Extensions     Agent、Tool、Workflow 和插件扩展
```

其他开发者也可以使用自己的 Web、CLI、桌面或设备客户端调用同一个 Runtime。

## 使用方式

### 作为后台 Runtime

在另一台机器上从 Git 拉取源码后，先安装 Node.js 25 或兼容的较新版本，然后执行：

```powershell
git clone <repository-url> AuraBrain
cd AuraBrain
npm install
npm link
brain build
brain dev
```

默认监听 `127.0.0.1:49000`。生产模式使用：

```powershell
brain stop
brain build
brain start
```

`brain build` 会生成本地 `.mastra/output/`，该目录已被 Git 忽略，不需要上传。开发者修改源码后再次执行 `brain build`，再执行 `brain dev`。

最小生命周期接口：

```text
GET /health
```

接口文档由 Runtime 提供，开发模式启动后可从根地址进入 Mastra 生成的 API 文档和调试界面。AuraBrain 计划把对外能力逐步收敛到稳定的 `/v1/` 接口层；当前客户端应使用已明确的接口，避免依赖 Mastra 内部路由。

### 通过 CLI 使用

在 AuraBrain 根目录执行一次 `npm link`，注册本机 CLI 命令：

```powershell
cd D:\Codes\xxx\workspace\AuraBrain
npm link
```

之后进入 AuraBrain 目录即可直接使用 `brain`：

```powershell
cd D:\Codes\xxx\workspace\AuraBrain

# 启动本地 Runtime（后台运行，启动成功后立即返回终端）
brain dev

# 停止 Runtime
brain stop

# 查询 Runtime 状态
brain status

# 查看最近 50 行运行日志
brain logs

# 首次配置模型：自动打开 AuraBrain 配置页
brain init

# 修改模型或 Runtime 设置
brain settings

# 启动文字 Chat，用于验证默认模型是否能正常返回
brain chat
# Chat 中输入 /clear 清空当前上下文，输入 /exit 或 /quit 退出

# 查询健康接口
brain health

# 调用 HTTP 接口；无 JSON 参数时使用 GET
brain call /health

# 发送 JSON 请求体时使用 POST
brain call /test-api/run '{"tool":"outlook-test-connection","input":{}}'

# 生产模式：先构建，再启动
brain build
brain start
```

默认连接固定为 `http://127.0.0.1:49000`。`brain status` 会同时显示 Runtime 是否运行，以及模型是否完成初始化。
`brain dev` 使用最近一次构建产物启动，避免 Windows 下 Mastra 开发重建与 `keytar` 原生模块发生文件锁冲突；修改源码后重新执行 `brain build` 即可。

`aurabrain` 仍然作为完整命令保留；`brain` 是推荐的短命令。

### 敏感配置存储

AuraBrain 的敏感配置不应直接写入普通配置文件。Runtime 使用操作系统凭据存储保存这类值：Windows 下写入 Credential Manager，代码通过 `service + key` 读取对应的 value。配置文件只保存 Provider、Model 和凭据 key，不保存 API Key 明文。

当前 `src/main/lib/secret-store.ts` 已提供保存、读取和删除封装。首次打开 `http://127.0.0.1:49000/` 时，如果尚未配置模型，会进入 AuraBrain 初始化页面。API Key 由服务端写入 Windows Credential Manager，页面只提交一次，不负责持久化或回显真实值。

普通配置保存在当前 Windows 用户目录：`%APPDATA%\AuraBrain\config.json`（通常是 `C:\Users\<用户名>\AppData\Roaming\AuraBrain\config.json`）。其中只保存 Provider、Model、接口地址和凭据引用；真实 API Key、Graph OAuth Token、IMAP 密码等敏感值保存在 Credential Manager。Mastra 通过原生模型解析器接收调用时的内存配置，不读取或持久化明文 Key。旧项目内 `.aurabrain/config.json` 仅作为迁移兼容来源，新配置始终写入用户目录。

### 基于 Runtime 二次开发

二次开发只需要提交源码和配置文件，不提交 `node_modules/`、`.mastra/`、`.aurabrain/`、`.env` 或任何 API Key。推荐顺序：

1. 在 `src/main/index.ts` 注册 Agent、Tool、Workflow 和 API 路由。
2. 在 `src/main/tools/` 增加业务工具，在 `src/main/lib/` 增加 Outlook、IMAP、Graph 等适配器。
3. 在 `src/main/routes.ts` 增加管理接口或稳定的公共接口；客户端不要依赖 Mastra 的 `/settings/*` 页面。
4. 运行 `npx esbuild src/main/routes.ts --bundle --platform=node --format=esm --external:@mastra/core --external:keytar` 做快速检查。
5. 执行 `brain build`，再用 `brain dev` 启动验证。

更完整的目录说明、扩展边界和最小示例见 [Runtime 开发指南](docs/runtime-development.md)。

## 接口层

AuraBrain 对外接口分为三层：

```text
/health       进程和 Runtime 健康检查
/v1/*         规划中的稳定公共能力接口，供客户端和第三方调用
/admin/*      管理、配置、状态和调试接口，供 Console 使用
```

每个公共接口都需要描述请求、响应、错误、权限和副作用。接口文档是 Runtime 的正式交付物，而不是附带说明。具体业务适配器应通过统一接口接入，不把 Outlook 或 SightTwin 专属逻辑写进核心协议。

## 目录结构

```
AuraBrain/
├── docs/
│   └── blog/        ← 系列博客（编号和 examples 一一对应）
│       ├── 00-为什么选Mastra.md   ← 系列开篇（调研 + 规划）
│       ├── 01-basic-agent.md      ← 对应 examples/01
│       ├── 02-mini-agent.md       ← 对应 examples/02
│       └── 03-workflow.md         ← 对应 examples/03
├── src/              ← AuraBrain Runtime 主应用
│   └── main/         ← Runtime 入口、Tools、路由和本地适配器
├── docs/             ← Runtime、API 和扩展开发文档
│   ├── runtime-development.md
│   └── mastra-source-guide.md
├── examples/        ← 学习示例（从 helloworld 起步，最小 MVP）
│   ├── 01-basic-agent   ← 我们自己的 Agent 学习示例（参考 Harness 能力）
│   ├── 02-mini-agent    ← 极简 Agent（从 0 手写：工具/记忆/存储/观测）
│   ├── 03-workflow      ← 极简 Workflow（从 0 手写：顺序/并行/分支）
│   └── 04-07             ← Memory、Workspace、Agent Loop、Durable Agent
```

## 开发示例

学习示例仍然保留，用于理解底层 Agent、Tool 和 Workflow，不代表 AuraBrain 的产品入口：

```bash
cd examples/02-mini-agent
npm install
npm run dev
```

> 示例项目仍有自己的独立配置方式，可能使用 `.env.example` + `.env`。AuraBrain Runtime 本身不使用 `.env` 保存业务配置。Runtime 的 API Key 和 Token 写入 Windows Credential Manager，普通配置写入 `%APPDATA%\AuraBrain\config.json`。

## 技术学习资料

学习依据官方文档和本项目示例：

```text
Mastra 官方文档：https://mastra.ai/docs/
AuraBrain Runtime：src/main/
本项目 examples/ 和 docs/
```

官方文档负责说明底层能力，AuraBrain Runtime 负责提供可复用运行时，本项目的 `examples/` 负责把能力拆成小例子。

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
