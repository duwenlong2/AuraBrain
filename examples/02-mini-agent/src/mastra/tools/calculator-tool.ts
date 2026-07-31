/**
 * ============================================================
 * src/mastra/tools/calculator-tool.ts —— 计算器工具
 * ============================================================
 *
 * 这是我们写的第一个极简工具：
 * 让 Agent 能做加减乘除，并且算得比它自己"心算"更准。
 */
import { createTool } from '@mastra/core/tools';   // Mastra 的工具工厂函数
import { z } from 'zod';                            // 数据校验库

// 创建一个工具，固定四个部分：id / description / inputSchema / execute
export const calculatorTool = createTool({
  // ① id：工具的唯一名字（Agent 内部调用时用）
  id: 'calculator',

  // ② description：写给 Agent 看的说明（Agent 靠它决定用不用这个工具）
  description: 'Calculate the result of two numbers. Use this when the user asks a math question.',

  // ③ inputSchema：输入结构定义（Agent 必须按这个格式传参）
  inputSchema: z.object({
    a: z.number(),                          // 第一个数字
    b: z.number(),                          // 第二个数字
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']), // 运算类型（限死四种）
  }),

  // ④ execute：真正干活的函数（Agent 调用时执行这里）
  execute: async ({ a, b, operation }) => {
    // 根据 operation 做对应的运算
    switch (operation) {
      case 'add':      return { result: a + b };
      case 'subtract': return { result: a - b };
      case 'multiply': return { result: a * b };
      case 'divide':   return { result: b === 0 ? 0 : a / b };  // 除 0 返回 0（简单防错）
      default:         return { result: 0 };
    }
  },
});
