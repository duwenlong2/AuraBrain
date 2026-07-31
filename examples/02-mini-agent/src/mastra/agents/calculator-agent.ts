/**
 * ============================================================
 * src/mastra/agents/calculator-agent.ts —— 计算器 Agent
 * ============================================================
 *
 * 极简 Agent：只有三个核心字段（instructions / model / tools）。
 * 对比 01-basic-agent 的官方模板（workspace/memory/signals...），
 * 这个就是"最小可运行的 Agent"。
 *
 * ★ 现在有 2 个工具了（calculator + unit_convert）：
 *   测试重点 —— Agent 怎么在"数学题"和"单位换算"之间做选择。
 */
import { Agent } from '@mastra/core/agent';          // Agent 类（Mastra 核心）
import { Memory } from '@mastra/memory';              // ★ 记忆系统（新增）
import { calculatorTool } from '../tools/calculator-tool';   // 计算器工具
import { unitConvertTool } from '../tools/unit-convert-tool'; // 单位换算工具（新增）

// 创建一个 Agent：带一个人设 + 一个大脑 + 多个工具
export const calculatorAgent = new Agent({
  // ① id：Agent 的唯一标识（注册/路由用）
  id: 'calculator-agent',

  // ② name：显示名字（Studio 里看到的名字）
  name: 'Calculator Assistant',

  // ③ instructions：系统提示词（告诉 Agent 它是谁、该怎么表现）
  instructions: `You are a math and unit conversion assistant. When the user asks a math question,
use the calculator tool. When the user asks about unit conversion, use the unit_convert tool.
Answer in Chinese.`,

  // ④ model：用哪个大模型（"提供商/模型名"格式，Mastra 自动路由）
  model: 'deepseek/deepseek-v4-flash',

  // ★ ⑤ memory：记忆系统（新增）
  // 加上后，Agent 就能记住对话历史，引用之前说过的话
  // 最小配置：generateTitle = 自动给对话生成标题（方便在 Studio 里区分）
  memory: new Memory({
    options: {
      generateTitle: true,
    },
  }),

  // ⑥ tools：挂载哪些工具（Agent 的"手脚"）
  tools: {
    calculator: calculatorTool,    // 工具1：计算器
    unit_convert: unitConvertTool, // 工具2：单位换算
  },
});
