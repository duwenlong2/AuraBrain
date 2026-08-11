# 06 · Mastra Workspace：从本地工作区到联网检索

> 本文以当前仓库的 `examples/05-workspace` 为准，记录 Mastra Workspace、Approval、Sandbox，以及 Parallel Search MCP 的接入和验证过程。
>
> 示例代码：[workspace-agent.ts](../../examples/05-workspace/src/mastra/agents/workspace-agent.ts)；检索工具连接：[parallel-search.ts](../../examples/05-workspace/src/mastra/tools/mcp/parallel-search.ts)

## 一、这次要解决什么问题

一个只有模型的 Agent 只能理解请求并生成文本。要让它成为可以工作的助手，还需要把执行能力挂载到 Agent 上：

```text
Agent：理解意图并决定下一步
Workspace：读写文件、执行命令
Approval：在危险动作前暂停等待确认
Parallel MCP：搜索和读取公开网页
Storage：保存对话和运行数据
```

本示例的重点是通过 Trace 和实际请求看清楚这些能力如何连接：

```text
用户请求
  -> Agent 决策
  -> Workspace 或 MCP 工具调用
  -> 工具返回结果
  -> Agent 继续推理
  -> 最终回答
```

## 二、Workspace 介绍

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

Prompt 中的“请先读取再修改”只是模型行为提示；`requireReadBeforeWrite` 才是工具层的运行时约束。Approval 也不是模型回复“我确认了”就算通过，而是实际的暂停和恢复机制。

## 三、为什么使用绝对路径

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

这类问题很容易被误判为“Agent 没有写文件”。实际上，工具执行成功了，只是相对路径解析到了另一个当前目录。对 Workspace 这类文件能力来说，路径解析是行为的一部分，不能只看 Agent 的最终回复。

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

因此，最终回复中的“文件已经创建”并不是证据。真正的证据是 Trace 中有成功的 `mastra_workspace_write_file` 工具结果，并且在 `workspace/` 下能重新读取到这个文件。

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

如果用户没有批准，Trace 应该停在 suspended 状态，文件也不应该被删除。只有批准信息进入恢复流程后，删除工具才真正执行。这里的 Approval 不是 instructions 里的提醒，也不是模型自己生成一句“我确认删除”，而是 Workspace 工具层的运行时控制。

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

Agent 可能会因为模型判断错误而声称“已经完成”，但 Trace 能帮助我们定位问题发生在哪一层：

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