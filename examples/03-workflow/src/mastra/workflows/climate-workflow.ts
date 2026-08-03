/**
 * 一个最小 Workflow：根据温度决定设备动作。
 *
 * 输入温度 -> 校验 -> 判断冷热 -> 选择分支 -> 输出指令
 */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const validateStep = createStep({
  id: 'validate',
  inputSchema: z.object({ temperature: z.number() }),
  outputSchema: z.object({ temperature: z.number() }),
  execute: async ({ inputData }) => {
    if (inputData.temperature < -50 || inputData.temperature > 60) {
      throw new Error(`温度 ${inputData.temperature}°C 超出传感器量程 [-50, 60]`);
    }

    return inputData;
  },
});

const judgeTemperatureStep = createStep({
  id: 'judge-temperature',
  inputSchema: z.object({ temperature: z.number() }),
  outputSchema: z.object({
    temperature: z.number(),
    level: z.enum(['hot', 'mild', 'cold']),
  }),
  execute: async ({ inputData }) => {
    const { temperature } = inputData;
    let level: 'hot' | 'cold' | 'mild';

    if (temperature >= 26) {
      level = 'hot';
    } else if (temperature <= 20) {
      level = 'cold';
    } else {
      level = 'mild';
    }

    return { temperature, level };
  },
});

const coolDownStep = createStep({
  id: 'cool-down',
  inputSchema: z.object({
    temperature: z.number(),
    level: z.enum(['hot', 'cold', 'mild']),
  }),
  outputSchema: z.object({ command: z.string(), message: z.string() }),
  execute: async ({ inputData }) => ({
    command: 'AC_ON',
    message: `温度 ${inputData.temperature}°C 偏高，开启空调降温`,
  }),
});

const heatUpStep = createStep({
  id: 'heat-up',
  inputSchema: z.object({
    temperature: z.number(),
    level: z.enum(['hot', 'cold', 'mild']),
  }),
  outputSchema: z.object({ command: z.string(), message: z.string() }),
  execute: async ({ inputData }) => ({
    command: 'HEAT_ON',
    message: `温度 ${inputData.temperature}°C 偏低，开启暖气升温`,
  }),
});

const keepComfortableStep = createStep({
  id: 'keep-comfortable',
  inputSchema: z.object({
    temperature: z.number(),
    level: z.enum(['hot', 'cold', 'mild']),
  }),
  outputSchema: z.object({ command: z.string(), message: z.string() }),
  execute: async ({ inputData }) => ({
    command: 'IDLE',
    message: `温度 ${inputData.temperature}°C 舒适，保持现状`,
  }),
});

export const climateWorkflow = createWorkflow({
  // Workflow 的名字，Studio 会显示这个 ID
  id: 'climate-workflow',
  // 整个 Workflow 接收什么数据
  inputSchema: z.object({ temperature: z.number() }),
  // 整个 Workflow 最后输出什么数据
  outputSchema: z.object({ command: z.string(), message: z.string() }),
})
  // 第一步：检查温度是否合法
  .then(validateStep)
  // 第二步：把温度转换成 hot、cold 或 mild
  .then(judgeTemperatureStep)
  // 第三步：根据 level 选择一个动作
  .branch([
    [async ({ inputData }) => inputData.level === 'hot', coolDownStep],
    [async ({ inputData }) => inputData.level === 'cold', heatUpStep],
    [async ({ inputData }) => inputData.level === 'mild', keepComfortableStep],
  ])
  // 最后：确认流程定义完成，得到可运行的 Workflow 实例
  .commit();
