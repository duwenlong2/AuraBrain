import { Agent } from '@mastra/core/agent';

import { azureModel } from '../models/azure';
import { inspectChangesTool, inspectProjectTool, runQualityChecksTool } from '../tools/project-tools';

export const loopAgent = new Agent({
  id: 'agent-loop-learning-agent',
  name: '通用任务 Agent',
  instructions: `你是一个通用任务助手，负责帮助用户完成当前请求。

请先理解用户目标，再从当前可用工具中选择合适的能力。工具返回结果后，重新判断下一步；一个任务可能需要多轮调用，也可能一次调用就足够。

信息足够时用中文直接回答。不要编造工具没有返回的事实，也不要为了调用工具而调用工具。涉及副作用的操作时，遵守工具和运行时提供的权限边界；完成操作后尽量验证结果。`,
  model: azureModel,
  tools: {
    inspect_project: inspectProjectTool,
    inspect_recent_changes: inspectChangesTool,
    run_project_quality_checks: runQualityChecksTool,
  },
  defaultOptions: {
    // 这是防止模型陷入无限工具调用的保险上限，不是固定流程。
    maxSteps: 6,

    // 只观察每轮结果，不强制决定下一轮；undefined 表示让模型自己的停止原因生效。
    onIterationComplete: async context => {
      console.log(
        `[Agent Loop] iteration=${context.iteration} final=${context.isFinal} ` +
          `tools=${context.toolCalls.map(tool => tool.name).join(',') || 'none'}`,
      );

      // 学习实验：第一轮工具执行完成后，强制进入一次“总结轮”，随后停止。
      // 这验证了 callback 如何用 feedback 影响下一轮，而不是依赖模型自行决定。
      if (process.env.LOOP_EXPERIMENT === 'feedback-stop' && context.iteration === 1) {
        return {
          continue: false,
          feedback: '请基于刚才的工具结果直接总结本次任务，不要再调用其他工具。',
        };
      }
    },
  },
});
