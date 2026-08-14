# 07 · Durable Agent：让任务可以暂停、恢复和继续执行

> 本文以当前仓库的 `examples/07-durable-agent` 为准，记录 Mastra Durable Agent 的基本用法、`runId`、工具暂停恢复，以及它和普通 Agent、Memory 的区别。
>
> 示例代码：[durable-agent.ts](../../examples/07-durable-agent/src/mastra/agents/durable-agent.ts)；暂停工具：[research-tool.ts](../../examples/07-durable-agent/src/mastra/tools/research-tool.ts)

## 关于 AuraBrain 开源项目

这是我的开源项目 [AuraBrain](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

本文对应的代码：`examples/07-durable-agent/`（Durable Agent 学习示例）

```
examples/07-durable-agent/
├── src/mastra/
│   ├── index.ts                     ← 注册 Durable Agent、Storage、Observability
│   ├── agents/durable-agent.ts      ← 普通 Agent + Durable 包装
│   ├── tools/research-tool.ts       ← 会暂停并等待批准的工具
│   └── models/azure.ts              ← Azure 模型配置
└── README.md                        ← 运行和恢复实验
```

## 一、先说结论

Durable Agent 解决的问题是：

```text
普通 Agent：任务在当前运行中完成
Durable Agent：任务有 runId，可以暂停、恢复、重新观察事件
```

它不会让模型更聪明，也不会改变 Agent 的工具选择逻辑。它提供的是可靠执行能力：

```text
Agent Loop
  + runId
  + 可恢复 Stream
  + 事件缓存
  + suspend / resume
  + PubSub 生命周期
```

因此 Durable Agent 不是所有 Agent 都必须使用的默认组件。短任务和普通问答用普通 `Agent` 就够了；只有长任务、审批任务、断线恢复任务和重要后台任务，才需要考虑 Durable。

## 二、先看普通 Agent 和 Durable Agent

普通 Agent：

```ts
const baseAgent = new Agent({
  id: 'durable-learning-base-agent',
  name: 'Durable 学习基础 Agent',
  instructions: `你是一个研究助手。收到研究主题后，使用 research_topic 获取结果，再用中文总结。`,
  model: azureModel,
  tools: {
    research_topic: researchTool,
  },
});
```

它负责：

```text
模型
instructions
工具
Agent Loop
```

包装成 Durable Agent：

```ts
export const durableAgent = createDurableAgent({
  agent: baseAgent,
  id: 'durable-learning-agent',
  name: 'Durable 学习 Agent',
  maxSteps: 4,
});
```

这不是重新创建一个大脑，而是在普通 Agent 外面加运行时能力：

```text
baseAgent
  -> createDurableAgent()
  -> durableAgent
```

Durable Agent 仍然会使用原来的模型、instructions 和工具。

## 三、为什么普通成功请求看不出 Durable

如果任务顺利完成，两个 Agent 的表面流程可能一样：

```text
模型
  -> 工具
  -> 工具结果
  -> 最终回答
```

所以只看最终回答，很难看出 Durable 的区别。

Durable 的差异要在这些场景中观察：

```text
工具暂停
客户端断线
使用 runId 重新观察
使用 runId 恢复任务
后台任务继续执行
进程或请求生命周期和任务生命周期分离
```

这也是本示例故意让 `researchTool` 第一次调用就暂停的原因。没有暂停、断线或恢复时，Durable 只是“包住了普通 Agent”，能力不会显眼。

## 四、暂停工具是怎么写的

```ts
export const researchTool = createTool({
  id: 'research-topic',
  description: '先请求用户批准，再执行一个需要时间的研究任务并返回阶段性研究结果。',
  inputSchema: z.object({
    topic: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ topic }, context) => {
    const { suspend, resumeData } = context.agent ?? {};

    if (!resumeData) {
      return suspend?.({
        topic,
        message: `是否批准开始研究“${topic}”？`,
      });
    }

    if (resumeData.approved !== true) {
      throw new Error(`研究“${topic}”未获批准。`);
    }

    await new Promise(resolve => setTimeout(resolve, 2_000));

    return {
      topic,
      findings: [`${topic} 的基础资料已经收集。`],
    };
  },
});
```

第一次调用：

```text
resumeData 不存在
  -> 调用 suspend
  -> 工具不执行后续研究
  -> Agent 保存暂停状态
```

恢复调用：

```text
resumeData = { approved: true }
  -> 不再 suspend
  -> 执行真正的研究逻辑
  -> 返回工具结果
```

这里要区分两种数据：

```text
suspend payload：告诉用户为什么暂停
resumeData：用户恢复时传回的决定
```

例如暂停 payload：

```json
{
  "topic": "Agent Runtime",
  "message": "是否批准开始研究“Agent Runtime”？"
}
```

它不一定包含 `runId`。`runId` 属于 Durable Stream 事件的外层元数据。

## 五、真实验证流程

启动项目：

```bash
cd examples/07-durable-agent
npm run dev
```

在 Studio 中选择 `durableAgent`，发送：

```text
请研究 Agent Runtime，并总结两个关键结论。
```

也可以使用 Stream API。PowerShell 推荐先用对象生成 JSON，避免 Bash 引号问题：

```powershell
$body = @{
  messages = @(
    @{
      role = "user"
      content = "请研究 Agent Runtime，并总结两个关键结论。"
    }
  )
} | ConvertTo-Json -Depth 5 -Compress

curl.exe -N -X POST `
  "http://localhost:4111/api/agents/durable-learning-agent/stream" `
  -H "content-type: application/json" `
  --data-raw $body
```

返回事件中重点看：

```text
start
  -> 携带 runId

tool-call-suspended
  -> 携带暂停 payload
```

例如：

```text
runId = 5adecc6a-f115-4ce7-aa45-4fc42d546514
```

恢复：

```powershell
$resumeBody = @{
  runId = "替换成真实 runId"
  resumeData = @{
    approved = $true
  }
} | ConvertTo-Json -Depth 5 -Compress

curl.exe -N -X POST `
  "http://localhost:4111/api/agents/durable-learning-agent/resume-stream" `
  -H "content-type: application/json" `
  --data-raw $resumeBody
```

恢复后预期看到：

```text
tool-result
  -> step-start
  -> 模型总结
  -> step-finish
  -> finish
```

这个过程证明：

```text
第一次请求暂停
  -> runId 标识这次任务
  -> 保存暂停点
  -> 第二次请求用同一个 runId 恢复
  -> 从暂停点继续执行
```

## 六、Durable Agent 和 Memory 的区别

这两个概念都涉及“保存”，但保存的对象不同：

| 能力 | 保存什么 | 解决什么问题 |
| --- | --- | --- |
| Memory | 对话内容、用户偏好、观察结果 | 下一次对话记得过去发生的事情 |
| Storage | 消息、线程、Trace、Workflow 数据 | 把应用数据持久化下来 |
| Durable Agent | 任务运行状态、暂停点、事件流 | 任务中断后还能继续执行 |
| Cache | 可重新发送的流事件 | 客户端断线后补回事件 |

可以简单记成：

```text
Memory：记住聊过什么
Durable：记住任务做到哪里
```

## 七、什么时候使用 Durable Agent

适合：

```text
长时间研究
大型代码分析
浏览器多步骤操作
文件处理和构建任务
人工审批后继续
客户端可能断线
任务结果很重要
后台任务需要查询状态
```

不适合：

```text
普通问候
简单计算
短时间查询
一次工具调用就能完成的请求
不需要恢复的同步 API
```

选择方式：

```text
短任务 + 同步响应
  -> Agent

长任务 + 可恢复流 / 审批
  -> DurableAgent

长任务 + 事件工作流
  -> EventedAgent

分布式后台任务 + 调度重试
  -> InngestAgent
```

不要把所有 Agent 默认包装成 DurableAgent。Durable 会带来额外复杂度：

```text
runId 管理
Cache / PubSub
恢复接口
任务清理
序列化约束
跨进程恢复
运维和监控
```

## 八、当前示例的边界

本示例验证的是：

```text
createDurableAgent
runId
工具 suspend
resume-stream
恢复后继续执行
Durable Trace 生命周期
```

当前默认使用进程内缓存，适合学习 API 和生命周期。生产环境还需要考虑：

```text
Redis 等持久化 Cache
跨进程和服务重启恢复
任务超时和清理
权限校验
失败重试
敏感数据过滤
```

本篇暂不继续深入 Evented Agent、Inngest Agent 和分布式 Durable 执行，先把“为什么需要 Durable、它和普通 Agent 有什么区别”讲清楚。

## 九、总结

```text
Agent：负责思考和调用工具
Agent Loop：负责多轮决策
Durable Agent：负责让任务可以定位、暂停、恢复和重新观察
```

一句话：

> Durable Agent 不是让每个 Agent 都变得更强，而是让需要可靠完成的 Agent 任务更不容易因为断线、审批或长时间执行而丢失。

本系列目前的学习路线：

```text
01 Agent
02 Tool / Memory / Storage
03 Workflow
04 Observational Memory
05 Workspace / Approval / MCP
06 Agent Loop
07 Durable Agent（本篇，先学到生命周期）
```

## 技术边界

### 已确认

- `createDurableAgent({ agent })` 可以包装普通 Agent
- Durable Agent 保留原 Agent 的模型、instructions 和工具
- Stream 事件中可以获得 `runId`
- 工具可以通过 `suspend` 暂停
- 使用相同 `runId` 和 `resumeData` 可以恢复暂停任务
- Durable Agent 和 Observational Memory 解决不同问题
- 当前示例默认进程内缓存，适合学习，不等于生产级跨进程恢复

### 待深入

- Redis 持久化 Cache 和跨进程事件恢复
- `createEventedAgent` 的事件工作流执行
- Inngest Agent 的后台调度、重试和故障恢复
- 运行中任务的 `recover` 和服务重启恢复
- Durable Agent 与 Workspace、Workflow 的组合

## 参考资料

- [Mastra Durable Agent 源码](https://github.com/mastra-ai/mastra/tree/main/packages/core/src/agent/durable)
- [Mastra Durable Agents 示例](https://github.com/mastra-ai/mastra/tree/main/examples/durable-agents)
- [Mastra Agent 文档](https://mastra.ai/docs/agents/overview)

作者：杜文龙 · 2026-08-13
标签：[mastra][durable-agent][agent][aiagent][typescript]
