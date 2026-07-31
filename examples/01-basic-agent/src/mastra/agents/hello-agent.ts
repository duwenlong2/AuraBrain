import { Agent } from '@mastra/core/agent';
import { weatherTool } from '../tools/weather-tool';

// 第一个自定义 Agent：天气查询助手
export const helloAgent = new Agent({
  name: 'Weather Assistant',
  description: 'A simple weather query assistant that can tell you about the weather.',
  instructions: `You are a friendly weather assistant. Help users check the weather for their city.
Be concise and helpful. If the user asks about weather, use the weather tool to get the information.`,
  model: 'openai/gpt-5.4',
  tools: {
    weather_query: weatherTool,
  },
});
