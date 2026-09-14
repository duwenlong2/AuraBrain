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
import { shutdownDefaultAgent } from './agent/default-agent.ts'
import { disconnectAllMcp } from './mcp/registry.ts'

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

// ---------- 优雅关闭（dev 模式 Ctrl+C / SIGTERM） ----------
// 关闭浏览器（Chromium）并断开 MCP 连接。
// 注意：Windows 下 `brain stop` 是硬杀（taskkill /T /F），不走这里，
// 孤儿 Chromium 进程由 CLI 端（bin/aurabrain.mjs）的 taskkill 兜底清理。
let shuttingDown = false
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[AuraBrain] 收到 ${signal}，正在关闭浏览器与 MCP 连接…`)
  try {
    await Promise.allSettled([shutdownDefaultAgent(), disconnectAllMcp()])
  } finally {
    setTimeout(() => process.exit(0), 300).unref()
  }
}
process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
