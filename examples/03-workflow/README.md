# 03-workflow

Mastra **Workflow 极简示例**：1 个 Workflow，4 种控制流（顺序 / 并行 / 分支 / 数据整形）。

> 对比 `01-basic-agent`（官方模板）和 `02-mini-agent`（极简 Agent）：
> 前两篇玩的是 **Agent**（柔性推理：模型自己决定怎么做）；
> 这篇玩 **Workflow**（确定性流程：步骤写死，按顺序执行）。
>
> 场景模拟 AuraBrain 愿景里"传感器读数 → 智能决策 → 硬件指令"的决策环节：
> 输入温度/湿度，输出一条设备指令（`AC_ON` / `HEAT_ON` / `IDLE`）。
> 未来这些指令通过 MQTT 下发给 ESP32（后续系列）。

## 快速开始

```shell
npm install
npm run dev            # 打开 http://localhost:4111
# Studio → Workflows 标签页 → climate-workflow
# 右侧输入表单填 temperature / humidity → 点运行
```

> 本示例是确定性流程，**不需要 API Key**（.env 留着是为保持一致）。

## 目录结构

```
03-workflow/
├── package.json                  ← 依赖 + 脚本
├── tsconfig.json                 ← TS 配置
├── .env.example / .env           ← 本示例用不到 key（一致性保留）
└── src/mastra/
    ├── index.ts                  ← 入口：注册 Workflow
    └── workflows/
        └── climate-workflow.ts   ← 1 个 Workflow（7 个 step）
```

**只有 2 个代码文件**。这就是最小可运行的 Mastra Workflow 应用。

---

# 学习笔记

## 核心概念

### Workflow vs Agent（这篇最关键的教学点）

```
Agent    = 柔性推理：模型自己决定"怎么做"（适合开放问题、没固定套路）
Workflow = 确定性流程：步骤和顺序写死（适合固定套路、可预测的任务）
```

什么时候用哪个（官方口径）：**任务一开始就很明确、步骤有固定执行顺序 → 用 Workflow**。

| | Agent | Workflow |
|---|-------|----------|
| 决策者 | 大模型（自由发挥） | 代码（写死的 if/else + 步骤） |
| 结果 | 每次可能不一样 | 相同输入 → 相同输出 |
| 适合 | 开放问题（理解意图、对话） | 固定流程（数据处理、流水线） |
| 可控性 | 低（靠提示词引导） | 高（每步都在代码里） |

> 它们不是二选一，而是**互补**：Mastra 里 Agent 和 Workflow 都是一等公民，
> 甚至可以在 Workflow 的 step 里调用 Agent（见"延伸"）。

### step = 一个"最小工作单元"

```
createStep({
  id,               // 唯一标识（并行/分支输出按它分组）
  inputSchema,      // 输入结构（zod）
  outputSchema,     // 输出结构（zod）
  execute,          // 真正干活：async ({ inputData }) => 输出
})
```

和工具（Tool）很像，但区别在于：**step 的输出会自动传给下一个 step**，
由框架把每个 step 串起来——你不用自己写"把 A 的结果传给 B"的胶水代码。

### Workflow = 把 step 用控制流拼起来

```
createWorkflow({ id, inputSchema, outputSchema })
  .then(...)          // 顺序
  .parallel([...])    // 并行
  .map(...)           // 数据整形
  .branch([...])      // 条件分支
  .commit();          // 收尾（必须）
```

## 控制流速查表

| 方法 | 作用 | 输入 | 输出 |
|------|------|------|------|
| `.then(step)` | 顺序执行 | 上一步输出 | 本步输出 |
| `.parallel([a,b])` | 同时执行 | 同输入 | `{ a: 输出, b: 输出 }`（按 id 分组） |
| `.map(fn)` | 数据整形 | 上一步输出 | 你重组的任意结构 |
| `.branch([[条件, step],...])` | 条件分支 | 上一步输出 | 只走一路，输出按该 step id 分组 |
| `.foreach(step)` | 数组逐项处理 | `T[]` | `U[]` |
| `.dountil(step, 条件)` / `.dowhile(step, 条件)` | 循环 | 上一步输出 | 循环到条件满足/不满足 |

> **schema 咬合原则**（写 Workflow 最容易踩的坑）：
> ```
> workflow.inputSchema == 第一步的 inputSchema
> 每步的 outputSchema  == 下一步的 inputSchema
> 最后一步的 outputSchema == workflow.outputSchema
> ```
> 对不上，类型会报错；`.parallel()` / `.branch()` 之后尤其要小心。

## 实验记录

### 实验 1：顺序执行 + 校验（validate step）

在 Studio 填 `temperature: 33, humidity: 60` 运行。

```
validate → 校验通过 → 往下走
```

**故意输错**：填 `temperature: 999` 再跑 → validate 抛错，Workflow 以 **failed** 结束，
图里 validate 显示红色，日志里有错误信息。✅ 校验拦截生效。

**教学点**：流水线的第一步通常是"校验/规整"，把非法输入挡在门口，
别让脏数据流到后面的步骤。

### 实验 2：并行执行（temp-judge ∥ humidity-judge）

图里能看到 `temp-judge` 和 `humidity-judge` **同时**变成 running。
两个判断互不等待，一起跑完才进入下一步。

```
输入 { temperature: 33, humidity: 60 }
→ temp-judge:     { verdict: "hot",  value: 33 }
→ humidity-judge: { verdict: "ok",   value: 60 }
```

**教学点**：`.parallel()` 适合"同一份输入做多个独立分析"（风扇散热）。
并行输出按 **step 的 id** 分组：`{ 'temp-judge': {...}, 'humidity-judge': {...} }`。

### 实验 3：分支（按温度走三路之一）

| 输入 temperature | 走的路径 | 输出 command |
|------------------|---------|-------------|
| 33（≥26） | hot → heat-alert | `AC_ON` |
| 15（≤20） | cold → cold-alert | `HEAT_ON` |
| 23（中间） | 兜底 → comfort | `IDLE` |

同一份输入跑三次，分别得到三条不同指令：
```
temperature 33 → { command: "AC_ON",   summary: "温度 33°C 偏高 → 开启空调降温" }
temperature 15 → { command: "HEAT_ON", summary: "温度 15°C 偏低 → 开启暖气升温" }
temperature 23 → { command: "IDLE",    summary: "温度 23°C 舒适 → 保持现状" }
```

**教学点**：
1. **分支只走一路**：条件按顺序判断，第一个为 `true` 的执行，其余跳过。
2. **三个分支 step 的 inputSchema/outputSchema 必须一致**（这是 .branch() 的硬性要求）。
3. **分支之后的下一个 step**：输入是"实际执行的那个分支"的输出，
   所以要把所有可能的分支都声明成 `optional`（本例 report 的写法）。
4. 为什么有个兜底 `[() => true, comfortStep]`？保证无论如何都有一条路可走，
   避免"所有条件都不满足 → 没分支可走"的尴尬。

### 实验 4：数据整形（map）

图里能看到 `map` 步骤把并行的两路输出整理成一条：
```
{ 'temp-judge': { verdict, value }, 'humidity-judge': {...} }
  → map →
{ temperature: 33, tempVerdict: 'hot' }
```

**教学点**：并行输出是"按 id 分组的对象"，如果下一步只想用其中一部分、
或想换个字段名，就用 `.map()` 整形一下——比硬塞给下一步省心，schema 也更好咬合。

### 实验结果（真实运行记录）

用温度 33 / 湿度 60 运行，最终输出：
```
{
  "status": "success",
  "input":  { "temperature": 33, "humidity": 60 },
  "steps": {
    "validate":      { "status": "success", "output": { "temperature": 33, "humidity": 60 } },
    "temp-judge":    { "status": "success", "output": { "verdict": "hot", "value": 33 } },
    "humidity-judge":{ "status": "success", "output": { "verdict": "ok", "value": 60 } },
    "heat-alert":    { "status": "success", "output": { "command": "AC_ON", "action": "..." } },
    "report":        { "status": "success", "output": { "command": "AC_ON", "summary": "..." } }
  },
  "result": { "command": "AC_ON", "summary": "温度 33°C 偏高 → 开启空调降温" }
}
```

> 注意 `steps` 里**没有** cold-alert / comfort——因为分支只走了 heat-alert 一路。
> 这就是"确定性的流程"：输入定了，路径就定了。

## Studio 里怎么看

1. 打开 http://localhost:4111 → **Workflows** 标签页
2. 选 `climate-workflow`：中间是**流程图**（可视化所有 step 和连接线）
3. 右侧输入表单（由 inputSchema 自动生成）填温度/湿度 → 点运行
4. 运行中：图里每个 step 实时变色（running → success / failed）
5. 左侧边栏：输入、输出、每一步的 state 和日志

## 延伸（本示例没写，留给你试）

- **foreach**：同一份处理作用在数组每个元素上（如批量处理多个传感器）。
  ```typescript
  createWorkflow({ inputSchema: z.array(z.object({ value: z.number() })), ... })
    .foreach(someStep, { concurrency: 4 })  // 默认顺序，concurrency 控制并发
    .then(aggregateStep)                     // 拿到数组做聚合
    .commit()
  ```
- **dountil / dowhile**：把某步循环到条件满足为止。
- **在 step 里调 Agent**：`const agent = mastra?.getAgent('xxx')` → `agent.stream(...)`，
  让"确定性流程"里嵌一段"柔性推理"（后面做真实场景会用到）。

## 术语对照（英文 → 直观理解）

| 术语 | 中文 | 直观理解 |
|------|------|---------|
| Workflow | 工作流 | 写死的流程，一步步执行 |
| Step | 步骤 | 流程里的一个最小工作单元 |
| Control flow | 控制流 | 决定步骤怎么走（顺序/并行/分支/循环） |
| `.then()` | 顺序 | 上一步做完再做下一步 |
| `.parallel()` | 并行 | 几个步骤同时做 |
| `.branch()` | 分支 | 按条件选一条路走 |
| `.map()` | 整形 | 把数据改成下一步要的形状 |
| `.commit()` | 收尾 | 宣告 Workflow 定义完成 |
| inputSchema / outputSchema | 输入/输出结构 | 每步"吃进什么、吐出什么"的契约 |
| Trigger data | 触发数据 | 整个 Workflow 的初始输入 |

---

_最后更新：2026-08-02_
