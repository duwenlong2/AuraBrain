# 05 · Workspace、Sandbox、Approval 与 Parallel Search MCP

这个项目学习 Mastra 如何让 Agent 在一个受限制的本地工作目录中读写文件、执行命令、通过 Parallel Search MCP 搜索公开网页，并在高风险操作前暂停等待确认。

## 一、官方参考来源

官方参考是同级源码仓库中的：

- [`template-agent-harness`](../../mastra/templates/template-agent-harness)
- 官方 Agent 实现：[`src/mastra/agents/agent.ts`](../../mastra/templates/template-agent-harness/src/mastra/agents/agent.ts)
- 官方说明：[`README.md`](../../mastra/templates/template-agent-harness/README.md)

官方模板还包含 Web Search、网页抓取、Memory、Schedules 和 Signals。本项目把 Workspace 和无需 API Key 的 Parallel Search MCP 放在一起，并把官方示例中的模型替换为当前已经验证过的 Azure provider。

## 二、先建立整体认识

Workspace 不是一个独立的 Agent，而是挂载到 Agent 上的一组能力：

```text
Agent
  └── Workspace
        ├── LocalFilesystem：文件读写
        ├── LocalSandbox：命令执行
        └── tools policy：先读后写、删除审批
  └── Parallel MCP：按关键词搜索或读取公开网页
```

本项目的运行关系：

```text
用户请求
  -> workspaceAgent 判断意图
  -> 选择 Workspace 自动注册的工具
  -> LocalFilesystem 或 LocalSandbox 执行
  -> 策略判断是否需要先读或审批
  -> 返回结果并写入 Trace
```

必须区分两个目录：

```text
workspace/       Agent 可以操作的文件目录
workspace.db     Memory 和运行数据的 Storage
```

`workspace/` 不是操作系统级安全沙箱。官方模板明确提醒：`LocalSandbox` 默认不提供 OS 隔离，不要把这个服务暴露给未认证的公网。

本项目使用项目根目录的绝对路径来创建 Workspace：`INIT_CWD/workspace`。这是因为 Mastra Dev 的实际服务进程可能以 `src/mastra/public` 为当前目录；如果直接使用相对路径 `workspace`，文件可能落到 `src/mastra/public/workspace`，而不是项目根目录下的 `workspace/`。

## 三、准备项目

```bash
cd /home/lenovo/Codes/mastra-learning/examples/05-workspace
cp .env.example .env
```

在 `.env` 中配置 Azure key，然后启动：

```bash
npm install
npm run dev
```

打开终端输出的 Studio 地址，通常是 <http://localhost:4111>。选择 `Workspace Agent`。

## 四、先看代码，再做实验

Workspace Agent 的组合代码在 [`src/mastra/agents/workspace-agent.ts`](src/mastra/agents/workspace-agent.ts)，Parallel MCP 工具连接在 [`src/mastra/tools/mcp/parallel-search.ts`](src/mastra/tools/mcp/parallel-search.ts)：

```ts
import path from 'node:path';

const projectRoot = process.env.INIT_CWD ?? process.cwd();
const workspacePath = path.join(projectRoot, 'workspace');

const workspace = new Workspace({
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

这段配置表达三件事：

1. 文件工具的根目录是 `workspace/`。
2. 写入和编辑前必须先读取目标文件。
3. 删除文件必须经过 Approval。

代码里的 Workspace 工具不是手动写在 `tools` 字段里的；把 `workspace` 挂载到 Agent 后，Mastra 会把 Workspace 工具注册到 Agent。Parallel MCP 的连接和工具发现由独立模块负责，Agent 只通过 `getParallelSearchTools()` 组合它们。这样其他 Agent 或 Workflow 也可以复用同一组检索工具，而不需要重复配置 MCP endpoint。启动后可以访问 `/api/agents`，看到 Workspace 工具和 Parallel MCP 工具。

## 五、按顺序学习

### 实验 1：列出 Workspace 文件

在 Studio 发送：

```text
请列出当前 Workspace 中的所有文件，并告诉我每个文件的路径。
```

观察重点：

- Agent 是否调用 `mastra_workspace_list_files`；
- 返回的文件是否只来自 `workspace/`；
- 是否能看到 `notes.md` 和 `approval-demo.txt`；
- Trace 中工具节点的输入和输出是什么。

你要理解的结论：Agent 不是直接访问项目文件，而是通过 Workspace 提供的受控工具访问文件系统。

### 实验 2：读取初始文件

发送：

```text
请读取 workspace/notes.md，并总结里面的学习问题。
```

观察重点：

- Agent 是否调用 `mastra_workspace_read_file`；
- 工具输入的路径是什么；
- 文件内容如何从工具输出回到 Agent 上下文；
- Trace 中是否能看到“工具调用 -> 工具结果 -> Agent 回复”。

你要理解的结论：Workspace 工具结果会成为 Agent 后续推理的上下文。

### 实验 3：修改文件，观察“先读后写”

发送：

```text
请在 workspace/notes.md 最后增加一行：已完成读取实验。
```

预期流程：

```text
read_file
  -> Agent 了解原内容
  -> edit_file 或 write_file
  -> 返回修改结果
```

观察重点：

- Agent 是否先调用读取工具；
- 未读取就写入时，`requireReadBeforeWrite` 如何阻止操作；
- 修改后重新读取文件，确认内容确实变化；
- Trace 中是否存在多个 Workspace 工具节点。

你要理解的结论：`requireReadBeforeWrite` 是 Workspace 工具策略，不是 instructions 里的文字提醒。Prompt 可以引导模型，但真正的安全约束由 Workspace 配置执行。

### 实验 4：执行只读命令

发送：

```text
请执行 pwd 和 ls -la，告诉我命令的当前目录以及有哪些文件。
```

观察重点：

- Agent 是否调用 `mastra_workspace_execute_command`；
- 命令的工作目录是否是 `workspace/`；
- `pwd` 的输出是否证明了 Sandbox 的工作目录；
- Trace 中命令输入和命令输出分别在哪里。

官方安全边界：`LocalSandbox` 设置的是工作目录，不等于容器或操作系统隔离。不要让未认证用户直接使用这个服务执行任意命令。

### 实验 5：删除文件，观察 Approval

发送：

```text
请删除 workspace/approval-demo.txt。
```

预期流程：

```text
Agent 请求 delete
  -> Workspace 发现 requireApproval: true
  -> 工具暂停
  -> Studio 显示确认请求
  -> 用户批准后继续删除
```

先不要批准，观察暂停状态和 Trace；确认你理解要删除的文件后再批准。批准后重新执行：

```text
请列出 Workspace 文件，确认 approval-demo.txt 是否已经删除。
```

你要理解的结论：Approval 是运行时的暂停/恢复机制，不是模型自己说“我已经确认”就算通过。

### 实验 6：读取公开网页

发送：

```text
请读取 https://mastra.ai，并告诉我页面标题或页面主要介绍了什么。
```

观察重点：

- Agent 是否调用 `web_fetch`，而不是 Workspace 的文件工具；
- 工具输入是否包含完整 URL；
- 输出中的 HTTP 状态、`contentType` 和截断后的正文如何进入 Agent 上下文；
- 访问网页和读取 `workspace/` 是否是两条不同的能力边界。

Parallel MCP 提供 `web_search` 和 `web_fetch`：前者根据关键词发现相关网页，后者在搜索摘要不足或用户指定 URL 时读取页面。搜索结果需要进一步阅读时，可以先调用 `web_search`，再调用 `web_fetch`。

### 实验 7：按关键词搜索网页

发送：

```text
搜索 Mastra Workspace requireApproval 的官方资料，给出结论和来源 URL。
```

观察重点：

- Agent 是否调用 Parallel MCP 的 `web_search`；
- Trace 中是否能看到搜索关键词和 Parallel 返回的结果；
- 最终回答是否区分搜索结果和模型自己的总结；
- 如果需要完整正文，Agent 是否继续调用 `web_fetch`。

Parallel MCP 不需要在本项目配置 API key；它通过 MCP 的 Streamable HTTP endpoint 连接 `https://search.parallel.ai/mcp`。服务端可能有自己的使用限制，具体以 Parallel 的条款为准。

## 六、一次完整练习

可以按下面的连续对话练习：

```text
1. 列出 Workspace 中的文件。
2. 读取 notes.md。
3. 在 notes.md 末尾追加“我理解了 Workspace 的文件边界”。
4. 执行 pwd 和 ls -la。
5. 请求删除 approval-demo.txt，但先不要批准。
6. 查看暂停状态和 Trace。
7. 批准删除。
8. 再次列出文件确认结果。
```

这组练习覆盖：

```text
list -> read -> edit -> execute -> suspend -> approve -> verify
```

## 七、如何看 Trace

不要只看最终 Agent 回复，要按下面顺序看：

1. 找到 `agent run: workspace-agent`。
2. 找到它下面的工具调用节点。
3. 查看工具输入：路径、命令和策略相关信息。
4. 查看工具输出：文件内容、命令结果或暂停原因。
5. 对比下一次 Agent 调用，确认工具结果是否进入了后续上下文。

常见工具名称包括：

| 工具 | 作用 |
| --- | --- |
| `mastra_workspace_list_files` | 列出 Workspace 文件 |
| `mastra_workspace_read_file` | 读取文件 |
| `mastra_workspace_write_file` | 创建或覆盖文件 |
| `mastra_workspace_edit_file` | 局部编辑文件 |
| `mastra_workspace_delete` | 删除文件 |
| `mastra_workspace_execute_command` | 执行命令 |
| `mastra_workspace_get_process_output` | 获取后台进程输出 |
| `mastra_workspace_kill_process` | 结束后台进程 |

## 八、源码对照

官方实现：

- [`template-agent-harness`](../../mastra/templates/template-agent-harness)
- [`agent.ts`](../../mastra/templates/template-agent-harness/src/mastra/agents/agent.ts)
- [`README.md`](../../mastra/templates/template-agent-harness/README.md)

本项目实现：

- [`workspace-agent.ts`](src/mastra/agents/workspace-agent.ts)
- [`index.ts`](src/mastra/index.ts)
- [`workspace/notes.md`](workspace/notes.md)
- [`workspace/approval-demo.txt`](workspace/approval-demo.txt)

对照关系：

| 官方模板 | 本项目 |
| --- | --- |
| `workspacePath = 'workspace'` | 相同 |
| `LocalFilesystem` | 相同 |
| `LocalSandbox` | 相同 |
| `requireReadBeforeWrite` | 相同 |
| 删除 `requireApproval` | 相同 |
| 主模型和 Web/Schedule 工具 | 换成已验证的 Azure 模型，暂时移除无关工具 |
| Memory、Storage、Observability | 保留，用于观察完整运行链路 |

## 九、这次要学会什么

完成实验后，你应该能解释：

```text
Workspace 是什么？
  -> Agent 的文件和命令能力集合

LocalFilesystem 做什么？
  -> 把文件工具限制在指定 basePath

LocalSandbox 做什么？
  -> 设置命令的 workingDirectory，但不提供 OS 隔离

requireReadBeforeWrite 做什么？
  -> 强制修改前先获得目标文件内容

requireApproval 做什么？
  -> 把高风险工具调用暂停，等待用户批准

Trace 看什么？
  -> Agent 如何选择工具、工具收到什么、返回什么、是否暂停
```

## 十、下一步

当前先不要把 Workspace 和 Workflow 混在一起。先完成上面的文件与命令实验；下一阶段再学习：

- 长任务和 Signals；
- Workflow 如何编排固定步骤；
- suspend/resume 如何等待外部事件；
- 真实 AI Workspace 中如何把邮件、文件和任务连接起来。