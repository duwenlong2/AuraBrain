# Mastra 学习路线

这里的目标不是把 Mastra 的每个 API 都背下来，而是用几个很小的例子，判断每个能力什么时候有用。

## Mastra 的大块知识

可以先分成三层：

```text
核心层：Agent / Tool / Harness / Memory / Storage
流程层：Workflow / suspend-resume / retries / Observability
扩展层：RAG / MCP / Processors / Evals / Voice / 部署
```

## 以官方仓库为准的学习地图

官方源码在同级目录 `mastra/`。其中 `mastra/examples/` 是能力示例，`mastra/templates/` 是接近真实产品的完整项目。我们不直接把这些大项目当教材硬啃，而是先看它们展示了什么，再在当前仓库写更小的版本。

### 官方 examples 展示的能力

| 官方目录 | 主要学习内容 | 我们的学习顺序 |
| --- | --- | --- |
| `mastra/examples/agent` | Agent、Tool、Request Context Presets、按环境和权限动态改变 instructions、model、tools | 核心 Agent 之后 |
| `mastra/examples/durable-agents` | Redis、可恢复流、断线后按 `runId` 继续、不同 Durable Agent 执行方式 | 先学完基础 Workflow 和 Storage |
| `mastra/examples/evals-with-memory` | `runEvals`、Scorer、Dataset、Memory 线程、Observational Memory 评估 | Agent 和 Memory 稳定后 |
| `mastra/examples/inngest` | 使用 Inngest 执行可靠的后台 Agent 任务 | 需要后台任务时 |
| `mastra/examples/sandbox-deployer` | 把 Mastra 服务部署到临时 Sandbox，处理构建、URL、停止和销毁 | 部署阶段 |
| `mastra/examples/voice-agent` | LiveKit、语音输入输出、Agent/Workflow 两种语音处理方式、电话记忆 | 文字 Agent 稳定后 |

### 官方 templates 展示的真实应用

```text
template-agent-harness       Agent 工作台：Workspace、审批、Memory、定时任务
template-company-knowledge   Notion/Linear + pgvector + RAG + MCP + 定时索引
template-meeting-notes       会议转录 + Workflow + 结构化纪要 + MCP 导出
template-deep-search         多 Agent + 嵌套 Workflow + 自我评估循环 + 引用
template-docs-expert          文档问答 + Web Search + 引用 + 结构化输出
template-browser-agent       浏览器访问、检查和操作网页
template-chat-with-pdf       PDF 文档解析、切分、向量检索和问答
template-text-to-sql         自然语言转 SQL，再查询结构化数据
template-github-review-agent 读取代码、分析变更并生成 Review
template-google-sheets       通过工具读写表格
```

这些模板告诉我们：Mastra 不只是“聊天机器人框架”，还覆盖了上下文检索、外部工具、结构化输出、后台任务、前端接入和部署。但模板属于应用组合示例，不代表这些能力都要现在学习。

### 推荐学习阶段

```text
阶段 0：TypeScript 基础
  对象、数组、函数、async/await、解构、展开、类型和 Zod

阶段 1：Agent 核心
  Model / Agent / instructions / Tool / inputSchema / execute / Studio

阶段 2：Agent 工作台
  Memory / Storage / Workspace / Sandbox / Approval / Request Context
  对照官方 template-agent-harness 和 examples/agent

阶段 3：上下文能力
  Conversation Memory / Working Memory / Semantic Recall
  Embeddings / Vector Store / RAG / 引用和权限过滤
  对照 template-company-knowledge、template-chat-with-pdf

阶段 4：固定流程
  Workflow / then / parallel / branch / map / foreach / State
  suspend-resume / retries / Storage 持久化
  对照我们自己的 03-workflow

阶段 5：可靠运行
  Durable Agent / 可恢复流 / Redis / Inngest / 后台任务
  对照 examples/durable-agents 和 examples/inngest

阶段 6：质量与产品化
  Observability / Evals / Scorers / Dataset / API / 前端 UI / Auth / Deploy
  对照 examples/evals-with-memory 和 examples/sandbox-deployer

阶段 7：按需扩展
  MCP / Agent Network / Browser / Voice / Agent Builder
  只有真实项目需要时再学
```

对你要做的 AI Workspace，最相关的是：阶段 1 的 Agent + Tool、阶段 2 的 Memory/Storage/Workspace、阶段 3 的 RAG/权限/时间上下文，以及阶段 6 的 API 和 Observability。Workflow 只在“同步邮件和会议 -> 建索引 -> 生成简报”这类固定后台流程中使用，不是整个产品的必选外壳。

### 核心层：大概率会用到

| 模块 | 解决什么问题 | 当前例子 |
| --- | --- | --- |
| Agent | 理解用户意图并生成回答 | `01-basic-agent`、`02-mini-agent` |
| Tool | 让 Agent 调用代码、API 或数据库 | `01-basic-agent`、`02-mini-agent` |
| Harness | 把 Agent、工具、记忆、工作区和运行控制组合成可使用的工作台 | `01-basic-agent` |
| Memory | 让 Agent 记住对话上下文 | `02-mini-agent` |
| Storage | 保存对话、运行记录和其他数据 | `02-mini-agent`、`03-workflow` |

### Harness 是什么？

可以把 Harness 理解成 Agent 的“工作台”或“运行外壳”：

```text
Agent：负责理解问题和做决定
Tool：负责执行具体动作
Harness：把 Agent、Tool、Memory、Workspace、审批、Storage 等组织起来运行
```

所以 Harness 不是另一个必须单独调用的 API。它更像一个项目模板和运行环境，帮你把一个“只有 Agent 的代码”变成一个可以对话、调用工具、读写文件、保存记忆和接受控制的完整 Agent 应用。

`01-basic-agent` 是我们自己编写的学习项目，只是参考了 Mastra Harness 的组织方式。它里面有一些能力不是学习 Mastra 核心概念时必须马上掌握的，例如 Workspace、Signals 和审批策略。当前阶段先知道它们各自解决什么问题即可，等你真正需要 Agent 操作文件或执行危险动作时再深入。

### 我们的示例对照 Harness 覆盖了什么

我们自己编写的 `01-basic-agent` 参考了 Mastra Harness 的组织方式，已经展示了其中一批主要能力：

```text
Agent + Tool：理解问题并调用工具
Web Fetch：访问网页，获取外部信息
Workspace：读写受限制的本地文件
Sandbox：在指定目录执行命令
Ask User：需要时向用户提问或确认
Schedules：按 cron 定时再次运行 Agent
Signals：跟踪较长任务的状态
Memory：保存对话和观察性记忆
Storage：保存记忆、任务和定时任务
Observability：记录模型、工具和整体运行 trace
```

所以这份自建示例可以作为我们的“能力总览”。官方源码参考在 `mastra/` 目录；`02-mini-agent` 的作用是把这些能力拆掉一部分，只留下 Agent、Tool、Memory、Storage 和 Observability，方便先学核心数据流。

目前这个 Harness 里还可以拆出这些能力：

| 能力 | 作用 | 什么时候需要 |
| --- | --- | --- |
| Workspace / Filesystem | 给 Agent 一个受限制的文件目录，让它读写文件 | Agent 要整理资料、生成文件或修改项目时 |
| Sandbox | 让 Agent 在指定目录执行命令 | Agent 要运行脚本、测试或构建项目时 |
| Approval / Human-in-the-loop | 危险操作前请求用户确认 | 删除文件、发送邮件、控制真实设备时 |
| Signals / Task tracking | 汇报长任务的进行状态，并支持中止或继续 | Agent 需要执行较长任务时 |
| Schedules | 按时间自动触发 Agent 或工具 | 每日摘要、定时检查设备时 |
| 多步执行控制 | 限制 Agent 最多连续调用多少步，处理暂停工具的恢复 | 工具链较长或任务比较复杂时 |

这些能力不是每个 Agent 都要安装。它们回答的是：“Agent 除了聊天，还能不能在受控制的环境里持续做事？”

另外几个容易混淆的概念：

```text
Harness：组织 Agent 运行环境
Agent Network：多个 Agent 之间协作
Workflow：代码明确规定步骤和顺序
MCP：接入外部工具协议
```

它们可以组合使用，但不是同一个东西。当前最值得先理解的是 Workspace、审批和 Tool；Signals、Schedules、Agent Network 暂时只需要知道用途。

### 流程层：有固定业务流程时使用

| 模块 | 解决什么问题 | 当前例子 |
| --- | --- | --- |
| Workflow | 把多个固定步骤串成可观察的流程 | `03-workflow` |
| suspend/resume | 等待人工确认、支付结果或外部事件 | `03-workflow` |
| retries | 临时失败后自动重试 | `03-workflow` |
| Observability | 查看模型、工具和步骤到底做了什么 | `02-mini-agent`、`03-workflow` |

### 扩展层：先知道用途，遇到需求再深入

| 模块 | 什么时候需要 |
| --- | --- |
| RAG / Embeddings | 让 Agent 从自己的文档、知识库中检索回答 |
| MCP | 接入外部 MCP Server 提供的工具 |
| Processors | 在 Agent 输入或输出前统一过滤、改写或拦截 |
| Evals | 批量评估 Agent 回答质量，比较不同 prompt 或模型 |
| Voice | 语音输入、语音输出和实时语音 Agent |
| Auth / Deploy | 把 Agent 应用接入用户系统并部署上线 |

## Workflow 到底用不用得到？

不一定。可以用这个判断：

```text
用户一句话
  -> Agent 自己判断怎么回答、要不要调用工具
```

这种场景主要用 Agent + Tool，不需要 Workflow。

```text
固定经过 A -> B -> C
中间可能暂停、重试、分支，还要记录每一步
```

这种场景才适合 Workflow。

对 AuraBrain 来说：

```text
聊天问答、查状态、控制一个设备 -> Agent + Tool
执行“检查设备 -> 判断条件 -> 下发指令 -> 等待反馈 -> 重试” -> Workflow
```

所以 Workflow 是可选的流程工具，不是所有 Agent 都必须套一层 Workflow。

## 小例子学习顺序

已有例子先这样跑：

1. `01-basic-agent`：看 Agent、Tool、注册和 Studio。
2. `02-mini-agent`：看最小 Agent、Memory、Storage、Observability。
3. `03-workflow`：看顺序、并行、分支、`map`、`foreach`、State、暂停恢复和重试。

接下来不要直接做大项目，按下面的小实验逐个增加：

1. **Tool 小实验**：写一个 `device-status` 工具，返回设备当前状态。
2. **Agent + Tool**：让 Agent 根据自然语言调用这个工具。
3. **Harness 小实验**：观察 Workspace、审批、长任务信号和定时任务分别解决什么问题。
4. **Memory 小实验**：让 Agent 记住设备名称和用户偏好。
5. **RAG 小实验**：放两三条设备说明，让 Agent 回答“这个灯支持什么模式”。
6. **Workflow 小实验**：固定执行“读取状态 -> 判断 -> 控制设备”。
7. **暂停恢复小实验**：危险操作前暂停，等待用户确认。
8. **Observability 小实验**：比较没有工具、调用工具、调用模型时各自花了多少时间。

每个实验只新增一个概念。能解释清楚数据从哪里来、经过哪一步、最后去哪儿，就算学会了，不需要一次掌握所有 Mastra 类型。

## TypeScript 学习顺序

你现在不需要先学完整套 TypeScript。后面遇到代码时，按这个顺序补最实用的部分：

```text
1. const / let：定义变量
2. 对象和数组：{ name: '小明' }、['邮件', '会议']
3. 函数和箭头函数：function、(value) => value
4. async / await：等待异步任务完成
5. 解构：从 { inputData, state } 中取出字段
6. 展开运算符：复制对象或数组并追加内容
7. 类型和接口：说明数据应该长什么样
8. 泛型、类型推导：最后再接触，暂时不用硬背
```

Mastra 代码里看到这种写法时，可以先按普通 JavaScript 理解：

```ts
createStep({
  id: 'device-status',
  inputSchema: z.object({ deviceId: z.string() }),
  execute: async ({ inputData }) => {
    return { deviceId: inputData.deviceId, online: true };
  },
});
```

这里的大括号首先是一个“配置对象”，不是函数传入了很多个参数。复杂的类型只是帮助编辑器检查这份配置是否正确，我们会在真正需要时再拆开学习。

## 学习方式

当前阶段以“看懂和解释”为主，不急着独立写完整项目。后面每次只做一个很小的改动：

```text
先解释语法和数据来源
  -> 再看一个最小例子
  -> 最后运行或修改一处
```

这样可以同时确认两件事：Mastra 的概念没有学错，TypeScript 的语法也没有被跳过。

## 目前的学习边界

已经实际跑过：

```text
Agent / Tool / Memory / Storage / Observability
Workflow 控制流 / State / suspend-resume / retries / foreach
```

暂时不用急着学：

```text
复杂部署、Voice、企业级 Auth、复杂 Evals、底层 Execution Engine
```

下一次最适合写的例子是“设备状态 Tool + Agent”，因为它和 AuraBrain 的硬件方向直接相关，也比 Workflow 更能验证你平时到底用不用得上 Agent。
