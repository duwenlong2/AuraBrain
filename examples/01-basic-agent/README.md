# 01-basic-agent

学习 Mastra 的第一个示例项目（基础 Agent 练习场）。

> 本目录是 `examples/` 下的第一个项目，对应学习规划"阶段一：能力全貌"的练习环境。学习用的代码都可以在这里随意折腾。

基于 [Mastra](https://mastra.ai) 官方 Agent Harness 模板。

## 当前内容

- 通用 Agent（官方模板）
- 自定义 Agent：`src/mastra/agents/hello-agent.ts`（天气助手）
- 自定义工具：`src/mastra/tools/weather-tool.ts`（演示 createTool）

## 快速开始

```shell
# 配置环境变量
cp .env.example .env
# 填入 OPENAI_API_KEY

# 启动开发服务器
npm run dev
```

打开 http://localhost:4111 访问 Mastra Studio。

## 目录结构

```
src/mastra/
├── index.ts               ← Mastra 实例入口
├── agents/
│   ├── agent.ts           ← 官方模板 Agent
│   └── hello-agent.ts     ← 自定义天气助手 Agent
└── tools/
    ├── weather-tool.ts    ← 自定义天气工具
    ├── schedule-tools.ts  ← 定时任务工具
    └── web-fetch-tool.ts  ← 网页抓取工具
```

## Features

- A project-level `workspace/` for files and command execution
- Approval gates for file changes, deletions, and shell commands
- Conversation memory, generated thread titles, and task tracking
- OpenAI web search and direct web page fetching
- Recurring schedules that persist across restarts
- Local libSQL storage and DuckDB observability, with optional Turso storage
- A bundled Mastra skill that helps coding agents use current Mastra APIs

## Get started

Set your `OPENAI_API_KEY` in `.env` or in your environment, then run:

```shell
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) in your browser to access [Mastra Studio](https://mastra.ai/docs/studio/overview).

Select **Agent** in Mastra Studio and try one of these prompts:

- `Get the weather forecast for Austin this weekend.`
- `Create a landing page for a Japanese sakura festival.`
- `Check the SPCX stock price now, then check it every minute.`

The agent asks for approval before it changes files or runs commands. When it creates a schedule, it returns an ID that you can use to pause the schedule.

## Workspace safety

The local filesystem tools stay inside the project-level `workspace/` directory. Shell commands start in that directory, but `LocalSandbox` does not provide operating-system isolation by default. Review command approvals carefully, and do not expose this template through an unauthenticated public server.

## Storage

The default `file:./mastra.db` database stores agent memory, tasks, and schedules locally. To use Turso, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`.

Recurring schedules continue to use model tokens until you pause them. Ask the agent to pause a schedule with the ID returned by `start_schedule`.

## Making it yours

- Edit `src/mastra/agents/agent.ts` to change the model, instructions, memory, workspace, or approval policy.
- Edit `src/mastra/tools/` to customize web fetching and scheduling.
- Edit `src/mastra/index.ts` to change storage and observability.
- Add files or reusable skills under `workspace/` for the agent to use.

## Learn more

To learn more about Mastra, visit our [documentation](https://mastra.ai/docs/). If you're new to AI agents, check out our [course](https://mastra.ai/learn) and [YouTube videos](https://youtube.com/@mastra-ai). You can also join our [Discord](https://discord.gg/BTYqqHKUrf) community to get help and share your projects.

## Deploy to the Mastra platform

The [Mastra platform](https://projects.mastra.ai) provides two products for deploying and managing AI applications built with the Mastra framework. Learn more in the [Mastra platform documentation](https://mastra.ai/docs/mastra-platform/overview).
