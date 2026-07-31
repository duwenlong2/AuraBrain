# 01-basic-agent

学习 Mastra 的第一个示例项目（基础 Agent 练习场）。

> 本目录是 `examples/` 下的第一个项目，对应学习规划"阶段一：能力全貌"的练习环境。学习用的代码都可以在这里随意折腾。基于 [Mastra](https://mastra.ai) 官方 Agent Harness 模板。

## 快速开始

```shell
# 1. 配置环境变量（key 只写 .env，永不提交）
cp .env.example .env
# 在 .env 里填 DEEPSEEK_API_KEY（默认模型 deepseek/deepseek-v4-flash）

# 2. 启动开发服务器
npm run dev
```

打开 http://localhost:4111 访问 **Mastra Studio**（Agent 可视化控制台，可对话调试）。

> **远程 SSH 环境访问**：dev server 跑在远程的 localhost:4111。用 VS Code 的端口转发（Ports 面板 → Forward a Port → 4111），然后本机浏览器访问 `http://localhost:4111`。直接访问远程 IP:4111 不可达。

## 目录结构

```
01-basic-agent/
├── package.json              ← 项目清单：依赖 + 脚本（dev/build/start）
├── tsconfig.json             ← TypeScript 配置
├── .env.example              ← 环境变量模板（key 留空，可提交）
├── .env                      ← 真实 key（被 .gitignore 忽略，不提交）
├── .gitignore                ← 忽略规则（node_modules/.env/.mastra 等）
├── README.md                 ← 你在这里
├── AGENTS.md                 ← 给 AI 编程助手看的说明（不是给人看的）
├── .agents/skills/           ← Mastra 官方技能文档（AI 助手查 API 用）
└── src/
    └── mastra/               ← ★ 真正的代码
        ├── index.ts          ← ★★ 项目入口（所有 Agent/工具在这注册）
        ├── agents/
        │   ├── agent.ts      ← ★ 通用助手 Agent（web_fetch 等 4+ 工具）
        │   └── hello-agent.ts← ★ 天气助手 Agent（只有 weather_query 工具）
        └── tools/
            ├── weather-tool.ts   ← ★ 天气工具（目前是模拟假数据）
            ├── schedule-tools.ts ← 定时任务工具
            └── web-fetch-tool.ts ← 网页抓取工具（Agent 用它查真实天气）
```

---

# 学习笔记

## 核心概念

### 数据流：一句话进来怎么走

```
你在 Studio 输入："北京天气怎么样？"
        ↓
① src/mastra/index.ts（入口，已注册的 Agent）
        ↓
② 路由到对应的 Agent
        ↓
③ Agent 带着 instructions（提示词）调用 DeepSeek
        ↓
④ DeepSeek 推理：这个问题需要工具吗？
        ├─ 需要 → 调用工具 → 结果回给 DeepSeek
        └─ 不需要 → 直接生成回答
        ↓
⑤ 回答返回 Studio
```

```
一句话理解：
index.ts = 总闸（注册所有 Agent 和工具）
Agent    = 大脑（理解 + 决定）
Tools    = 手脚（实际做事：查天气/抓网页/设定时）
```

### Agent 的本质

Agent 就是一个**"带系统提示词 + 一堆工具"的配置对象**：

- `instructions` 决定它像谁（性格和行为）
- `tools` 决定它能干什么（能力边界）
- `model` 决定用哪个大脑（DeepSeek/OpenAI/...）

### 工具的本质（createTool）

工具结构固定，关键是理解每一部分：

```typescript
createTool({
  id: 'weather_query',              // 工具唯一名
  description: '...',               // ★ 写给 Agent 看的！Agent 靠它决定用不用这个工具
  inputSchema: z.object({...}),     // 参数定义（Agent 必须按格式传参）
  execute: async ({...}) => {...},  // 真正干活的函数
});
```

**重要规则**：
1. **新建的 Agent/工具必须在 `index.ts` 注册**，否则 Studio 里看不到、用不了
2. **description 是给 AI 看的，不是给人看的**——描述写得越清楚，Agent 越会用
3. **Agent 传参不可控**——它可能传 "东京"、"Tokyo, Japan" 而不是精确的 "tokyo"，工具要做容错
4. **工具的质量 = Agent 回答的质量**——给 Agent 假工具，它就给你假答案，而且说得像真的一样

---

## 实验记录

### 实验 1：通用 Agent 查"北京天气"（成功，且出人意料）

- 问**通用 Agent（agent）**："北京天气怎么样？"
- 它**没有天气工具**，但自己决定用 `web_fetch` 抓 `wttr.in` 和 `Open-Meteo` 两个真实天气网站
- 返回了**真实**北京天气（雷阵雨 34°C，未来三天预报）

**教学点**：
> Agent 不是"只会调用挂好的工具"，而是会**分析问题、自己决定怎么用现有工具**。它发现自己没有天气工具，就想到"用 web_fetch 抓天气网站"。这就是 **agentic（自主性）**。

### 实验 2：天气助手查"东京明天天气"（失败，暴露工具问题）

- 问**天气助手（hello-agent）**："东京明天天气怎么样？"
- 它调用了 `weather_query` 工具，但返回 `0°C / Unknown / 0%`
- Agent 诚实承认"只能获取当前天气，无法提供明天预报"

**教学点（三个发现）**：
1. **传参不可控**：`tokyo` 明明在工具硬编码列表里，但 Agent 传的城市名不是精确 `"tokyo"`（可能是"Tokyo, Japan"/"东京"），走了 `if (!data)` 空分支。工具靠**精确字符串匹配**很容易失配。
2. **能力边界**：工具 description 写 "current weather"（当前天气），工具也返回不了"明天"——**工具做不到的，Agent 也做不到**。
3. **Agent 诚实**：拿到 0/Unknown 后没有编造，如实告知局限。

### 串起来看：工具质量决定 Agent 回答质量

```
weather_query（假工具）
├── 硬编码 5 个城市（假数据）
├── 只支持"当前"天气
└── 只认精确英文城市名
        ↓
Agent 用这个工具 → 传参失配 → 空数据
        ↓
最终回答：0°C 未知 + 无法预报明天
```

**结论**：改好一个工具，Agent 的能力立刻变强。下一步就是把 `weather_query` 改造成真实 API（Open-Meteo，免费不用 key）。

---

---

# 官方模板附带的说明（保留参考）

## 模板能力

- 项目级 `workspace/` 目录（Agent 读写文件、执行命令都在里面）
- 文件变更/删除/命令执行的审批门禁
- 对话记忆、自动生成标题、任务追踪
- 定时任务（重启后持久保留）
- 本地 LibSQL 存储 + DuckDB 可观测性（可选 Turso）

## Storage

默认 `file:./mastra.db` 数据库保存 Agent 记忆、任务和定时任务。要用 Turso，在 `.env` 设 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`。

## 定制你自己的 Agent

- 改 `src/mastra/agents/agent.ts`：模型、提示词、记忆、工作空间、审批策略
- 改 `src/mastra/tools/`：网页抓取、定时任务等工具
- 改 `src/mastra/index.ts`：存储和可观测性
- `workspace/` 下加文件/技能给 Agent 用

## Learn more

- Mastra 文档：https://mastra.ai/docs
- 官方课程：https://mastra.ai/course
- Discord 社区：https://discord.gg/BTYqqHKUrf
