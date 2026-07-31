/**
 * ============================================================
 * src/mastra/tools/weather-tool.ts —— 天气工具（createTool 示例）
 * ============================================================
 *
 * 这是一个"模拟"天气查询工具，用来演示 createTool 的完整结构。
 *
 * ⚠️ 已知问题（在 Studio 实验中发现）：
 *   1. 数据是硬编码的假数据（不是真实天气）
 *   2. 只支持 5 个城市（beijing/shanghai/tokyo/new york/london）
 *   3. 只认"精确小写英文城市名"——Agent 传参稍微不同就匹配失败
 *      （实测问"东京天气"返回 0°C/Unknown，就是传参失配走了空分支）
 *
 * 下一步：改造这个工具，用 Open-Meteo 真实 API（免费不用 key）
 */
import { createTool } from '@mastra/core/tools';   // Mastra 的工具工厂函数
import { z } from 'zod';                            // 数据校验库（定义参数和返回类型）

// 自定义工具：模拟天气查询
// 注意：这不是真实的天气 API，只是演示 createTool 的用法
export const weatherTool = createTool({
  // 工具的唯一标识（Agent 调用时用的名字）
  id: 'weather_query',

  // ★ 写给 Agent（AI）看的描述：Agent 靠它判断"这个请求要不要用这个工具"
  description: 'Get the current weather for a city. Use this when the user asks about weather.',

  // 输入参数定义：Agent 必须按这个结构传参，否则校验失败
  inputSchema: z.object({
    city: z.string().describe('The city name, e.g. "Beijing", "Tokyo", "New York"'),
  }),

  // 返回结构定义：工具输出的数据形状
  outputSchema: z.object({
    city: z.string(),          // 城市名
    temperature: z.number(),   // 温度
    condition: z.string(),     // 天气状况
    humidity: z.number(),      // 湿度
  }),

  // ★ 真正干活的函数：Agent 调用工具时执行这里
  execute: async ({ city }) => {
    // 硬编码的模拟天气数据（实际项目应调用真实天气 API）
    const weatherData: Record<string, { temp: number; condition: string; humidity: number }> = {
      beijing: { temp: 25, condition: 'Sunny', humidity: 45 },
      shanghai: { temp: 28, condition: 'Cloudy', humidity: 65 },
      tokyo: { temp: 22, condition: 'Rainy', humidity: 75 },
      'new york': { temp: 30, condition: 'Sunny', humidity: 55 },
      london: { temp: 18, condition: 'Overcast', humidity: 80 },
    };

    // ⚠️ 关键坑：Agent 传的 city 不可控，可能带空格/大小写/后缀，
    // 这里只用 toLowerCase() 精确匹配，很容易失败
    const key = city.toLowerCase();
    const data = weatherData[key];

    // 匹配不到就返回空数据（实验里"东京"返回 0/Unknown 就是这个分支）
    if (!data) {
      return {
        city,
        temperature: 0,
        condition: 'Unknown',
        humidity: 0,
      };
    }

    // 匹配到就返回硬编码数据
    return {
      city,
      temperature: data.temp,
      condition: data.condition,
      humidity: data.humidity,
    };
  },
});
