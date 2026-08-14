# 07-durable-agent

这个示例对照普通 Agent Loop 学习 Durable Agent：普通 Agent 负责模型和工具调用，`createDurableAgent` 为它增加可恢复流和 `runId`。

## 运行

```bash
cp .env.example .env
# 填写 Azure OpenAI 配置
npm install
npm run dev
```

在 Studio 中选择 `durableAgent`，发送：

```text
请研究 Agent Runtime，并总结两个关键结论。
```

第一次调用会暂停并显示批准请求。这个暂停点才是 Durable Agent 的关键实验：

```text
模型调用 research_topic
	-> 工具返回 suspend
	-> Durable Agent 保存 runId 和暂停快照
	-> Studio 等待用户批准
```

批准后，Durable Agent 会从暂停点继续：

```text
resume(runId, { approved: true })
	-> research_topic 从 resumeData 继续
	-> 工具执行 2 秒研究
	-> 模型读取结果并总结
```

拒绝则发送：

```json
{"approved":false}
```

观察 Trace 时重点寻找：`suspended`、`resume`、工具第二次执行和最终 `finish`。

## 重点观察

源码中的关键关系：

```text
baseAgent = Agent（模型 + instructions + tools）
durableAgent = createDurableAgent({ agent: baseAgent })
```

Durable Agent 的流结果包含：

```text
output：流式模型输出
runId：这次任务的唯一 ID
cleanup：取消当前订阅
```

`runId` 是后续恢复或观察同一任务的定位依据。Durable Agent 和 Observational Memory 的区别是：

```text
Memory：记住对话内容
Durable：记住任务执行状态，并支持流事件恢复
```

当前示例默认使用进程内缓存，适合学习 API 和生命周期；生产环境需要配置持久化 Cache（例如 Redis），否则进程重启后不能保证恢复缓存事件。
