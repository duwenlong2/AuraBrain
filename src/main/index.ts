// ============================================================
//  AuraBrain Runtime 入口
//  M1（当前里程碑）：只读接入 Outlook 邮件 + 日历。
//  - 注册邮件/日历 tools（两条路线：Graph + IMAP）
//  - 注册自定义 API 路由（测试页 + 设备码登录 + tool 直调）
//  后续 M2 再挂 mail-agent / calendar-agent（自然语言摘要、任务识别）。
// ============================================================
import { Mastra } from '@mastra/core'
import { runtimeAgent } from '../mastra/agents/runtime-agent.ts'
import { allMailTools } from './tools/mail-tools.ts'
import { allCalendarTools } from './tools/calendar-tools.ts'
import { allOutlookTools } from './tools/outlook-tools.ts'
import { apiRoutes } from './routes.ts'

export const mastra = new Mastra({
  agents: {
    runtimeAgent,
  },
  // 全局注册 tools：既供 Agent 挂载，也供 /test-api/run 直调
  tools: {
    ...allMailTools,
    ...allCalendarTools,
    ...allOutlookTools,
  },
  server: {
    port: Number(process.env.AURABRAIN_PORT || 49000),
    host: process.env.AURABRAIN_HOST || '127.0.0.1',
    // 测试页需要长一点的超时（设备码登录 / IMAP 连接可能慢）
    timeout: 120_000,
    build: {
      openAPIDocs: true,
      swaggerUI: true,
      apiReqLogs: true,
    },
    apiRoutes,
  },
})
