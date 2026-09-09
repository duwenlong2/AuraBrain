// ============================================================
//  AuraBrain Runtime · 本机 MAPI 直读 tools（路线 C）
//  读取本机已同步的 OST 数据，无需网络/登录/IT 授权。
// ============================================================
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  outlookTest,
  outlookRecentEmails,
  outlookGetEmail,
  outlookEvents,
} from '../lib/outlook.ts'

export const outlookTestTool = createTool({
  id: 'outlook-test-connection',
  description: '测试本机 Outlook MAPI 直读连接（路线 C）。返回 profile 名、收件箱邮件数、Outlook 版本。',
  inputSchema: z.object({}),
  execute: async () => outlookTest(),
})

export const outlookRecentEmailsTool = createTool({
  id: 'outlook-recent-emails',
  description: '通过本机 MAPI 读取最近 N 天收件箱邮件（只读，默认最近 7 天 10 封，倒序，含正文）。',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('返回数量，默认 10'),
    days: z.number().int().min(1).max(30).optional().describe('回溯天数，默认 7'),
  }),
  execute: async ({ limit, days }) => outlookRecentEmails(limit ?? 10, days ?? 7),
})

export const outlookGetEmailTool = createTool({
  id: 'outlook-get-email',
  description: '通过本机 MAPI 按 entryId 获取单封邮件全文。',
  inputSchema: z.object({
    entryId: z.string().describe('邮件 entryId（来自 outlook-recent-emails 的 entryId 字段）'),
  }),
  execute: async ({ entryId }) => outlookGetEmail(entryId),
})

export const outlookEventsTool = createTool({
  id: 'outlook-get-events',
  description: '通过本机 MAPI 读取未来 N 天的日历日程（只读，默认 7 天，含开始/结束/地点/组织者/在线会议链接）。',
  inputSchema: z.object({
    days: z.number().int().min(1).max(30).optional().describe('向前看几天，默认 7'),
  }),
  execute: async ({ days }) => outlookEvents(days ?? 7),
})

export const allOutlookTools = {
  outlookTestTool,
  outlookRecentEmailsTool,
  outlookGetEmailTool,
  outlookEventsTool,
}
