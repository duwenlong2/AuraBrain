# 05 · Mastra Workspace：从本地工作区到联网检索

> 本文以当前仓库的 `examples/05-workspace` 为准，记录 Mastra Workspace、Approval、Sandbox，以及 Parallel Search MCP 的接入和验证过程。
>
> 示例代码：[workspace-agent.ts](../../examples/05-workspace/src/mastra/agents/workspace-agent.ts)；检索工具连接：[parallel-search.ts](../../examples/05-workspace/src/mastra/tools/mcp/parallel-search.ts)

## 关于 AuraBrain 开源项目

这是我的开源项目 [AuraBrain](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

本文对应的代码：`examples/05-workspace/`（Workspace + Parallel MCP）

```
examples/05-workspace/
├── src/mastra/
│   ├── index.ts                  ← 总闸（注册 Agent/Workspace/MCP/存储/观测）
│   ├── agents/workspace-agent.ts ← Agent（Workspace + Parallel MCP）
│   ├── tools/mcp/
│   │   └── parallel-search.ts    ← Parallel Search MCP 连接
│   └── models/azure.ts           ← Azure 模型配置
└── README.md                     ← 完整学习笔记
```

这篇博客讲的每个知识点（Workspace 配置、绝对路径、Approval、Parallel MCP、Trace 验证），在 examples 里都有可运行的代码 + README 实验记录。想深入看代码、复现实验、查真实 trace 数据，去开源项目对应目录看。

仓库怎么读：

```
AuraBrain/
├── docs/blog/     ← 系列博客（编号和 examples 一一对应）
├── examples/      ← 可运行的示例代码（最小 MVP）
└── mastra/        ← Mastra 框架源码（独立拉取，不提交）
```

推荐阅读方式：

1. 看博客建立概念
2. 打开对应 `examples/` 自己跑一遍（`npm run dev`）
3. 想深入：看 `examples` 对应目录的代码 + README 学习笔记
4. 想看框架源码：`git clone https://github.com/mastra-ai/mastra.git mastra`

## 一、先说结论

一个只有模型的 Agent 只能理解请求并生成文本。要让它成为可以工作的助手，需要把执行能力挂载到 Agent 上：

```
Agent：理解意图并决定下一步
Workspace：读写文件、执行命令
Approval：在危险动作前暂停等待确认
Parallel MCP：搜索和读取公开网页
Storage：保存对话和运行数据
```

Mastra Workspace 的本质是一个"能力容器"，把文件操作、命令执行、审批策略打包成一组工具，挂载到 Agent 上。Agent 不再只能聊天——它能创建文件、修改内容、删除文件，但每一步都在你设定的规则内运行。

联网检索没有继续手写工具，而是接入 Parallel AI 的公开 Search MCP endpoint，不需要 API Key，通过 `@mastra/mcp` 的 `MCPClient` 发现工具并调用。

本示例的重点是通过 Trace 和实际请求看清楚这些能力如何连接：

```
用户请求
  -> Agent 决策
  -> Workspace 或 MCP 工具调用
  -> 工具返回结果
  -> Agent 继续推理
  -> 最终回答
```

## 二、Workspace 是什么

Workspace 是一个挂载到 Agent 上的能力容器，组合了：

```text
LocalFilesystem：限制文件操作根目录
LocalSandbox：设置命令执行的工作目录
tools policy：配置先读后写、删除审批等规则
```

当前项目的核心配置如下：

```ts
const workspace = new Workspace({
  id: 'learning-workspace',
  name: 'Learning Workspace',
  filesystem: new LocalFilesystem({
    basePath: workspacePath,
  }),
  sandbox: new LocalSandbox({
    workingDirectory: workspacePath,
  }),
  tools: {
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      requireReadBeforeWrite: true,
    },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      requireApproval: true,
    },
  },
});
```

这段配置表达了三个边界：

1. Agent 的文件操作只能从 `workspace/` 开始。
2. 写入和编辑目标文件前，必须先读取原内容。
3. 删除文件会暂停，等待用户在运行界面中批准。

> ⚠️ 关键认知：
>
> Prompt 中的"请先读取再修改"只是模型行为提示；`requireReadBeforeWrite` 才是工具层的运行时约束。
>
> Approval 也不是模型回复"我确认了"就算通过，而是实际的暂停和恢复机制。

## 三、实验 1：相对路径的坑

项目没有直接把 Workspace 配置成：

```ts
basePath: 'workspace'
```

而是使用 `INIT_CWD` 计算项目根目录：

```ts
const projectRoot = process.env.INIT_CWD ?? process.cwd();
const workspacePath = path.join(projectRoot, 'workspace');
```

原因是 `mastra dev` 的服务进程可能以 `src/mastra/public` 作为当前工作目录。相对路径会让文件落到：

```text
src/mastra/public/workspace
```

而不是示例项目根目录下的：

```text
examples/05-workspace/workspace/
```

这类问题很容易被误判为"Agent 没有写文件"。实际上，工具执行成功了，只是相对路径解析到了另一个当前目录。对 Workspace 这类文件能力来说，路径解析是行为的一部分，不能只看 Agent 的最终回复。

> 💡 真实踩坑：当时写配置时用了相对路径 `basePath: 'workspace'`，Agent 声称文件已创建，但去项目根目录找却找不到。差点以为 Workspace 坏了，后来才发现文件落到了 `src/mastra/public/workspace` 里。

## 四、从 Trace 看 Workspace 的真实执行

理解 Workspace 最好的方式不是只看配置，而是在 Studio 里实际做一次文件操作，再打开对应的 Trace。用户看到的是一句自然语言，Trace 展示的是 Agent 如何把这句话拆成模型调用和工具调用。

一次典型的文件操作大致是：

```text
用户请求
  -> Agent/模型分析意图
  -> 选择 Workspace 工具
  -> 工具执行文件操作
  -> 返回工具结果
  -> Agent/模型根据结果继续回答
```

Trace 中通常可以把它分成三类信息：

1. **模型节点**：记录模型收到的上下文、工具定义和本轮生成的 tool call。
2. **工具节点**：记录实际调用了哪个 Workspace 工具，以及输入参数，例如文件路径、内容或删除目标。
3. **工具结果和后续模型节点**：记录文件操作是否成功，之后模型如何把结果组织成最终回答。

### 4.1 添加文件：从意图到 `write_file`

在 Studio 中发送：

```text
请在 Workspace 中创建一个 experiment.md，写入：今天完成了 Workspace 文件创建实验。
```

重点观察 Trace 中是否出现类似这样的链路：

```text
Agent/Model
  -> mastra_workspace_write_file
       path: experiment.md
       content: 今天完成了 Workspace 文件创建实验。
  -> tool result: 文件写入成功
  -> Agent/Model: 告知用户文件已创建
```

这里有几个重要结论：

- Agent 没有直接调用 Node.js 的 `fs.writeFile`，而是调用 Workspace 暴露的文件工具。
- 工具参数中的路径是相对于 Workspace 根目录的路径，不应该让模型直接操作项目绝对路径。
- 真正的文件变化发生在工具节点，而不是模型节点。模型只是决定调用什么工具以及如何解释结果。
- 如果要求写入已有文件，`requireReadBeforeWrite` 会要求先读取目标文件；如果是创建新文件，通常可以直接进入写入流程，因为目标尚不存在。

因此，最终回复中的"文件已经创建"并不是证据。真正的证据是 Trace 中有成功的 `mastra_workspace_write_file` 工具结果，并且在 `workspace/` 下能重新读取到这个文件。

### 4.2 删除文件：工具调用之外还有 Approval

再发送：

```text
请删除 Workspace 中的 approval-demo.txt。
```

删除操作的 Trace 和创建文件不同，它会多出一个暂停和恢复的阶段：

```text
Agent/Model
  -> mastra_workspace_delete
       path: approval-demo.txt
  -> suspended: 需要用户批准
  -> 用户批准
  -> mastra_workspace_delete 恢复执行
  -> tool result: 文件删除成功
  -> Agent/Model: 告知用户删除结果
```

如果用户没有批准，Trace 应该停在 suspended 状态，文件也不应该被删除。只有批准信息进入恢复流程后，删除工具才真正执行。这里的 Approval 不是 instructions 里的提醒，也不是模型自己生成一句"我确认删除"，而是 Workspace 工具层的运行时控制。

删除之后可以再发送：

```text
请列出 Workspace 中的文件，确认 approval-demo.txt 是否还存在。
```

这会产生新的 `list_files` 工具节点，用实际目录状态验证删除结果。把删除前后的 Trace 放在一起看，可以清楚区分：

```text
delete tool call       -> 请求删除
suspended              -> 等待用户授权
resumed delete result  -> 删除真正完成
list_files             -> 从文件系统再次确认
```

### 4.3 为什么 Trace 比最终回答更可靠

Agent 可能会因为模型判断错误而声称"已经完成"，但 Trace 能帮助我们定位问题发生在哪一层：

| 现象 | 应该检查的 Trace | 可能原因 |
| --- | --- | --- |
| 没有任何工具节点 | 模型节点 | Agent 没有选择 Workspace 工具，或请求不够明确 |
| 有工具调用但执行失败 | 工具输入和工具结果 | 路径不存在、参数格式错误或权限限制 |
| 删除停在 suspended | Approval 状态 | 这是正常的等待授权，不是删除失败 |
| 显示成功但文件找不到 | 工具结果和实际目录 | 可能是当前工作目录或 Workspace 根目录配置错误 |
| 模型说已完成但没有工具调用 | 模型节点 | 模型产生了未经验证的自然语言回复 |

所以学习 Workspace 时，建议始终同时看三件事：最终回答、Trace 中的工具节点、磁盘上的实际文件状态。三者一致，才能确认这次操作真的完成。

## 五、把 MCP 连接做成可复用工具

这次没有继续维护手写的网页抓取和搜索工具，而是使用 Parallel AI 提供的公开 Search MCP endpoint：

```text
https://search.parallel.ai/mcp
```

它不需要在本项目配置 API Key。MCP 连接没有直接写进 Agent，而是放在 `src/mastra/tools/mcp/parallel-search.ts` 中：

```ts
import { MCPClient } from '@mastra/mcp';

const parallelMcp = new MCPClient({
  servers: {
    'parallel-free': {
      url: new URL('https://search.parallel.ai/mcp'),
    },
  },
  timeout: 30_000,
});

export function getParallelSearchTools() {
  return parallelMcp.listTools();
}
```

Agent 只负责组合 Workspace 和检索工具：

```ts
const workspaceAgent = new Agent({
  id: 'workspace-agent',
  model: azureModel,
  workspace,
  tools: await getParallelSearchTools(),
});
```

这样的目录和职责划分更清晰：

```text
src/mastra/tools/mcp/parallel-search.ts
  -> MCP endpoint、timeout、工具发现

src/mastra/agents/workspace-agent.ts
  -> Agent instructions、Workspace、Memory、能力组合
```

以后其他 Agent 或 Workflow 需要联网检索时，可以直接复用 `getParallelSearchTools()`，不必复制 MCP endpoint，也不必把外部服务的连接细节混进 Agent 定义。

## 六、实验 2：Parallel MCP 的搜索和抓取

Parallel MCP 提供了两个免费工具：

| 工具名 | 用途 | 特点 |
| --- | --- | --- |
| `parallel-free_web_search` | 搜索网页 | 返回搜索结果摘要和链接 |
| `parallel-free_web_fetch` | 抓取指定 URL | 需要已知确切网址 |

### 6.1 搜索天气：真实验证

在 Studio 中发送：

```text
请搜索"Beijing weather today"，告诉我北京今天的天气。
```

Trace 中会看到：

```text
Agent/Model
  -> parallel-free_web_search
       query: "Beijing weather today"
  -> tool result: 多个天气网站结果
  -> Agent/Model: 整理并回答
```

实际验证返回了 AccuWeather、Weather Atlas、Weather.com 和 Meteoblue 的结果，包含温度、天气状况和预报信息。

> 💡 与 01-basic-agent 的区别：
>
> 01-basic-agent 的 `weather_query` 工具是硬编码假数据，返回 `0°C / 未知`。
> 而 Parallel MCP 是真实的搜索引擎，返回实时天气数据。
>
> 这也验证了之前博客中的结论：**工具的质量 = 回答的质量**。给 Agent 一个假工具，它就会给你假答案。

### 6.2 搜索 vs 抓取的分工

```text
web_search：不知道具体 URL，让 Agent 去搜索
web_fetch：已经知道 URL，直接抓取内容

类比：
web_search = 让搜索引擎帮你找
web_fetch = 直接打开已知网址
```

01-basic-agent 能查天气，是因为模型"知道" wttr.in 和 Open-Meteo 等天气 API 的固定 URL，所以能用 `web_fetch` 直接抓取。但这种方式依赖模型的记忆，不可靠。Parallel MCP 的 `web_search` 更通用——你只需要告诉它"找什么"，不需要知道具体网址。

## 七、总结

```
Workspace 的核心认知：
├── Workspace = 能力容器（文件 + 命令 + 审批）
├── 绝对路径是必须的（相对路径会落到奇怪的位置）
├── requireReadBeforeWrite = 工具层约束，不是提示词
├── Approval = 运行时暂停，不是模型确认
├── Parallel MCP = 免费搜索 + 抓取，无需 API Key
└── Trace 是唯一的证据（最终回答不可靠）
```

一句话：Mastra Workspace 让 Agent 有了"手"，但你要告诉它"能摸哪里、怎么摸、哪些不能摸"。

## 技术边界

### 已确认

- Workspace 配置（文件系统根目录、Sandbox、审批策略）
- 绝对路径 vs 相对路径的行为差异
- Trace 中 `write_file`、`delete`、`list_files` 工具节点的可观测性
- Approval 的 suspended/resumed 生命周期
- Parallel MCP 的 `web_search` 和 `web_fetch` 工具发现与调用
- 真实天气搜索验证（返回 AccuWeather、Weather.com 等结果）
- 与 01-basic-agent 假工具行为的对比

### 待深入

- Workspace 的命令执行能力（`exec` 工具）
- Sandbox 的隔离边界和安全性
- 多 Agent 共享同一个 Workspace 的行为
- Parallel MCP 在高并发下的稳定性和限流策略
- Workspace 与 Workflow 的集成（Workflow 步骤中调用文件操作）

作者：杜文龙 · 2026-08-07
标签：[mastra][workspace][mcp][aiagent][typescript]
