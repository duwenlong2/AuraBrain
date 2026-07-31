/**
 * ============================================================
 * src/mastra/agents/hello-agent.ts —— 天气助手 Agent
 * ============================================================
 *
 * 这是第一个"自定义 Agent"：从官方模板复制后改出来的。
 * 它和通用 Agent（agent.ts）的区别：
 *   - 只挂了一个工具：weather_query（天气查询）
 *   - instructions 改成了天气助手的人设
 *
 * 用它做对比实验最能理解"Agent = 提示词 + 工具集合"：
 *   同样问"北京天气"，通用 Agent 用 web_fetch 抓真实天气网站，
 *   而天气助手只用 weather_query（目前是模拟假数据）。
 */
import { Agent } from '@mastra/core/agent';       // Agent 类
import { weatherTool } from '../tools/weather-tool'; // 天气工具（我们自己写的）

// 第一个自定义 Agent：天气查询助手
export const helloAgent = new Agent({
  id: 'weather-assistant',          // ★ Agent 唯一标识（新版 Mastra 必填，路由/注册用）
  name: 'Weather Assistant',        // Agent 名字（Studio 里显示为 "Weather Assistant"）
  description: 'A simple weather query assistant that can tell you about the weather.',
  // 系统提示词：告诉 Agent 它是谁、该怎么表现
  instructions: `You are a friendly weather assistant. Help users check the weather for their city.
Be concise and helpful. If the user asks about weather, use the weather tool to get the information.`,
  // ★ 模型：和通用 Agent 一样用 DeepSeek V4 Flash
  model: 'deepseek/deepseek-v4-flash',
  // ★ 工具集合：只挂了一个 weather_query
  // （对比：通用 Agent 挂了 web_fetch/ask_user/定时任务等 4+ 个）
  tools: {
    weather_query: weatherTool,
  },
});
