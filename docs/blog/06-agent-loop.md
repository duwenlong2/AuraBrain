# 06 · Agent Loop：工具、提示词和动态决策到底怎么配合

> 本文以当前仓库的 `examples/06-agent-loop` 为准，记录 Mastra Agent Loop 的真实运行方式，以及参考 OpenClaw、Goose、Cline、Aider 后对 Agent 设计分层的理解。
>
> 示例代码：[loop-agent.ts](../../examples/06-agent-loop/src/mastra/agents/loop-agent.ts)；工具实现：[project-tools.ts](../../examples/06-agent-loop/src/mastra/tools/project-tools.ts)

## 关于 AuraBrain 开源项目

这是我的开源项目 [AuraBrain](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

本文对应的代码：`examples/06-agent-loop/`（通用 Agent 外壳 + 动态工具选择 + Agent Loop）

```
examples/06-agent-loop/
├── src/mastra/
│   ├── index.ts                  ← 注册 Agent、Storage、Observability
│   ├── agents/loop-agent.ts      ← Agent 角色、工具集合和 Loop 配置
│   ├── tools/project-tools.ts    ← 当前示例的项目诊断能力包
│   └── models/azure.ts           ← Azure 模型配置
└── README.md                     ← 运行方式和实验问题
```

这篇博客讲的知识点（工具描述、instructions、Loop、maxSteps、动态工具选择、固定流程分层），都可以在这个示例中运行和观察。

## 一、先说结论

Agent Loop 不是一条写死的业务流水线，而是一个反复决策的运行循环：

```
用户请求
  -> 模型查看当前上下文和可用工具
  -> 选择一个或多个工具，或者直接回答
  -> 工具执行并返回结果
  -> 结果进入下一轮模型上下文
  -> 模型重新判断下一步
  -> 继续调用工具，或者结束
```

真正的 Agent Loop 关注的是：**根据当前结果决定下一步做什么**。

但它并不意味着所有流程都交给模型。工具权限、审批、参数校验和必须遵守的业务顺序，仍然应该由运行时策略、工具实现或 Workflow 控制。

## 二、为什么之前的成本分析例子不够真实

最初的示例是：

```text
1. 获取成本明细
2. 计算成本
3. 输出结果
```

它可以稳定展示多轮调用，但它更像一条固定流水线。模型真正能自主决定的事情很少，业务场景也被限制在一个项目成本问题中。

这样的例子仍然有教学价值，因为它能说明：

```text
工具调用
  -> 工具结果
  -> 下一轮模型调用
  -> 最终回答
```

但它不能代表 VS Code Agent、OpenClaw 或 Cline 这类编程助手。真实编程任务不一定有固定顺序：有时先读文件，有时先跑测试，有时需要搜索文档，有时只需要直接回答。

所以本次把例子改成“通用 Agent 外壳 + 项目诊断能力包”。用户可以问项目概况、最近进展、质量验证，也可以一次询问多个方面。Agent 根据问题选择工具，不再由 instructions 规定 `1、2、3`。这里的通用，指 Loop 和 Agent 配置方式可以复用；当前实际能力仍由这三个项目诊断工具提供。

## 三、Agent 的最小配置

当前 Agent 的核心配置如下：

```ts
export const loopAgent = new Agent({
  id: 'agent-loop-learning-agent',
  name: '通用任务 Agent',
  instructions: `你是一个通用任务助手，负责帮助用户完成当前请求。

请先理解用户的目标，再从当前可用工具中选择合适的能力。工具返回结果后，重新判断是否还需要其他信息；一个问题可能需要多轮调用，也可能一次调用就足够。

信息足够时用中文直接回答。不要编造工具没有返回的事实，也不要为了调用工具而调用工具。`,
  model: azureModel,
  tools: {
    inspect_project: inspectProjectTool,
    inspect_recent_changes: inspectChangesTool,
    run_project_quality_checks: runQualityChecksTool,
  },
  defaultOptions: {
    maxSteps: 6,
    onIterationComplete: async context => {
      console.log(
        `[Agent Loop] iteration=${context.iteration} final=${context.isFinal} ` +
          `tools=${context.toolCalls.map(tool => tool.name).join(',') || 'none'}`,
      );
    },
  },
});
```

这段代码没有规定：

```text
第一轮一定调用哪个工具
第二轮一定调用哪个工具
所有问题必须调用几个工具
```

它只提供：

```text
角色：通用任务助手
目标：帮助用户理解项目
原则：不编造、信息足够就回答
能力：三个项目诊断工具
保险：最多 6 个 step
观测：每轮打印 Loop 状态
```

## 四、工具是怎么提供给模型的

以项目概况工具为例：

```ts
export const inspectProjectTool = createTool({
  id: 'inspect-project',
  description: '查看项目的基本目标、技术栈和当前状态。用户询问项目概况时使用。',
  inputSchema: z.object({
    project: z.string().describe('项目名称，例如 AuraBrain'),
  }),
  execute: async ({ project }) => {
    // 查询并返回项目数据
  },
});
```

一个工具主要由四部分组成：

```text
id：工具的内部标识

description：告诉模型这个工具能做什么

inputSchema：约束模型传入的参数

execute：真正执行代码的函数
```

工具描述不是普通的提示词文本。Mastra 会把工具转换成模型请求中的结构化工具定义，模型看到的是类似这样的能力：

```text
工具名：inspect_project
用途：查看项目的基本目标、技术栈和当前状态
输入：project，字符串
```

模型据此决定要不要调用它，并生成符合 Schema 的参数。

工具描述回答的是：

```text
“我这个工具能做什么？”
```

它不应该承担整个 Agent 的工作流程。

## 五、`instructions` 为什么还需要存在

既然工具已经有 description，Agent 为什么还需要 instructions？

因为两者回答的问题不同：

| 层 | 主要问题 | 例子 |
| --- | --- | --- |
| `instructions` | Agent 的总体身份和原则是什么 | 用中文回答，不编造结果 |
| `description` | 某个工具能做什么 | 查看项目概况 |
| `inputSchema` | 参数必须长什么样 | `project` 必须是字符串 |
| `execute` | 实际动作怎么执行 | 返回项目数据 |

如果把所有工具路由说明都复制到 instructions 中，就会产生重复维护：工具改名了，Prompt 还可能保留旧名字。

当前示例已经把 instructions 简化成全局规则，把具体能力交给工具 description：

```text
instructions：理解目标、自主选择、重新判断、不编造
工具 description：我负责查看项目、我负责查看进展、我负责质量检查
```

这就是成熟 Agent 常用的分层方式。

## 六、这次实验观察什么

### 实验 1：单工具问题

在 Studio 中发送：

```text
请介绍 AuraBrain 项目的技术栈和当前状态。
```

预期链路：

```text
模型
  -> inspect_project
  -> 工具返回项目概况
  -> 模型生成回答
```

这是最短的 Agent Loop：有一次工具调用，然后结束。

### 实验 2：另一个单工具问题

```text
AuraBrain 最近完成了什么？下一步是什么？
```

预期调用：

```text
inspect_recent_changes
```

虽然工具集合没有变化，但模型根据用户问题选择了不同能力。

### 实验 3：综合问题

```text
请全面分析 AuraBrain 当前的项目情况、最近进展和质量状态。
```

这次模型可能选择多个工具：

```text
第 1 轮：inspect_project
第 2 轮：inspect_recent_changes
第 3 轮：run_project_quality_checks
第 4 轮：汇总回答
```

也可能因为模型一次生成多个安全的工具调用而出现不同的 Trace。重点不是强行得到固定轮数，而是观察：工具结果如何进入下一轮，模型如何根据已有结果继续或结束。

### 实验 4：普通聊天

```text
你好，请介绍一下你自己。
```

预期可能不调用工具，直接回答：

```text
模型
  -> 直接输出文本
  -> Loop 结束
```

这说明 Agent Loop 并不是“每次都要调用工具”。

## 七、Mastra 源码中的 Loop

Mastra 的入口可以简化理解为：

```text
loop()
  -> workflowLoopStream()
    -> agentic-loop
      -> agentic-execution
        -> 模型调用 / 工具执行
```

`agentic-loop` 使用循环工作流保存每轮执行状态。每一轮结束后，它会整理：

```text
当前文本
工具调用
工具结果
模型停止原因
累计 steps
```

然后根据停止条件决定是否继续。

`onIterationComplete` 的类型定义是：

```ts
export type OnIterationCompleteHandler = (
  context: IterationCompleteContext,
) => IterationCompleteResult | void | Promise<IterationCompleteResult | void>;
```

它表示：

```text
Mastra 每轮完成后传入 IterationCompleteContext
用户回调可以同步返回、异步返回，或者不返回控制结果
```

当前示例的回调只记录：

```ts
onIterationComplete: async context => {
  console.log(
    `iteration=${context.iteration} ` +
      `final=${context.isFinal} ` +
      `tools=${context.toolCalls.map(tool => tool.name).join(',') || 'none'}`,
  );
}
```

没有返回 `{ continue: true }`，意味着不强行覆盖模型的停止判断。

`maxSteps: 6` 仍然保留，因为动态 Agent 也可能由于模型判断异常而重复调用工具。它是循环上限，不是业务流程。

## 八、参考成熟项目后的设计对照

### 1. OpenClaw：Tools、Skills、Plugins 分层

OpenClaw 官方文档把能力分成：

```text
Tools：可调用的动作，例如 exec、read、edit、browser、web_search
Skills：教 Agent 如何以及何时使用已有工具的任务说明
Plugins：添加工具、渠道、模型、Hooks 和 Skills 的运行时扩展
```

一个 Skill 可以只针对发布任务生效：

```md
---
name: release-notes
description: Generate release notes from recent changes
---

When the user asks for release notes:
- inspect recent changes
- group changes by category
- mention breaking changes
- do not publish without approval
```

这里的流程是局部工作方法，不是所有 Agent 请求的总流程。

OpenClaw 还会按 Workspace、Project、Personal、Managed、Bundled 等来源加载 Skill，并按 allowlist、环境变量、命令是否存在和配置条件过滤。最终只把当前 Agent 真正可用的 Skill 注入 Prompt。

### 2. Goose：动态 Extension 和 MCP 工具

Goose 使用 Extension Manager 管理 MCP 扩展，大致过程是：

```text
连接 Extension
  -> list_tools()
  -> 收集工具
  -> 加命名空间
  -> 过滤不可用工具
  -> 缓存工具列表
  -> 把可用工具提供给模型
```

工具名可能变成：

```text
filesystem__read
github__search_issues
browser__open
```

命名空间避免不同 Extension 的工具重名，也让运行时知道应该把调用分发给哪个 Extension。

我们的 Parallel MCP：

```ts
tools: await parallelMcp.listTools()
```

已经实现了“动态发现工具”，但还没有完整实现 Goose 那样的 Extension 管理、工具过滤和缓存治理。

### 3. Cline：Plan / Act 和运行时审批

Cline 把复杂任务分为：

```text
Plan Mode：探索、分析、形成计划、等待确认
Act Mode：编辑文件、执行命令、运行测试
```

它还提供 checkpoints，让用户能够查看和回滚 Agent 的修改。

这说明“计划”和“执行”不一定要靠 Prompt 中的固定编号实现，也可以通过运行模式和运行时权限控制实现。

### 4. Aider：修改后验证，失败结果再进入 Loop

Aider 的典型循环是：

```text
模型提出修改
  -> 应用修改
  -> 自动 lint
  -> lint 失败，错误返回模型
  -> 模型修复
  -> 运行测试
  -> 测试失败，错误返回模型
```

这里的“修改后验证”不是一句 Prompt，而是宿主程序真实执行 lint/test，再把结果放回上下文。

## 九、固定流程放在哪里

这是 Agent 设计中最容易混淆的部分。

### Agent Loop 负责动态决策

```text
要不要读文件
要不要搜索网页
要不要运行测试
要不要调用多个工具
是否已经有足够信息
```

### Skill / Rules 负责局部方法

```text
如何修 Bug
如何做代码 Review
如何生成发布说明
如何整理会议纪要
```

它们只在匹配的任务中生效。

### Workflow 负责必须遵守的顺序

```text
验证余额
  -> 创建订单
  -> 扣款
  -> 发送通知
```

这种顺序不能只依赖模型。应该用 Workflow、事务或业务代码保证。

### Tool / Policy 负责安全边界

```text
文件只能在 Workspace 内
删除需要审批
命令限制在 Sandbox
参数必须通过 Schema
密钥不能写入 Prompt 或日志
```

一句话：

```text
Agent 决定“下一步想做什么”
Workflow 保证“业务必须怎么做”
Policy 保证“哪些动作允许做”
```

## 十、通用 Agent、多个 Agent 和多个 Loop

Agent Loop 是通用执行机制，不是项目分析功能：

```text
通用 Agent 外壳
  + 当前可见工具集合
  + 当前 Skill / Rules
  + 当前会话和工作区上下文
  + 当前权限策略
  -> 一次 Agent Run
      -> 一个 Loop 状态
```

普通情况下，一个 Agent 可以根据不同请求选择不同工具。复杂系统才需要多个专业 Agent：

```text
Coordinator Agent Loop
  -> Coding Agent Loop
  -> Research Agent Loop
  -> Review Agent Loop
```

每个 Agent Run 都可以有自己的 Loop 状态，但不需要为每类工具重新发明一套 Loop。是否拆 Agent，主要看角色、权限、上下文和模型是否真的不同。

当前 06 没有伪装成完整的 VS Code Agent。它展示的是一个通用 Agent 外壳，并挂载了一个项目诊断能力包。以后把 `project-tools.ts` 换成 `read/edit/execute/browser/web/todo` 工具，Loop 的核心代码仍然可以保持不变。

## 十一、总结

```text
Tool：Agent 能做什么
Tool description：这个工具什么时候适合用
Instructions：Agent 总体是什么角色、遵守什么原则
Skill：某类任务的可复用工作方法
Loop：根据当前结果动态决定下一步
Workflow：必须固定顺序的业务流程
Policy：权限、审批、沙箱和参数约束
Trace：实际发生了哪些模型和工具调用
```

本次把 06 示例从固定成本流水线改成了通用 Agent 外壳，并挂载项目诊断能力包。它不再用 `instructions` 写死：

```text
第一步调用 A
第二步调用 B
第三步回答
```

而是把三个能力放在工具 description 中，把角色和全局原则放在 instructions 中，再由 Loop 根据用户问题和工具结果动态推进。通用 Agent 不是“拥有所有能力”，而是“能够在当前可见能力范围内动态工作”。

这才是 VS Code Agent、OpenClaw、Goose、Cline 等成熟项目共同采用的方向：**能力可以扩展，任务方法可以按需加载，固定约束交给运行时，下一步决策交给 Agent Loop。**

## 技术边界

### 已确认

- Mastra Agent Loop 可以在多轮中组合多个工具
- `maxSteps` 是循环上限，不是固定业务流程
- `onIterationComplete` 可以观察每轮的 `iteration`、`isFinal` 和 `toolCalls`
- 工具 description、Agent instructions、inputSchema、execute 负责不同层次
- 当前示例支持单工具、多工具和零工具三类请求
- OpenClaw 使用 Tools / Skills / Plugins 分层
- Goose 使用 Extension 动态发现、命名和过滤 MCP 工具
- Cline 使用 Plan / Act、审批和 checkpoints
- Aider 通过 lint/test 结果驱动后续修复

### 待深入

- Mastra 中动态加载 Skill 的产品化实现
- 工具权限、Approval 和 Workspace Policy 的组合
- Agent Loop 与 Workflow 的混合编排
- 失败重试、上下文压缩和长任务恢复
- Durable Agent 如何持久化 Loop 状态并断点恢复

## 参考资料

- [OpenClaw Tools](https://docs.openclaw.ai/tools)
- [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
- [OpenClaw Architecture](https://docs.openclaw.ai/concepts/architecture)
- [Goose 源码](https://github.com/aaif-goose/goose)
- [Cline SDK](https://docs.cline.bot/cline-sdk/overview)
- [Cline 源码](https://github.com/cline/cline)
- [Aider Linting and Testing](https://aider.chat/docs/usage/lint-test.html)
- [Aider 源码](https://github.com/Aider-AI/aider)
- [Mastra Agent Loop 源码](https://github.com/mastra-ai/mastra/tree/main/packages/core/src/loop)

作者：杜文龙 · 2026-08-13
标签：[mastra][agent][agent-loop][aiagent][typescript]
