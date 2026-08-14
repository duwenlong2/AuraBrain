import { Agent } from '@mastra/core/agent';
import { createDurableAgent } from '@mastra/core/agent/durable';

import { azureModel } from '../models/azure';
import { researchTool } from '../tools/research-tool';

const baseAgent = new Agent({
  id: 'durable-learning-base-agent',
  name: 'Durable 学习基础 Agent',
  instructions: `你是一个研究助手。收到研究主题后，使用 research_topic 获取结果，再用中文总结。
如果工具请求批准，先暂停等待用户决定；批准后继续执行，拒绝后说明任务未执行。
不要编造工具没有返回的研究结论。`,
  model: azureModel,
  tools: {
    research_topic: researchTool,
  },
});

export const durableAgent = createDurableAgent({
  agent: baseAgent,
  id: 'durable-learning-agent',
  name: 'Durable 学习 Agent',
  maxSteps: 4,
});
