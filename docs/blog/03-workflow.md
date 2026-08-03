# 03 · 从 0 写一个极简 Workflow：顺序 / 并行 / 分支

> 前两篇把 Agent（柔性推理）玩明白了。这篇轮到 Mastra 双一等公民的另一半——**Workflow（确定性流程）**：步骤写死、顺序执行、相同输入必定相同输出。我从 0 手写了一个模拟"传感器读数 → 智能决策 → 硬件指令"的智能家居 Workflow，这篇记录顺序、并行、分支四种控制流是怎么用起来的。

## 关于 AuraBrain 开源项目

这是我的开源项目 [**AuraBrain**](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 云端 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（蓝牙/WiFi/MQTT 控制）   → ⚙️
    两者通过 MQTT 通信，从自然语言到真实硬件
```

**本文对应的代码**：`examples/03-workflow/`（从 0 手写的极简 Workflow 示例）

```
examples/03-workflow/
├── src/mastra/
│   ├── index.ts                  ← 入口：注册 Workflow
│   └── workflows/
│       └── climate-workflow.ts   ← 1 个 Workflow（7 个 step，4 种控制流）
└── README.md                     ← 完整学习笔记（4 个实验 + 速查表 + 术语）
```

这篇博客讲的每个知识点（顺序 / 并行 / 分支 / 数据整形 / schema 咬合），**在 examples 里都有可运行的代码 + README 实验记录**。想深入看代码、复现"三个温度三条指令"实验，去开源项目对应目录看。

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

一个最小可运行的 Mastra Workflow，**只要 2 个代码文件**：

```
src/mastra/
├── index.ts                ← 入口：new Mastra({ workflows: {...} })
└── workflows/xxx-workflow.ts  ← createWorkflow + 若干 createStep
```

**Workflow 的核心是"把 step 用控制流拼起来"**，四种控制流：

```
.then(step)      顺序     → 上一步做完做下一步
.parallel([a,b]) 并行     → 几个步骤同时做（输出按 id 分组）
.map(fn)         数据整形 → 把数据改成下一步要的形状
.branch([...])   分支     → 按条件只走一路
```

## 二、核心概念：Workflow vs Agent

这是这篇最关键的认知。前两篇的 Agent 是"柔性推理"：模型自己决定怎么做、怎么组合工具。而 **Workflow 是"确定性流程"**：

```
Agent    = 柔性推理：模型自己决定"怎么做"（开放问题、没固定套路）
Workflow = 确定性流程：步骤和顺序写死（固定套路、可预测的任务）
```

**什么时候用 Workflow**（官方口径）：任务一开始就很明确、步骤有固定执行顺序时。

| | Agent | Workflow |
|---|-------|----------|
| 决策者 | 大模型（自由发挥） | 代码（写死的步骤 + 条件） |
| 结果 | 每次可能不一样 | 相同输入 → 相同输出 |
| 适合 | 理解意图、对话、开放问题 | 数据处理、流水线、固定流程 |
| 可控性 | 低（靠提示词引导） | 高（每步都在代码里） |

> 它们**互补**，不是二选一。甚至可以在 Workflow 的 step 里调用 Agent——
> "确定性流程"里嵌一段"柔性推理"（后面做真实场景会用到）。

**step 长什么样**（和工具 Tool 很像，但输出会自动传给下一步）：

```typescript
createStep({
  id: 'validate',              // 唯一标识
  inputSchema: z.object({ temperature: z.number() }),
  outputSchema: z.object({ temperature: z.number() }),
  execute: async ({ inputData }) => {
    // 校验...
    return { temperature };    // 自动传给下一个 step
  },
});
```

## 三、实验 1：顺序执行 + 校验（.then）

流水线第一步通常是"校验/规整"，把非法输入挡在门口：

```typescript
const validateStep = createStep({
  id: 'validate',
  inputSchema: z.object({
    temperature: z.number().describe('传感器温度（°C）'),
    humidity: z.number().describe('传感器湿度（%）'),
  }),
  outputSchema: z.object({ temperature: z.number(), humidity: z.number() }),
  execute: async ({ inputData }) => {
    const { temperature, humidity } = inputData;
    if (temperature < -50 || temperature > 60) throw new Error('温度超出量程');
    if (humidity < 0 || humidity > 100) throw new Error('湿度超出量程');
    return { temperature, humidity };
  },
});
```

**故意输错验证**：填 `temperature: 999` → validate 抛错，Workflow 以 **failed** 结束，Studio 图里 validate 标红。✅ 校验拦截生效。

## 四、实验 2：并行执行（.parallel）

"同一份输入做多个独立分析"——温度判断和湿度判断互不依赖，同时跑：

```typescript
const tempJudgeStep = createStep({
  id: 'temp-judge',
  inputSchema: z.object({ temperature: z.number(), humidity: z.number() }),
  outputSchema: z.object({ verdict: z.enum(['hot', 'mild', 'cold']), value: z.number() }),
  execute: async ({ inputData }) => {
    const { temperature } = inputData;
    const verdict = temperature >= 26 ? 'hot' : temperature <= 20 ? 'cold' : 'mild';
    return { verdict, value: temperature };
  },
});

// humidity-judge 同理（dry / ok / humid）...
```

**关键点**：`.parallel()` 的输出**按 step 的 id 分组**：

```
{ 'temp-judge': { verdict: 'hot', value: 33 },
  'humidity-judge': { verdict: 'ok', value: 60 } }
```

下一个 step 要访问，就得用 id 当 key：`inputData['temp-judge'].verdict`。

## 五、实验 3：条件分支（.branch）

按温度档位走三路之一——高温开空调、低温开暖气、舒适保持现状：

```typescript
.branch([
  [async ({ inputData }) => inputData.tempVerdict === 'hot',  heatAlertStep],
  [async ({ inputData }) => inputData.tempVerdict === 'cold', coldAlertStep],
  [async () => true, comfortStep],   // 兜底：保证总有路可走
])
```

**实验结果（同一份流程，三个温度）**：

```
temperature 33 → { command: "AC_ON",   summary: "温度 33°C 偏高 → 开启空调降温" }
temperature 15 → { command: "HEAT_ON", summary: "温度 15°C 偏低 → 开启暖气升温" }
temperature 23 → { command: "IDLE",    summary: "温度 23°C 舒适 → 保持现状" }
```

三个分支 step 的 `inputSchema` / `outputSchema` **必须一致**（.branch() 硬性要求）。
分支之后的 step，输入是"实际执行的那个分支"的输出，所以要把所有可能的分支都声明成 `optional`：

```typescript
const reportStep = createStep({
  inputSchema: z.object({
    'heat-alert': z.object({ command: z.string(), action: z.string() }).optional(),
    'cold-alert': z.object({ command: z.string(), action: z.string() }).optional(),
    comfort:     z.object({ command: z.string(), action: z.string() }).optional(),
  }),
  execute: async ({ inputData }) => {
    const branch = inputData['heat-alert'] ?? inputData['cold-alert'] ?? inputData['comfort'];
    return { command: branch.command, summary: branch.action };
  },
});
```

## 六、实验 4：数据整形（.map）

并行输出是"按 id 分组的对象"，如果下一步只想用其中一部分，用 `.map()` 整形：

```typescript
.map(async ({ inputData }) => ({
  temperature: inputData['temp-judge'].value,
  tempVerdict: inputData['temp-judge'].verdict,
}))
```

把 `{ 'temp-judge': {...}, 'humidity-judge': {...} }` 整理成 `{ temperature, tempVerdict }`，正好喂给分支。**schema 更好咬合**。

## 七、串起来：完整 Workflow

```typescript
export const climateWorkflow = createWorkflow({
  id: 'climate-workflow',
  inputSchema:  z.object({ temperature: z.number(), humidity: z.number() }),
  outputSchema: z.object({ command: z.string(), summary: z.string() }),
})
  .then(validateStep)                              // ① 顺序：校验
  .parallel([tempJudgeStep, humidityJudgeStep])    // ② 并行：两个判断
  .map(...)                                        // ③ 整形：给分支用
  .branch([...])                                   // ④ 分支：按温度走一路
  .then(reportStep)                                // ⑤ 顺序：汇总指令
  .commit();                                       // ⑥ 收尾
```

> ⚠️ **schema 咬合原则**（写 Workflow 最容易踩的坑）：
> ```
> workflow.inputSchema == 第一步的 inputSchema
> 每步的 outputSchema  == 下一步的 inputSchema
> 最后一步的 outputSchema == workflow.outputSchema
> ```
> 对不上就类型报错；`.parallel()` / `.branch()` 之后尤其要小心。

## 八、在 Studio 里跑

```
npm run dev → http://localhost:4111 → Workflows 标签页 → climate-workflow
```

- 中间是**流程图**：所有 step 和连接线一目了然
- 右侧是**输入表单**：由 inputSchema 自动生成，填温度/湿度点运行
- 运行中每个 step 实时变色（running → success / failed）
- 真实运行结果里能看到 `steps` 里**只有走的那一路**（没有 cold-alert/comfort）——这就是"确定性"

## 九、总结

```
Workflow 的核心：
├── step = 最小工作单元（inputSchema / outputSchema / execute）
├── 四种控制流：顺序 .then() / 并行 .parallel() / 整形 .map() / 分支 .branch()
├── schema 咬合：每步的 output 必须能喂给下一步
└── 确定性：相同输入 → 相同输出（和 Agent 的柔性推理互补）
```

**一句话**：Agent 处理"开放问题"，Workflow 处理"固定流程"——Mastra 把两者都做成了一等公民，该用哪个用哪个。

## 技术边界

**已确认**：Workflow vs Agent 定位 / 四种控制流 / schema 咬合 / 并行输出按 id 分组 / 分支只走一路。

**待深入**：`.foreach()` 与并发控制、`.dountil()`/`.dowhile()` 循环、step 内调 Agent、suspend/resume 挂起恢复、Workflow 的持久化与错误重试（后续系列覆盖）。

---

_作者：杜文龙 · 2026-08-02_
_标签：[mastra][aiagent][workflow][typescript]_
