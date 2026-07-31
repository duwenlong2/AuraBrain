# 02-mini-agent

Mastra **极简示例**：从 0 手写，逐行能看懂的最小可运行项目。

> 对比 `01-basic-agent`（官方模板，带 workspace/memory/signals 一大堆），本项目**故意砍到最少**，用于建立"最小可运行"的心智模型。
> 已逐步丰富：**1 Agent + 2 工具 + Memory + Storage + Observability**。

## 快速开始

```shell
cp .env.example .env   # 填 DEEPSEEK_API_KEY
npm install
npm run dev            # 打开 http://localhost:4111（远程 SSH 用 VS Code 端口转发）
```

## 目录结构

```
02-mini-agent/
├── package.json                  ← 依赖 + 脚本
├── tsconfig.json                 ← TS 配置
├── .env.example / .env           ← key 模板 / 真实 key（.env 不提交）
└── src/mastra/
    ├── index.ts                  ← 入口：Agent + Storage + Observability 都在这配
    ├── agents/calculator-agent.ts ← Agent：人设 + 模型 + 工具 + Memory
    └── tools/
        ├── calculator-tool.ts    ← 工具1：计算器
        └── unit-convert-tool.ts  ← 工具2：单位换算
```

**只有 3 个代码文件**（加 2 个工具文件 = 4 个 .ts）。这就是最小可运行的 Mastra 应用。

---

# 学习笔记

## 核心概念

### 两个核心对象

```
工具（Tool） = 4 件套：id + description + inputSchema + execute
Agent       = 5 件套：id + name + instructions + model + tools
```

- `description`：写给 **AI 看**的说明（Agent 靠它决定用不用这个工具）
- `inputSchema`：参数格式（Agent 必须按这个传参）
- `execute`：真正干活的函数（自己写逻辑，或调现成 API）

### 数据流（一条消息怎么走）

```
用户输入："128*1111 等于多少？"
    ↓
① index.ts 注册的 Agent
    ↓
② Agent 带 instructions 调 DeepSeek
    ↓
③ DeepSeek 推理："数学题 → 用计算器工具"
    ↓
④ 调用工具（a=128, b=1111, operation=multiply）
    ↓
⑤ 工具返回 { result: 142208 }
    ↓
⑥ DeepSeek 组织成中文回答
```

### 关键认知：工具实现 vs Agent 价值

```
Agent  = 聪明助手（会听人话、会判断、会组织回答）
Tools  = 它手边的软件工具（你提供 execute，通常几行或调 API）
```

- **工具**：execute 要你实现，但"实现"通常是**调现成 API/库**，不是从零造
  （查天气→调 API；加减乘除→几行代码）
- **Agent 的价值**：自动理解用户意图、决定用什么工具、怎么组合——**这部分框架帮你做，不用写死 if/else**

## 实验记录

### 实验 1：计算器 Agent 测试（成功）

问 "128*1111 等于多少？" → 完整链路清晰可见：

```
Agent 推理：这是数学题 → 用 calculator
工具参数：  { a:128, b:1111, operation:"multiply" }
工具结果：  { result: 142208 }
Agent 回答：128 × 1111 = 142208 ✅
```

问 "1000除25等于多少？" → Agent 甚至自己分析了中文"除"的歧义，选 1000÷25=40。

**教学点**：Agent 不只是"调工具"，它会先理解再决定。Studio 能看到每一环（reasoning / 工具参数 / 工具结果 / 最终回答）。

### 实验 2：多工具选择测试（成功，且发现 Agent 的"创造性"）

给 Agent 挂上第二个工具（unit_convert）后，交替问两种问题：

**测试 A：** "100摄氏度是多少华氏度"
```
Agent 推理：这是温度单位转换 → 用 unit_convert
工具调用：unit_convert → 结果 212
Agent 回答：100°C = 212°F ✅（选对了工具）
```

**测试 B：** "5公里等于多少光年" ⚠️ 重点
```
unit_convert 并不支持"光年"（只支持 km/m/cm/mm, kg/g, c/f）
但 Agent 没有放弃，而是：
  自己知道 1 光年 ≈ 9.4607×10¹² 公里
  → 改用 calculator 工具算：5 ÷ 9.4607×10¹²
  → 结果：5.285 × 10⁻¹³ 光年 ✅ 答案正确！
```

**教学点**：
1. **多工具选择**：同一个 Agent，数学题选 calculator、单位题选 unit_convert——不用写 if/else，Agent 靠工具的 description 判断。
2. **Agent 的创造性**：unit_convert 不支持"光年"，Agent 就**改用 calculator 手动算**。工具只是"能力片段"，Agent 负责组合它们解决没见过的问题。
3. 工具 description 写得越清楚（说明支持什么单位），Agent 选得越准。

### 实验 3：Memory 名字实验（记忆生效 + 边界）

给 Agent 加上 `memory: new Memory({ options: { generateTitle: true } })` 后，测试：

**测试过程：**
```
你："你叫巴克，我叫杜文龙"
Agent："好的，这段对话里我会记住"
你："我叫什么？"
Agent："你叫杜文龙呀" ✅ 记住了
（刷新页面后，Agent 依然记得）✅
```

**关键发现与边界：**
```
✅ 这段对话内：能记住（刷新页面也在，因为对话 thread 还在）
⚠️ 新建对话：失忆（每个对话各自记各自的，不串）
⚠️ 没配数据库时重启：记忆清空（内存存储，不持久）
```

**教学点：**
1. **Memory 的本质**：不是 Agent 变聪明，而是**把对话历史"喂"给它看**。它记得，是因为它"看得到"之前的话。
2. **记忆按对话（thread）隔离**：每个对话各自的记忆，新对话从零开始。
3. **Memory 和 Storage 是配套的**——记忆存哪由 Storage 决定（见实验 4 的对照验证）。

### 实验 4：Storage 持久化对照实验（亲手验证"内存 vs 磁盘"）

给 `index.ts` 配上 LibSQL 数据库后，做了两次完整重启的对照：

**第 1 轮：没配数据库（内存存储）**
```
重启 dev server
→ 之前所有对话记录都没了
→ 记忆消失 ❌
```

**第 2 轮：配了 LibSQL（`storage: new LibSQLStore({ url: 'file:./mastra.db' })`）**
```
重启 dev server
→ 对话记录还在（从磁盘读回来）
→ 巴克记得"我叫杜文龙" ✅
```

**教学点：**
1. **Storage 决定持久性**：Memory 存的对话，存哪由 Storage 决定。
   ```
   没配 Storage → 内存存储（运行期有效，重启丢）
   配 LibSQL → 存到 mastra.db 文件（重启还在）
   ```
2. **LibSQL = SQLite 的一个文件**：`file:./mastra.db` 就是项目里的一个数据库文件，数据都在里面。
3. **真实坑**：**改配置（如 storage）后，热更新可能不彻底**——要**完全重启** dev server 才生效。当时热更新没加载到 storage，差点以为没配成功。

### 实验 5：Observability 可观测性（Agent 的"黑匣子"）

给 `index.ts` 加上 `Observability` 配置后，每次运行都会被记录：

```
配置：
  Observability             = 采集每次运行
  MastraStorageExporter     = 记录存到 mastra.db
  SensitiveDataFilter       = API key 等敏感数据脱敏
```

**怎么观测（Traces 页）**：
```
1. 和 Agent 对话几次（产生 trace 记录）
2. Studio → 点 Agent 顶部的 "Traces" 标签页
3. 每条 = 一次运行，可展开看：
   ├── 模型调用（DeepSeek）：输入/输出 tokens、耗时
   ├── 工具调用（calculator）：参数、结果、耗时
   └── 完整执行链路
```

**教学点**：
1. **Observability 是调试 Agent 的核心**——回答慢、工具没调用、token 超了，看 trace 就知道原因。
2. **MastraPlatformExporter 需要 Mastra 平台 token**（`MASTRA_PLATFORM_ACCESS_TOKEN`），没有会自动禁用（`setDisabled`），不报错。**不用平台就不配它**（本地看 trace 够用，且不依赖商业平台）。
3. 数据存哪：trace 存 `mastra_ai_spans` 表。

### 真实 trace 数据（从数据库读取）

跑 3 次对话（单位换算 / 计算器 / 普通对话）后，从 `mastra_ai_spans` 表读取的真实耗时：

```
对话 1（触发 unit_convert）总耗时 2110 ms：
  agent run（整个运行）          2110 ms
  ├── input processor（输入处理）   3 ms
  ├── memory: recall（记忆召回）    0 ms
  ├── llm: deepseek（调 DeepSeek）2012 ms  ← 大头！
  ├── tool: unit_convert（工具调用） 2 ms
  ├── output processor（输出处理）  14 ms
  └── memory: save（保存记忆）     12 ms

对话 2（触发 calculator）总耗时 2039 ms：llm 2029 ms，tool 1 ms
对话 3（普通对话，无工具）总耗时 1588 ms：llm 1580 ms
```

**核心洞察**：
```
✅ 每次对话耗时 99% 花在"等模型回复"（1500~2000 ms）
✅ 工具调用只要 1~2 ms（本地函数，瞬间完成）
✅ 记忆读写只要 0~12 ms（数据库很快）
结论：Agent 的"慢"几乎全在模型调用，框架本身开销可忽略。
      调优重点是模型和 prompt，不是框架。
```

**trace 揭示的 Agent 运行流程**（一次对话的真实步骤）：

```
agent run（开始）
→ input processor（处理输入）
→ memory: recall（读取之前的记忆）
→ llm（DeepSeek 推理）→ 决定是否用工具
→ tool（调用工具，如果有）→ 结果回给 llm
→ llm（再推理，组织回答）
→ output processor（处理输出）
→ memory: save（保存这次对话）
```

## 数据库：位置与结构

### 数据库文件在哪

```
位置：examples/02-mini-agent/src/mastra/public/mastra.db
```

> ⚠️ **坑**：LibSQL 的 `file:./mastra.db` 是**相对路径**，相对于 Mastra 的 bundle 运行目录，**不是项目根目录**。实际落在 `src/mastra/public/` 下。（01 也一样：`examples/01-basic-agent/src/mastra/public/mastra.db`）

### 表结构（关键表）

数据库里有很多表（大部分是 Mastra 预建的空表），关键的表：

| 表 | 存什么 | 实际数据 |
|----|--------|---------|
| `mastra_threads` | 对话线程（标题等） | ✅ 有（"命名巴克与设定探险性格"——generateTitle 自动起的） |
| `mastra_messages` | 对话消息（你说的话 + AI 回复） | ✅ 有 |
| `mastra_ai_spans` | 可观测性 trace/span | 跑对话后会有 |
| `mastra_observational_memory` | 观察性记忆 | 配了才用 |

**验证"重启记忆还在"的真相**：记忆其实存在 `mastra_threads` + `mastra_messages` 表里（磁盘文件），重启后 Mastra 从文件读回，所以记得。

## 术语对照（英文 → 直观理解）

| 术语 | 中文 | 直观理解 |
|------|------|---------|
| Agent | 智能体 | 自主干活的 AI 助手 |
| Tool | 工具 | Agent 的"手和脚" |
| Instructions | 系统提示词 | 告诉 Agent"你是谁"的说明书 |
| Model | 模型 | Agent 的大脑（DeepSeek/OpenAI） |
| Prompt | 提示词 | 用户发给 AI 的话 |
| Schema | 结构定义 | 数据"长什么样"（工具参数格式） |
| Execute | 执行 | 真正干活的函数 |
| Provider | 提供商 | 提供模型的厂商 |
| API Key | 密钥 | 访问服务的"钥匙"（放 .env） |
| Memory | 记忆 | Agent 记住之前的话 |
| Storage | 存储 | 数据存在哪 |
| Observability | 可观测性 | 记录每次运行干了什么 |
| Thread | 对话线程 | 一次对话的上下文 |
| Trace | 追踪 | 一次运行的完整记录 |
| Span | 片段 | trace 里的一段（模型调用/工具调用） |
| Token | 令牌 | 模型处理文字的最小单位（计费用） |
| Exporter | 导出器 | 把记录"送出去"的组件（本地/平台） |

---

_最后更新：2026-07-31_

