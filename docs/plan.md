# Mastra 学习规划（6-8 周）

## 核心定位

**以研究框架的方式学习 Mastra，而不是急着用它做应用。**

这 6-8 周只搞清楚一件事：Mastra 到底是个什么样的框架？

```
1. 它能做什么（能力边界）
2. 它怎么设计的（源码深挖）
3. 它的优势和缺陷（评估）
4. 它怎么发展过来的（仓库迭代史）
5. 一个好的 Agent 框架应该怎么设计（沉淀成自己的判断力）
```

之后才谈应用：给 AuraCore（ESP32 硬件项目）设计云端 AI 大脑。

## 学习方式

- 每篇博客 = 一个知识点 = **学习 + 写最小例子验证 + 笔记 + 总结成文**
- 节奏：2-3 天一篇，每天约 4 小时（有工作，不赶）
- 篇目随学习动态调整，不僵化
- 每个知识点都可能是一篇博客（延续 WPF 系列的模式）

## 阶段划分

```
阶段零：预备（TS/环境，穿插进行）
    ↓
阶段一：能力全貌（初级）——约 3 周
    ↓
阶段二：源码深挖（高阶）——约 3 周
    ↓
阶段三：框架评估——约 2 周
    ↓
阶段四：应用（AuraCore 等）——之后
```

---

# 博客篇目规划

## 第 01 篇：为什么选 Mastra（系列开篇）

**性质：调研文章，不写代码**

内容：
- 技术选型背景：LangGraph / LangChain / OpenClaw / AutoGen / Mastra
- 语言维度：Python 系主导招聘 / C++ 无高星方案 / C# 偏 Windows 生态
- 设计维度：各框架核心模型差异
- 学习大纲

> ⚠️ 写之前必须做真实调研，其他框架的细节标注"待验证"，由本人确认，不编造。

---

# 阶段一：能力全貌（初级）——约 3 周

> 目标：所有能力过一遍，每个写最小例子跑通，建立"能做什么"的地图。

## 02 · 环境搭建与项目结构

- 安装、创建项目、目录结构拆解
- 每个文件在干什么（package.json / index.ts / agents / tools）
- 产出：项目结构笔记

## 03 · 第一个 Agent

- model / instructions / description 的作用
- 例子：改 instructions，让 Agent 扮演不同角色

## 04 · Agent 对话与记忆（对话记忆）

- 多轮对话怎么工作，对话记忆如何开启
- 例子：连续对话，测试记忆是否生效

## 05 · 工具系统入门

- createTool：id / description / inputSchema / execute
- 例子：写一个计算器或天气查询工具

## 06 · 工具进阶

- 多工具并存、工具描述的艺术（Agent 靠描述选工具）
- 例子：一个多工具的 Agent

## 07 · Workflow 入门

- step 定义、.then() 链式
- 例子：一个两步处理流程

## 08 · Workflow 进阶

- .branch() 分支 / .parallel() 并行 / suspend-resume
- 例子：带分支和并行的流程

## 09 · 存储系统

- LibSQL / DuckDB / 复合存储，数据到底存哪了
- 例子：查看 mastra.db 的数据结构

## 10 · 可观测性与 Studio

- trace / span 是什么，Studio 能看什么
- 例子：跑一次完整对话，分析 trace

## 11 · MCP 集成

- MCP 是什么、怎么接入外部工具
- 例子：接一个文件系统 MCP

## 12 · 多 Agent 协作

- agent-network / subagent 怎么协作
- 例子：跑通官方示例

---

# 阶段二：源码深挖（高阶）——约 3 周

> 目标：读源码，理解每个机制内部怎么设计的。每篇产出"内部流程图 / 架构分析"。

## 13 · Agent loop 剖析

- 源码：`packages/core/src/loop/loop.ts`
- generate() 每步做什么、消息列表怎么流转、工具循环
- 产出：Agent 内部流程图

## 14 · 工具调用链路剖析

- 源码：`packages/core/src/tools/`
- LLM 输出工具调用 → schema 校验 → execute → 结果回填
- 产出：调用链路图

## 15 · Workflow 执行引擎剖析

- 源码：`packages/core/src/workflows/`
- execution-engine / 状态机 / evented / scheduler
- 产出：引擎结构图

## 16 · 记忆系统剖析

- 源码：`packages/memory/`
- 对话 / 观察性 / 工作记忆各自怎么实现
- 产出：记忆架构图

## 17 · 存储抽象剖析

- 源码：`packages/core/src/storage/`
- MastraStorage 接口、LibSQL/DuckDB 实现、复合存储
- 产出：存储接口设计分析

## 18 · 可观测性剖析

- 源码：`packages/core/src/observability/`
- tracing / span / SensitiveDataFilter 怎么实现
- 产出：可观测性设计分析

## 19 · MCP 内部实现

- 源码：`packages/mcp/`
- 协议接入、工具注册流程
- 产出：MCP 接入流程图

## 20 · 模型路由剖析

- 源码：`packages/core/src/llm/`
- 'openai/gpt-5.4' 怎么被解析、provider 怎么注册切换
- 产出：路由实现分析

## 21 · 处理器与 guardrails

- 源码：`packages/core/src/processors/`
- input/output 校验、成本控制、防护机制
- 产出：防护机制分析

---

# 阶段三：框架评估——约 2 周

> 目标：以研究者视角评价框架，沉淀自己的架构判断力。

## 22 · 框架优势分析

- 设计得好的地方（batteries-included、模块化、Agent+Workflow）
- 结合源码论据，不是空谈

## 23 · 框架缺陷与边界

- 哪些场景难受、哪些边界问题
- 结合真实使用体验

## 24 · 仓库迭代史

- git log / changelog / 版本演进
- 架构怎么变的、核心能力新增时间线

## 25 · 与主流框架对比

- 和 LangGraph 等的设计取舍、适用场景
- 需要真实调研

## 26 · 如何设计一个好的 Agent 框架

- 从源码收获 + 如果我来设计
- 结合自己已有的架构经验（WPF/Prism 等）交叉思考

## 27 · 实战复盘与下一步

- 做一个完整的 loop 项目验证理解（体现框架价值）
- 复盘：能不能达成目标？卡在哪？技术现状？
- 应用规划（AuraCore）

---

# 阶段四：应用（第 9 周起，不赶）

## 候选方向

1. **AuraCore + Mastra**：给 ESP32 装云端大脑
   - Agent 解析自然语言 → 结构化指令 → MQTT 下发 → 硬件动作
   - 每个硬件动作（前进/转摄像头/抓取）= 一个工具
   - 复杂组合动作 = Workflow
   - 先用模拟设备跑通，再接真硬件

2. **办公助手**：处理 todo / 邮件整理

## 最终项目形态（对标 AuraCore 风格，云端方案整体开源）

> 阶段四的云端 AI 项目按 AuraCore 的项目组织风格设计，整体开源。

```
aura-brain/（示例名，云端 AI 大脑）
├── src/                      ← 核心代码
│   ├── agents/               ← Agent 定义
│   ├── tools/                ← 硬件动作工具（前进/转摄像头/抓取）
│   └── workflows/            ← 复杂组合动作编排
├── examples/
│   └── helloworld/           ← 示例从 helloworld 起步（与设备通信）
├── docs/
│   └── 01-helloworld-tutorial.md  ← 从零开始的图文教程
├── README.md                 ← 快速开始
└── LICENSE                   ← 开源协议
```

设计原则（延续 AuraCore）：
- **接口清晰**：核心模块接口独立，方便扩展
- **示例驱动**：每个示例一个目录，从 helloworld 起步
- **教程化**：docs 从零开始，降低使用门槛
- **文档齐全**：README 有快速开始
- **整体开源**：云端方案开放，与 AuraCore 形成闭环

## 学习项目 vs 最终项目

```
examples/
├── 01-basic-agent    ← 学习练习场（阶段一/二/三用，可随意折腾）
└── ...               ← 后续示例按编号扩展
aura-brain            ← 最终项目（阶段四建，按 AuraCore 风格，独立开源）
```

---

# 写作风格约定

- 每篇从真实问题/痛点切入
- 先说结论，再展开
- 大量 ASCII 流程图
- 善用生活类比
- 区分概念
- 实测数据驱动
- 明确技术边界（确认的事实 / 待验证的内容）
- 总结分层（一句话、三句话、给非技术人员的解释）

---

_最后更新：2026-07-31_
