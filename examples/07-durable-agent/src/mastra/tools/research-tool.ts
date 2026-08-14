import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const researchTool = createTool({
  id: 'research-topic',
  description: '先请求用户批准，再执行一个需要时间的研究任务并返回阶段性研究结果。',
  inputSchema: z.object({
    topic: z.string().describe('要研究的主题'),
  }),
  resumeSchema: z.object({
    approved: z.boolean().describe('是否批准继续研究'),
  }),
  execute: async ({ topic }, context) => {
    const { suspend, resumeData } = context.agent ?? {};

    // 第一次调用只创建暂停点，不执行真正的研究。
    if (!resumeData) {
      return suspend?.({
        topic,
        message: `是否批准开始研究“${topic}”？`,
      });
    }

    if (resumeData.approved !== true) {
      throw new Error(`研究“${topic}”未获批准。`);
    }

    await new Promise(resolve => setTimeout(resolve, 2_000));

    return {
      topic,
      findings: [
        `${topic} 的基础资料已经收集。`,
        `${topic} 的关键结论已经整理。`,
      ],
      source: 'durable-agent-learning-fixture',
    };
  },
});
