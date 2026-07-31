/**
 * ============================================================
 * src/mastra/tools/schedule-tools.ts —— 定时任务工具
 * ============================================================
 *
 * 让 Agent 能创建/暂停"定时任务"（用 cron 表达式）。
 * 例：Agent 可以设定"每天早上 9 点给我发天气"。
 *
 * 注意 execute 的第二个参数：{ mastra, agent }
 *   - mastra：Mastra 实例（能访问 schedules 等全局能力）
 *   - agent：当前调用这个工具的 Agent 的上下文（threadId/resourceId 等）
 * 这是 createTool 提供的执行上下文，某些工具需要它。
 */
import { createTool } from '@mastra/core/tools';   // Mastra 工具工厂函数
import { z } from 'zod';                            // 数据校验库

// 工具 1：创建定时任务
export const startScheduleTool = createTool({
  id: 'start_schedule',
  description: 'Start a recurring schedule for the default agent.',

  // 输入参数：cron 表达式 + 要执行的提示词
  inputSchema: z.object({
    schedule: z.string().describe('Cron expression for when to run.'),  // 例："0 9 * * *"（每天 9 点）
    prompt: z.string().describe('Prompt to run on the schedule.'),      // 定时执行的任务描述
  }),

  // ★ execute 第二个参数解构出 { mastra, agent }：执行上下文
  execute: async ({ schedule, prompt }, { mastra, agent }) => {
    // 定时任务必须绑定到某个对话线程（threadId）和资源（resourceId）
    if (!agent?.threadId || !agent.resourceId) {
      throw new Error('A threadId and resourceId are required to create a schedule.');
    }

    // 调用 Mastra 全局的 schedules 能力创建定时任务
    return mastra!.schedules.create({
      agentId: 'agent',        // 绑定到哪个 Agent
      cron: schedule,          // cron 表达式
      prompt,                  // 定时执行的任务
      threadId: agent.threadId,   // 对话线程
      resourceId: agent.resourceId, // 资源
    });
  },
});

// 工具 2：暂停定时任务
export const stopScheduleTool = createTool({
  id: 'stop_schedule',
  description: 'Stop a schedule by pausing it.',
  inputSchema: z.object({
    scheduleId: z.string().describe('Schedule id returned by start_schedule.'),  // 创建时返回的 ID
  }),
  // 用 mastra.schedules.pause() 暂停
  execute: async ({ scheduleId }, { mastra }) => mastra!.schedules.pause(scheduleId),
});
