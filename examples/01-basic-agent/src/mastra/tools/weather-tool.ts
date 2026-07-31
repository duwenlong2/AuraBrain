import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// 自定义工具：模拟天气查询
// 注意：这不是真实的天气 API，只是演示 createTool 的用法
export const weatherTool = createTool({
  id: 'weather_query',
  description: 'Get the current weather for a city. Use this when the user asks about weather.',
  inputSchema: z.object({
    city: z.string().describe('The city name, e.g. "Beijing", "Tokyo", "New York"'),
  }),
  outputSchema: z.object({
    city: z.string(),
    temperature: z.number(),
    condition: z.string(),
    humidity: z.number(),
  }),
  execute: async ({ city }) => {
    // 模拟天气数据（实际项目中应该调用真实 API）
    const weatherData: Record<string, { temp: number; condition: string; humidity: number }> = {
      beijing: { temp: 25, condition: 'Sunny', humidity: 45 },
      shanghai: { temp: 28, condition: 'Cloudy', humidity: 65 },
      tokyo: { temp: 22, condition: 'Rainy', humidity: 75 },
      'new york': { temp: 30, condition: 'Sunny', humidity: 55 },
      london: { temp: 18, condition: 'Overcast', humidity: 80 },
    };

    const key = city.toLowerCase();
    const data = weatherData[key];

    if (!data) {
      return {
        city,
        temperature: 0,
        condition: 'Unknown',
        humidity: 0,
      };
    }

    return {
      city,
      temperature: data.temp,
      condition: data.condition,
      humidity: data.humidity,
    };
  },
});
