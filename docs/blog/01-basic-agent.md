# 01 · 官方模板初探：Mastra 项目到底长什么样

> 学一个框架，最快的上手方式不是读文档，而是把一个官方模板跑起来、拆开看、再亲手改。这篇记录我对 Mastra 官方模板（Agent Harness）的探索过程——项目结构、核心概念，以及两个让我"原来如此"的实验。

## 关于 AuraBrain 开源项目

这是我的开源项目 [**AuraBrain**](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

**本文对应的代码**：`examples/01-basic-agent/`（官方模板，已加注释）

```
examples/01-basic-agent/
├── src/mastra/
│   ├── index.ts              ← 总闸（注册 Agent/工具/存储/观测）
│   ├── agents/               ← 2 个 Agent（通用助手 + 天气助手）
│   └── tools/                ← 3 个工具（天气/定时/抓网页）
└── README.md                 ← 完整学习笔记（实验记录 + 概念 + 术语）
```

这篇博客讲的知识点，**完整代码、逐行注释、实验记录都在上面这个目录**。想深入看代码、复现"Agent 自主查天气"和"假工具失配"这两个实验，去开源项目对应目录看。

**仓库怎么读**：

```
AuraBrain/
├── docs/blog/     ← 系列博客（编号和 examples 一一对应）
├── examples/      ← 可运行的示例代码（最小 MVP）
└── mastra/        ← Mastra 框架源码（独立拉取，不提交）
```

**推荐阅读方式**：
1. 看博客建立概念
2. 打开对应 `examples/` 自己跑一遍（`npm run dev`）
3. 想深入：看 `examples` 对应目录的代码 + README 学习笔记
4. 想看框架源码：`git clone https://github.com/mastra-ai/mastra.git mastra`

## 一、先说结论

Mastra 项目的核心就三样东西：

```
Agent = 大脑（理解 + 决定）
Tools = 手脚（实际做事）
index.ts = 总闸（把 Agent 和工具注册起来）
```

**一个请求的完整链路**：

```
你输入一句话
→ index.ts 找到对应的 Agent
→ Agent 带着提示词调模型
→ 模型决定：要不要用工具？
→ 用工具 → 拿结果 → 组织回答
→ 返回给你
```

## 二、官方模板为什么"看着复杂"

用官方 CLI 创建的模板（Agent Harness）自带了很多东西：

```
src/mastra/
├── index.ts        ← 总闸（Agent + 工具 + 存储 + 观测全在这注册）
├── agents/
│   ├── agent.ts    ← 通用助手（挂了 4+ 个工具）
│   └── hello-agent.ts ← 天气助手（只有 1 个工具）
└── tools/
    ├── weather-tool.ts   ← 天气工具
    ├── schedule-tools.ts ← 定时任务工具
    └── web-fetch-tool.ts ← 网页抓取工具
```

加上 workspace（工作空间）、memory（记忆）、storage（存储）、observability（观测）……**对一个新手来说，信息量确实大**。但别怕——真正核心的就那三样（Agent / Tools / index.ts），其他都是"增强功能"。

## 三、实验 1：Agent 自己决定"怎么解决一个问题"

我在 Studio 里问**通用 Agent**："北京天气怎么样？"

它**没有天气工具**（只有 web_fetch 抓网页），但它自己想到了办法：

```
用户问：北京天气怎么样？
    ↓
Agent 推理：我没有天气工具
    ↓
但发现 web_fetch 能抓任意网页
    ↓
自己决定：去抓 wttr.in 和 Open-Meteo 两个天气网站！
    ↓
并行抓取 → 对比 → 给出真实天气
```

结果它给出了**真实**的北京天气（雷阵雨 34°C，未来三天预报）。

**这就是 agentic（自主性）**：

> Agent 不是"只会调用挂好的工具"，而是会**分析问题、自己决定怎么组合现有工具**。工具是能力片段，Agent 负责把它们拼起来解决问题。

## 四、实验 2：工具的质量 = 回答的质量

我再问**天气助手**（它挂了 weather_query 工具）："东京明天天气怎么样？"

结果返回 `0°C / 未知 / 0%`。为什么？看 weather-tool 的代码就明白了：

```typescript
const weatherData = {
  beijing: { temp: 25, condition: 'Sunny', ... },  // 硬编码假数据
  tokyo: { temp: 22, condition: 'Rainy', ... },
  ...
};
const key = city.toLowerCase();
const data = weatherData[key];   // 精确字符串匹配
```

两个问题暴露：
1. **传参不可控**：Agent 传的"东京"不一定是精确的 `"tokyo"`，失配就返回空数据
2. **工具能力边界**：工具只支持"当前天气"，Agent 答不了"明天"

**核心教训**：

> **Agent 的回答质量，取决于工具的质量。** 给 Agent 一个假工具，它就会给你假答案，而且说得像真的一样。它不"知道"工具是假的。

## 五、串起来：理解 Mastra 的关键

```
Agent = 聪明助手（会听人话、会判断）
Tools = 它手边的软件工具（你提供，通常几行或调 API）
框架的价值 = 自动理解意图、决定用什么工具、怎么组合
```

- **工具的实现**：`execute` 要你写，但通常是"调现成 API"，不是从零造
- **Agent 的价值**：自动判断"这种情况该用哪个工具"——不用你写一堆 if/else

## 六、给新手的建议

1. **官方模板当字典**：需要什么查什么，不用一开始全搞懂
2. **别被配置吓到**：memory/storage/observability 都是"数据多了以后"的增强，核心就是 Agent + Tools
3. **亲手做实验**：问同样的问题，看不同 Agent 的反应差异——比看文档有用

## 技术边界

**已确认**：Agent 自主选择工具 / 工具质量决定回答质量 / 传参不可控 / 记忆按对话隔离。

**待深入**：Agent loop 内部机制、Workflow 引擎、多 Agent 协作（后续系列覆盖）。

---

_作者：杜文龙 · 2026-07-31_
_标签：[mastra][aiagent][typescript]_
