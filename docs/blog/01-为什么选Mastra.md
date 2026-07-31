# 01 · 为什么选 Mastra（调研 + 学习规划）

> 写 agent 写了很久，想系统地把一个框架吃透。动手前先做技术选型调研，发现网上很多说法是错的，自己也一度搞错了几个框架的定位。这篇记录调研过程、为什么选 Mastra，以及这个系列的学习规划。

## 一、先说结论

选 **Mastra**，一个 TypeScript 的 AI Agent 框架。

```
1. 语言匹配 —— TypeScript 原生，和我技术栈一致
2. 覆盖全面 —— Agent + Workflow 双一等公民，一个框架两种范式
3. 自包含 —— 记忆、存储、可观测性全内置，不依赖商业平台
4. 开源自托管 —— 符合"云端方案整体开源"的诉求
```

## 二、调研过程

候选清单：

```
LangGraph（LangChain 公司） / LangChain / OpenClaw / AutoGen（微软） / Mastra
```

调研中纠正了三个认知错误：

### 1. OpenClaw 不是 Agent 开发框架

它是**自托管 AI 助手网关**——连接 25+ 聊天 App（WhatsApp/Telegram/Slack 等）到 AI agent 的运行环境 + 多渠道接入层，**不提供构建 agent 的开发 API**。定位和 LangGraph/Mastra 完全不同，不该放在一起比。

```
聊天 App（WhatsApp/Telegram/Slack...）→ Gateway 控制平面 → AI agent
```

### 2. AutoGen 已进入维护模式

微软官方明确标注：`AutoGen is now in maintenance mode`，不再接受新功能，新项目推荐用 **Microsoft Agent Framework（MAF）**。一个官方自己都不推荐新项目用的框架，选型时直接排除。

### 3. LangGraph 和 LangChain 是两个层级

```
LangChain  = agent 框架（模型/工具/loop 的抽象 + 集成）
LangGraph  = 低层编排运行时（图/状态机、持久执行、human-in-the-loop）
LangSmith  = 平台（tracing、评估、部署）
```

LangGraph 官方定位是 low-level orchestration framework，很底层，专注编排。要快速做 agent，官方推荐更高的 Deep Agents / LangChain agents。

## 三、横向对比

| 维度 | LangGraph | LangChain | OpenClaw | AutoGen | Mastra |
|------|-----------|-----------|----------|---------|--------|
| 语言 | Python(+JS) | Python(+JS) | TypeScript | Python(+.NET) | **TypeScript** |
| 定位 | 低层编排运行时 | agent 框架 | AI 助手网关 | 多agent框架 | **agent框架(全栈)** |
| 开发框架？ | 是 | 是 | **否** | 是(维护中) | **是** |
| 内置可观测性 | 否(靠LangSmith) | 否(靠LangSmith) | 有 | 有 | **有** |
| 内置记忆/存储 | 部分 | 部分 | 有 | 有 | **有(完整)** |

> Star 数（调研时点）：LangGraph 38.5k / AutoGen 60.1k / OpenClaw 384.6k / Mastra ~10k，仅作量级参考。

## 四、排除逻辑与选择理由

```
OpenClaw  → 排除：不是开发框架，是运行环境
AutoGen   → 排除：维护模式，官方推 MAF
LangGraph → 权衡：生态最大、招聘最多，但 Python 为主，
            且要凑齐 LangChain + LangSmith 全家桶，
            可观测性和部署强依赖商业平台
```

选 Mastra 的四个理由：**TypeScript 语言匹配、Agent + Workflow 双范式、记忆/存储/可观测性全内置不依赖商业平台、开源自托管**（呼应 AuraCore，云端方案整体开源）。

## 五、学习规划

以**研究框架**的方式学，不急着做应用。

```
阶段一：能力全貌（初级）—— 所有能力过一遍，每个写最小例子跑通
阶段二：源码深挖（高阶）—— 读源码，理解每个机制内部怎么设计的
阶段三：框架评估 —— 优势、缺陷、迭代史、如何设计一个好框架
```

**每篇博客 = 一个知识点 = 最小 MVP 例子 + 学习笔记**，与 `examples/` 一一对应：

| 博客 | 主题 | examples 对应 |
|------|------|--------------|
| 01 | 为什么选 Mastra（本片） | - |
| 02 | 环境搭建 + 项目结构 | 01-basic-agent |
| 03 | 第一个 Agent | 01-basic-agent |
| 04 | 工具系统 | 01-basic-agent |
| ... | 后续按进度展开 | examples/02-... |

**每个示例保持最小 MVP**：能跑、能验证一个知识点、讲清楚怎么初始化、怎么切换、怎么学习，不堆功能。

## 六、怎么开始

```bash
# 1. 拉取 Mastra 源码（本仓库不包含源码）
git clone https://github.com/mastra-ai/mastra.git mastra
# 更新源码：cd mastra && git pull

# 2. 跑第一个示例
cd examples/01-basic-agent
cp .env.example .env    # 填入 OPENAI_API_KEY
npm install
npm run dev             # 打开 http://localhost:4111
```

## 技术边界

**已确认（本次调研）**：OpenClaw 是网关非框架 / AutoGen 维护模式 / LangGraph 与 LangChain 分层 / Mastra 内置记忆存储可观测性。

**待验证（后续学习补）**：LangGraph.js 成熟度 / MAF 能力边界 / Mastra 社区规模与迭代速度 / 各框架对控制 ESP32 硬件的支持方式。

## 参考资料

- LangGraph: github.com/langchain-ai/langgraph
- OpenClaw: github.com/openclaw/openclaw
- AutoGen: github.com/microsoft/autogen
- Mastra: mastra.ai/docs

---

_作者：杜文龙 · 2026-07-31_
_标签：[mastra][aiagent][typescript][技术选型]_
