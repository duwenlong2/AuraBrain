# 02 · 从 0 写一个极简 Agent：工具、记忆、存储、观测

> 上一篇我们被官方模板的复杂度吓到了。这次换个思路：**从 0 手写一个最小可运行的 Agent**，只留核心，然后一点点加功能。这篇记录整个过程——每个功能是怎么加的、能验证什么、踩了什么坑。

## 关于 AuraBrain 开源项目

这篇文章来自开源项目 [**AuraBrain**](https://github.com/duwenlong2/AuraBrain)（给 AuraCore 装上大脑）。这是一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

**仓库结构**（别人怎么看）：

```
AuraBrain/
├── docs/blog/     ← 系列博客（编号和 examples 一一对应）
├── examples/      ← 可运行的示例代码（最小 MVP）
└── mastra/        ← Mastra 框架源码（独立拉取，不提交）
```

**推荐阅读方式**：
1. 先看博客（00 → 01 → 02...）建立概念
2. 打开对应的 `examples/` 自己跑一遍（`npm run dev`）
3. 想看框架源码就 `git clone https://github.com/mastra-ai/mastra.git mastra`

> 整个系列代码开源（MIT），目标是"把 AI 高阶能力的探索过程完整记录下来"。

## 一、先说结论

一个最小可运行的 Mastra 应用，**只要 3 个代码文件**：

```
src/mastra/
├── index.ts               ← 入口：new Mastra({ agents: {...} })
├── agents/xxx-agent.ts    ← Agent：人设 + 模型 + 工具
└── tools/xxx-tool.ts      ← 工具：id + description + inputSchema + execute
```

加一个 `package.json` + `tsconfig.json` 就能跑起来。**这就是 Mastra 的全部核心。**

## 二、核心概念：Agent 和工具各是什么

### 工具 = 4 件套

```typescript
createTool({
  id: 'calculator',          // 名字（唯一）
  description: '...',        // 写给 AI 看的说明（Agent 靠它判断用不用）
  inputSchema: z.object({}), // 参数格式（Agent 必须按这个传参）
  execute: async (...) => {},// 真正干活的函数
});
```

### Agent = 5 件套

```typescript
new Agent({
  id: 'calculator-agent',     // 唯一标识
  name: 'Calculator Assistant', // 显示名
  instructions: `...`,        // 系统提示词（人设）
  model: 'deepseek/deepseek-v4-flash',  // 大脑
  tools: { calculator },      // 手脚
});
```

**关键**：`description` 是写给 **AI 看**的，不是给人看的。它决定了 Agent 会不会用这个工具。

## 三、实验 1：多工具选择 + Agent 的"创造性"

给 Agent 挂两个工具（计算器 + 单位换算），然后：

**问 "100 摄氏度是多少华氏度"** → Agent 选 unit_convert ✅

**问 "5 公里等于多少光年"** ⚠️ 重点来了：

```
unit_convert 并不支持"光年"（只支持 km/m/cm/mm, kg/g, c/f）
但 Agent 没有放弃：
  自己知道 1 光年 ≈ 9.4607×10¹² 公里
  → 改用 calculator 手动算：5 ÷ 9.4607×10¹²
  → 答案：5.285 × 10⁻¹³ 光年 ✅ 正确！
```

**教学点**：
1. **多工具选择**：Agent 靠工具的 description 判断该用哪个，不用写 if/else
2. **Agent 的创造性**：工具不支持时，它能**组合其他工具绕过去**——这是 agentic 的核心价值

## 四、加 Memory：Agent 记住对话

给 Agent 加一行 `memory` 配置，它就"有记性"了：

```
没有 Memory：
  你说"我叫杜文龙"，再问"我叫什么？" → 它忘了

有 Memory：
  你说"我叫杜文龙"，再问"我叫什么？" → "你叫杜文龙呀" ✅
```

**关键认知**：
- **Memory 的本质**：不是 Agent 变聪明，而是**把对话历史喂给它看**——它记得，是因为它看得到之前的话
- **记忆按对话隔离**：新建对话就"失忆"（每个对话各记各的）

## 五、加 Storage：内存 vs 磁盘的对照实验

Memory 存的对话，**存哪由 Storage 决定**。我做了两次完整重启的对照：

```
第 1 轮（没配数据库 = 内存存储）：
  重启 dev server → 对话记录全没了，记忆消失 ❌

第 2 轮（配了 LibSQL = 磁盘持久化）：
  重启 dev server → 对话还在，巴克记得我 ✅
```

**结论**：
```
没配 Storage → 内存存储（运行期有效，重启丢）
配 LibSQL    → 存到 mastra.db 文件（重启还在）
```

> ⚠️ **真实坑**：改配置（如 storage）后，热更新可能不彻底，要**完全重启** dev server 才生效。当时差点以为没配成功。

## 六、加 Observability：看到"时间都花在哪"

配了 Observability 后，从数据库读到了真实 trace 数据（3 次对话，44 条 span）：

```
对话 1（触发单位换算）总耗时 2110 ms：
  llm: deepseek             2012 ms  ← 大头！
  tool: unit_convert            2 ms
  memory: save                12 ms

对话 2（触发计算器）总耗时 2039 ms：llm 2029 ms，tool 1 ms
对话 3（普通对话）总耗时 1588 ms：llm 1580 ms
```

**核心洞察**：

> **每次对话耗时 99% 花在"等模型回复"，框架本身（工具/记忆/处理）开销可忽略。** 所以调优 Agent 的重点是模型和 prompt，不是框架。

trace 还揭示了 Agent 一次运行的真实流程：

```
agent run → 输入处理 → 记忆召回 → LLM 推理
→（可能）工具调用 → 再 LLM → 输出处理 → 保存记忆
```

## 七、数据库在哪（可能和你以为的不一样）

```
位置：src/mastra/public/mastra.db
⚠️ LibSQL 的 file:./mastra.db 是相对路径，
   相对于 bundle 运行目录，不是项目根目录！
```

关键表：`mastra_threads`（对话线程）、`mastra_messages`（消息）、`mastra_ai_spans`（观测）。

## 八、总结

```
从 0 写一个 Agent 需要理解的核心：
├── Agent = 人设 + 模型 + 工具
├── 工具 = 4 件套（description 决定 Agent 用不用）
├── Memory = 把对话历史喂给 Agent（按对话隔离）
├── Storage = 记忆存哪（内存 or 磁盘）
└── Observability = 看到时间花在哪（都在模型）
```

**一句话**：Mastra 帮你做"理解 + 决策 + 编排"这层，你只需要提供工具和提示词。

## 技术边界

**已确认**：多工具选择 / Agent 创造性 / 记忆隔离 / 持久化对照 / trace 耗时分布。

**待深入**：Agent loop 源码、Workflow 引擎、观察性记忆、真实天气 API 工具。

---

_作者：杜文龙 · 2026-07-31_
_标签：[mastra][aiagent][typescript]_
