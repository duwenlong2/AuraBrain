# 为什么选 Mastra：一个 Agent 技术栈的调研复盘

> 写 agent 写了很久，一直想系统地把一个框架吃透。动手之前先做了一轮技术选型调研——本来以为很快，结果发现网上很多说法是错的，连我自己也一度搞错了几个框架的定位。这篇先把调研过程写清楚，最后是我的选择和学习大纲。

## 一、先说结论

**我选了 Mastra，一个 TypeScript 的 AI Agent 框架。**

三个核心理由：

```
1. 语言匹配 —— TypeScript 原生，和我技术栈一致
2. 覆盖全面 —— Agent + Workflow 双一等公民，一个框架两种范式
3. 自包含 —— 记忆、存储、可观测性全内置，不依赖商业平台
```

还有一个隐性理由：**云端方案要整体开源**，Mastra 的开源 + 自托管特性符合这个诉求。

## 二、为什么需要调研：技术选型的困惑

现在做 agent 的技术栈很多，招聘网站上的需求也很明确——LangGraph 之类的最多。但"招聘最多"不等于"最适合我"，所以我把主流选项都过了一遍：

```
候选清单：
├── LangGraph（LangChain 公司）
├── LangChain
├── OpenClaw
├── AutoGen（微软）
└── Mastra
```

## 三、调研中发现：几个重要的认知修正

调研过程比想象中有价值，因为**网上的信息和我的预判都是错的**。记录一下：

### 3.1 OpenClaw 不是 Agent 开发框架

这是我错得最离谱的一个。我一开始把 OpenClaw 当成和 LangGraph 并列的"框架"。

实际它是个**自托管 AI 助手网关**：

```
聊天 App（WhatsApp/Telegram/Slack/Discord...）
        ↓
   Gateway 控制平面
        ↓
      AI agent
```

它是给"想要一个随时能发消息的个人 AI 助手"的人用的运行环境 + 多渠道接入层，**不提供构建 agent 的开发 API**。定位和 Mastra/LangGraph 完全不同，不该放在一起比。

### 3.2 AutoGen 已经进入维护模式

微软官方明确标注：

```
⚠️ AutoGen is now in maintenance mode.
   不再接受新功能
   新项目推荐用 Microsoft Agent Framework（MAF）
```

一个已经进入维护模式、官方自己都不推荐新项目用的框架，选型时直接排除。

### 3.3 LangGraph 和 LangChain 是两个不同层级

这两个经常被混为一谈，官方其实把它们拆成了不同产品：

```
LangChain  = agent 框架（模型/工具/loop 的抽象 + 集成）
LangGraph  = 低层编排运行时（图/状态机、持久执行、human-in-the-loop）
LangSmith  = 平台（tracing、评估、部署）
Deep Agents = 高层 agent harness（规划、子代理）
```

LangGraph 官方定位是 **low-level orchestration framework**，很底层，专注编排，不抽象 prompt 和架构。要快速做 agent，官方推荐的是更高的 Deep Agents / LangChain agents。

## 四、横向对比

| 维度 | LangGraph | LangChain | OpenClaw | AutoGen | Mastra |
|------|-----------|-----------|----------|---------|--------|
| 语言 | Python(+JS) | Python(+JS) | TypeScript | Python(+.NET) | **TypeScript** |
| 定位 | 低层编排运行时 | agent 框架 | AI 助手网关 | 多agent框架 | **agent框架(全栈)** |
| 开发框架？ | 是 | 是 | **否** | 是(维护中) | **是** |
| 内置可观测性 | 否(靠LangSmith) | 否(靠LangSmith) | 有 | 有 | **有** |
| 内置记忆/存储 | 部分 | 部分 | 有 | 有 | **有(完整)** |

> Star 数（调研时点）：LangGraph 38.5k / AutoGen 60.1k / OpenClaw 384.6k / Mastra ~10k。
> 数据仅作量级参考，社区的活跃质量需要单独看迭代速度和 issue 响应。

## 五、为什么排除其他，选 Mastra

### 排除逻辑

```
OpenClaw  → 排除：不是开发框架，是运行环境
AutoGen   → 排除：维护模式，官方推 MAF
LangGraph → 权衡：生态最大、招聘最多，但 Python 为主，
            且要凑齐 LangChain + LangSmith 全家桶，
            可观测性和部署强依赖商业平台
```

### 选择 Mastra 的理由

**1. 语言**
Python 系生态最强，但我的技术栈不是 Python。C++ 没有高星方案，C# 偏 Windows 生态（有 WPF/WinUI3 的前车之鉴，不再考虑）。**TypeScript 是平衡点。**

**2. 一个框架覆盖两种范式**

```
Agent：LLM 自主决策，适合开放性问题
Workflow：你定义步骤，适合需要精确控制的场景
```

Mastra 把 Agent 和 Workflow 都作为一等公民，不用像 LangGraph 生态那样拼装。

**3. 自包含，不依赖商业平台**

可观测性、记忆、存储全内置。这对"云端方案整体开源"的诉求很关键——我不想为了可观测性必须接某个商业 SaaS。

**4. 开源自托管**

符合整体开源的方向，后面可以和自己的硬件项目（AuraCore）形成闭环。

## 六、这个系列要怎么学

选定了框架，接下来是学习规划。思路是**以研究框架的方式学**，不是急着做应用。

### 三个阶段

```
阶段一：能力全貌（初级）
  所有能力过一遍，每个写最小例子跑通
    ↓
阶段二：源码深挖（高阶）
  读源码，理解每个机制内部怎么设计的
    ↓
阶段三：框架评估
  优势、缺陷、迭代史、如何设计一个好框架
```

### 每篇博客一个知识点

延续我一直以来的学习方式：每篇博客 = 一个知识点 = 学习 + 最小例子 + 总结。几天一篇，边学边沉淀。

### 最终检验

学完能不能独立设计、实现、评估一个 Agent 框架？
- 能 → 继续深入，做实战项目
- 不能 → 复盘卡在哪，搞清技术现状，规划下一步

## 七、总结

### 给非技术人员的一段话

> 选技术栈就像选工具。市面上工具很多，有的看起来最流行（LangGraph），有的是另一种东西只是被误以为同类（OpenClaw），有的已经被厂家放弃（AutoGen）。我选 Mastra，是因为它的语言、设计、开放程度最符合我的情况——就像一个全能工具箱，不用为每个功能再买一堆配件，而且完全归自己所有。

### 一句话版本

> 调研完主流 Agent 技术栈后，我选了 Mastra：TypeScript 原生、Agent 和 Workflow 双引擎、可观测性/记忆/存储全内置、开源自托管，最符合我的技术栈和"整体开源"的诉求。

### 三句话版本

1. 调研中纠正了三个认知错误：OpenClaw 不是开发框架、AutoGen 已维护模式、LangGraph 和 LangChain 是两个层级。
2. 排除逻辑：OpenClaw 非框架、AutoGen 被弃、LangGraph 生态强但 Python 为主且依赖商业平台。
3. 选 Mastra：语言匹配 + 双范式 + 自包含 + 开源，接下来按"能力全貌 → 源码深挖 → 框架评估"三阶段研究它。

## 技术边界

### 已确认（本次调研）

- OpenClaw 是自托管 AI 助手网关，非开发框架（官方文档）
- AutoGen 处于维护模式，官方推荐 MAF（官方仓库标注）
- LangGraph 是低层编排框架，LangChain 是框架层（官方文档）
- Mastra 提供 Agent + Workflow、内置记忆/存储/可观测性（官方文档 + 源码）

### 待验证（后续学习补）

- LangGraph.js（TS 版）的成熟度
- Microsoft Agent Framework（MAF）的能力边界
- Mastra 的社区规模、迭代速度、版本演进
- 各框架对"控制 ESP32 硬件"这类场景的支持（MCP/工具）
- star 数与实际生产使用的相关性

## 参考资料

- LangGraph：github.com/langchain-ai/langgraph
- LangChain docs：docs.langchain.com
- OpenClaw：github.com/openclaw/openclaw
- AutoGen：github.com/microsoft/autogen
- Mastra：mastra.ai/docs

---

_作者：杜文龙_
_发布日期：2026-07-31_
_标签：[mastra][aiagent][typescript][技术选型]_
