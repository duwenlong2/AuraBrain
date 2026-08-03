/**
 * ============================================================
 * src/mastra/workflows/climate-workflow.ts —— 智能家居决策 Workflow
 * ============================================================
 *
 * 这是系列的第三个知识点：Workflow（工作流）。
 * 前两篇玩的是 Agent（柔性推理：模型自己决定怎么做）；
 * 这次玩 Workflow（确定性流程：步骤写死，按顺序执行）。
 *
 * 场景：模拟 AuraBrain 愿景里"传感器读数 → 智能决策 → 硬件指令"的
 *       第一步——只做"决策"，不做真实硬件（MQTT 留给后续）。
 *
 * 教学点：一个 Workflow 里用全 4 种控制流：
 *   .then()      顺序执行（validate → 按顺序走）
 *   .parallel()  并行执行（温度判断 ∥ 湿度判断，互不等待）
 *   .map()       数据整形（把并行的输出整理给分支用）
 *   .branch()    条件分支（按温度高低走三路之一）
 *
 * 数据流：
 *   { temperature, humidity }  (输入：传感器读数)
 *     → validate    顺序：校验量程，非法直接报错
 *     → [temp-judge ∥ humidity-judge]  并行：两个独立判断
 *     → map         整形：把并行结果合并成 { temperature, tempVerdict }
 *     → branch      分支：hot → AC_ON / cold → HEAT_ON / 舒适 → IDLE
 *     → report      顺序：汇总成最终设备指令
 *   { command, summary }       (输出：硬件指令 + 说明)
 */
import { createStep, createWorkflow } from '@mastra/core/workflows'; // ★ 新版 Workflow API
import { z } from 'zod';                                             // 数据校验库

/* =================================================================
 * 步骤 1：validate —— 校验并规整输入（演示 .then() 顺序执行）
 * =================================================================
 * 职责：先拦住非法输入（温度/湿度超出传感器量程就报错），
 *       通过的才继续往下走。这是流水线里最常见的"第一步"。
 */
const validateStep = createStep({
  id: 'validate',
  inputSchema: z.object({
    temperature: z.number().describe('传感器温度（°C）'),
    humidity: z.number().describe('传感器湿度（%）'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    humidity: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { temperature, humidity } = inputData;
    // 校验量程：不在合理范围直接抛错（Workflow 会以 failed 结束）
    if (temperature < -50 || temperature > 60) {
      throw new Error(`温度 ${temperature}°C 超出传感器量程 [-50, 60]`);
    }
    if (humidity < 0 || humidity > 100) {
      throw new Error(`湿度 ${humidity}% 超出传感器量程 [0, 100]`);
    }
    return { temperature, humidity }; // 校验通过，原样往下传
  },
});

/* =================================================================
 * 步骤 2A：temp-judge —— 温度判断（并行分支之一）
 * =================================================================
 * 职责：把温度归类成 hot / mild / cold 三档，供后面分支使用。
 * 注意：它和 humidity-judge 同时运行，互不等待。
 */
const tempJudgeStep = createStep({
  id: 'temp-judge',
  inputSchema: z.object({
    temperature: z.number(),
    humidity: z.number(),
  }),
  outputSchema: z.object({
    verdict: z.enum(['hot', 'mild', 'cold']), // 判定结果
    value: z.number(),                        // 原始值（留作参考）
  }),
  execute: async ({ inputData }) => {
    const { temperature } = inputData;
    const verdict = temperature >= 26 ? 'hot' : temperature <= 20 ? 'cold' : 'mild';
    return { verdict, value: temperature };
  },
});

/* =================================================================
 * 步骤 2B：humidity-judge —— 湿度判断（并行分支之二）
 * =================================================================
 * 职责：把湿度归类成 dry / ok / humid 三档。
 * 和 temp-judge 是"同输入、不同处理"，正好演示 .parallel()。
 */
const humidityJudgeStep = createStep({
  id: 'humidity-judge',
  inputSchema: z.object({
    temperature: z.number(),
    humidity: z.number(),
  }),
  outputSchema: z.object({
    verdict: z.enum(['dry', 'ok', 'humid']),
    value: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { humidity } = inputData;
    const verdict = humidity >= 70 ? 'humid' : humidity <= 30 ? 'dry' : 'ok';
    return { verdict, value: humidity };
  },
});

/* =================================================================
 * 步骤 3A：heat-alert —— 高温分支 → 降温指令
 * =================================================================
 * 下面三个分支步骤（heat/cold/comfort）的 inputSchema / outputSchema
 * 必须一致，因为 .branch() 要求所有分支 schema 相同。
 */
const heatAlertStep = createStep({
  id: 'heat-alert',
  inputSchema: z.object({
    temperature: z.number(),
    tempVerdict: z.enum(['hot', 'mild', 'cold']),
  }),
  outputSchema: z.object({
    command: z.string(), // 给硬件的指令（未来走 MQTT 下发）
    action: z.string(),  // 人类可读的说明
  }),
  execute: async ({ inputData }) => ({
    command: 'AC_ON',
    action: `温度 ${inputData.temperature}°C 偏高 → 开启空调降温`,
  }),
});

/* =================================================================
 * 步骤 3B：cold-alert —— 低温分支 → 升温指令
 * =================================================================
 */
const coldAlertStep = createStep({
  id: 'cold-alert',
  inputSchema: z.object({
    temperature: z.number(),
    tempVerdict: z.enum(['hot', 'mild', 'cold']),
  }),
  outputSchema: z.object({
    command: z.string(),
    action: z.string(),
  }),
  execute: async ({ inputData }) => ({
    command: 'HEAT_ON',
    action: `温度 ${inputData.temperature}°C 偏低 → 开启暖气升温`,
  }),
});

/* =================================================================
 * 步骤 3C：comfort —— 舒适分支 → 无动作
 * =================================================================
 */
const comfortStep = createStep({
  id: 'comfort',
  inputSchema: z.object({
    temperature: z.number(),
    tempVerdict: z.enum(['hot', 'mild', 'cold']),
  }),
  outputSchema: z.object({
    command: z.string(),
    action: z.string(),
  }),
  execute: async ({ inputData }) => ({
    command: 'IDLE',
    action: `温度 ${inputData.temperature}°C 舒适 → 保持现状`,
  }),
});

/* =================================================================
 * 步骤 4：report —— 汇总输出（顺序步骤）
 * =================================================================
 * 它接在 .branch() 后面，输入是"实际执行的那个分支"的输出。
 * 所以三个分支的结果都要声明成 optional，谁跑了就用谁。
 */
const reportStep = createStep({
  id: 'report',
  inputSchema: z.object({
    'heat-alert': z.object({ command: z.string(), action: z.string() }).optional(),
    'cold-alert': z.object({ command: z.string(), action: z.string() }).optional(),
    comfort: z.object({ command: z.string(), action: z.string() }).optional(),
  }),
  outputSchema: z.object({
    command: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    // 三个分支里实际执行的那个（其他是 undefined）
    const branch = inputData['heat-alert'] ?? inputData['cold-alert'] ?? inputData['comfort'];
    return { command: branch.command, summary: branch.action };
  },
});

/* =================================================================
 * 组装：把上面 7 个步骤拼成一个 Workflow
 * =================================================================
 * 执行顺序：
 *   validate
 *     → [temp-judge ∥ humidity-judge]   （并行，一起跑）
 *     → map 整形
 *     → branch（只走一路）
 *     → report
 *
 * 注意 schema 的"咬合"：
 *   - workflow.inputSchema == 第一步的 inputSchema
 *   - 每一步的 outputSchema == 下一步的 inputSchema
 *   - 最后一步的 outputSchema == workflow.outputSchema
 */
export const climateWorkflow = createWorkflow({
  id: 'climate-workflow',
  inputSchema: z.object({
    temperature: z.number(),
    humidity: z.number(),
  }),
  outputSchema: z.object({
    command: z.string(),
    summary: z.string(),
  }),
})
  // ① 顺序：先校验
  .then(validateStep)
  // ② 并行：温度判断 和 湿度判断 同时跑（输出按 step id 分组）
  .parallel([tempJudgeStep, humidityJudgeStep])
  // ③ 整形：并行的输出是 { 'temp-judge': {...}, 'humidity-judge': {...} }，
  //         分支只关心温度，这里把它整理成 { temperature, tempVerdict }
  .map(async ({ inputData }) => ({
    temperature: inputData['temp-judge'].value,
    tempVerdict: inputData['temp-judge'].verdict,
  }))
  // ④ 分支：按温度档位走三路之一（条件按顺序判断，第一个为 true 的执行）
  .branch([
    [async ({ inputData }) => inputData.tempVerdict === 'hot', heatAlertStep],
    [async ({ inputData }) => inputData.tempVerdict === 'cold', coldAlertStep],
    [async () => true, comfortStep], // 兜底：其余情况走舒适分支
  ])
  // ⑤ 顺序：汇总成最终指令
  .then(reportStep)
  // ⑥ 收尾：提交，Workflow 才算定义完成
  .commit();
