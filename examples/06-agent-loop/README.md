# 06-agent-loop

这个示例用一个通用任务 Agent 观察 Mastra Agent Loop：模型根据用户问题自主选择当前能力包中的工具，工具结果返回后再决定是否需要下一轮。Agent 的 instructions 不列出固定工具流程，工具用途由各自的 description 提供。

当前示例的工具能力包仍然是 AuraBrain 项目诊断工具。通用的是 Agent 外壳和 Loop 机制；换一组工具，就能得到代码助手、研究助手或 Workspace 助手。

## 运行

```bash
cp .env.example .env
# 填写 Azure OpenAI 配置
npm install
npm run dev
```

在 Studio 中选择 `loopAgent`，分别发送下面三个问题，比较每次 Trace 的差异：

```text
请介绍 AuraBrain 项目的技术栈和当前状态。

AuraBrain 最近完成了什么？下一步是什么？

请检查 AuraBrain 当前有哪些质量验证，是否适合提交？
```

## 重点观察

```text
简单问题：模型调用一个工具 -> 生成回答
综合问题：模型调用多个工具 -> 根据工具结果继续 -> 生成回答
普通闲聊：模型不调用工具 -> 直接生成回答
```

`maxSteps` 只是防止模型无限调用工具的上限。`onIterationComplete` 只记录每轮信息，不规定固定顺序；是否继续由模型本轮的停止原因决定。

## 分层设计

```text
instructions：角色、总体目标、真实性和停止原则
tool description：单个工具能做什么、什么时候适合使用
inputSchema：工具参数格式
execute：真正的执行逻辑
maxSteps：防止模型陷入无限循环
```

固定业务顺序应该放在 Workflow 或工具运行时策略中，不应该只靠 Agent instructions 强制。

## 可控 Loop 实验

默认情况下，`onIterationComplete` 只记录日志，不干预模型的停止判断。要验证代码如何控制 Loop，可以启动：

```bash
LOOP_EXPERIMENT=feedback-stop npm run dev
```

然后发送一个需要工具的问题：

```text
请全面分析 AuraBrain 当前的项目情况、最近进展和质量状态。
```

这个实验的控制逻辑是：

```text
第 1 轮：模型调用工具
回调：返回 continue=false + feedback
Mastra：把 feedback 交给模型做最后总结
下一轮：模型输出总结，不再调用工具
结束
```

这里可以同时观察两件事：`maxSteps` 是硬上限，`onIterationComplete` 是每轮结束时的主动控制点。实验结束后可按 `Ctrl+C` 停止服务，再用普通方式启动恢复默认行为：

```bash
npm run dev
```

## 通用 Agent 的边界

```text
通用 Agent：理解目标、选择能力、处理结果、决定是否结束
工具能力包：决定当前 Agent 实际能做什么
Skill：为特定任务补充局部工作方法
Workflow：保证必须固定的业务顺序
Policy：限制权限、审批、路径和副作用
```

因此“通用”不等于把所有工具都注册进去。成熟产品会按 Agent、会话、工作区和权限筛选当前可见工具。

核心配置在 [loop-agent.ts](src/mastra/agents/loop-agent.ts)，工具实现在 [project-tools.ts](src/mastra/tools/project-tools.ts)。
