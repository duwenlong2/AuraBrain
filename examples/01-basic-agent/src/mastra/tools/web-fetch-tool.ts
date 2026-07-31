/**
 * ============================================================
 * src/mastra/tools/web-fetch-tool.ts —— 网页抓取工具
 * ============================================================
 *
 * 用 fetch 抓取一个网页，返回文本内容。
 *
 * 这个工具是"通用 Agent"的杀手锏：
 * 它能抓任何网页 → Agent 自己决定"抓天气网站来查天气"
 * （实验：问通用 Agent 北京天气，它并行抓了 wttr.in 和 Open-Meteo）
 *
 * 注意：它不需要 API key，用的是 Node 内置的 fetch。
 */
import { createTool } from '@mastra/core/tools';   // Mastra 工具工厂函数
import { z } from 'zod';                            // 数据校验库

export const webFetchTool = createTool({
  id: 'web_fetch',
  // 描述：告诉 Agent 它能抓任意 URL 的网页并返回文本
  description: 'Fetch a web page by URL and return text content with basic response metadata.',

  // 输入参数：只要一个 url
  inputSchema: z.object({
    url: z.url().describe('The fully qualified URL to fetch.'),   // z.url() = 必须是合法 URL
  }),

  // 返回结构：网页内容 + 响应元信息
  outputSchema: z.object({
    url: z.string(),          // 最终请求的 URL（可能有重定向）
    status: z.number(),       // HTTP 状态码（200=成功）
    statusText: z.string(),   // 状态描述
    contentType: z.string().nullable(),  // 内容类型（text/html 等）
    text: z.string(),         // ★ 网页文本内容（截取前 10 万字符）
  }),

  // ★ 真正干活：用 fetch 抓网页
  execute: async ({ url }: { url: string }) => {
    const response = await fetch(url, {
      headers: {
        // 模拟浏览器 User-Agent（很多网站会拒绝无 UA 的请求）
        'user-agent': 'Mastra Workspace Agent/1.0',
        accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),   // 15 秒超时，防止一直挂着
    });
    const text = await response.text();      // 读取响应体为文本

    return {
      url: response.url,                     // 注意：用 response.url（可能是重定向后的）
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),  // 读响应头
      text: text.slice(0, 100_000),          // 只保留前 10 万字符（防止网页太大撑爆上下文）
    };
  },
});
