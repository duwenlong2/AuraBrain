// ============================================================
//  AuraBrain Runtime · 邮件 tools（只读）
//  两条路线并列：
//   - graph_*  路线 A：Microsoft Graph（新版 Outlook 底层，推荐）
//   - imap_*   路线 B：IMAP（移植 OpenClaw skill，备胎）
// ============================================================
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import {
  getRecentEmails as graphGetRecentEmails,
  getEmailById as graphGetEmailById,
  testConnection as graphTest,
  getMe as graphGetMe,
} from '../lib/graph.ts'
import {
  checkRecentEmails as imapCheckRecent,
  fetchEmail as imapFetch,
  testConnection as imapTest,
  listMailboxes as imapListMailboxes,
} from '../lib/imap.ts'

// ---------- 路线 A：Graph ----------

export const graphTestTool = createTool({
  id: 'graph-test-connection',
  description: '测试 Microsoft Graph 连接（新版 Outlook 路线）。返回当前登录用户或失败原因。',
  inputSchema: z.object({}),
  execute: async () => graphTest(),
})

export const graphRecentEmailsTool = createTool({
  id: 'graph-recent-emails',
  description: '通过 Microsoft Graph 读取收件箱最近 N 封邮件（只读，默认 10 封，倒序）。',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('返回数量，默认 10'),
  }),
  execute: async ({ limit }) => graphGetRecentEmails(limit ?? 10),
})

export const graphGetEmailTool = createTool({
  id: 'graph-get-email',
  description: '通过 Microsoft Graph 按 id 获取单封邮件全文。',
  inputSchema: z.object({
    id: z.string().describe('邮件 id（来自 graph-recent-emails 的 id 字段）'),
  }),
  execute: async ({ id }) => graphGetEmailById(id),
})

// ---------- 路线 B：IMAP ----------

export const imapTestTool = createTool({
  id: 'imap-test-connection',
  description: '测试 IMAP 连接（OpenClaw skill 路线）。返回 INBOX 邮件数或失败原因。',
  inputSchema: z.object({}),
  execute: async () => imapTest(),
})

export const imapMailboxesTool = createTool({
  id: 'imap-list-mailboxes',
  description: '列出 IMAP 邮箱中所有文件夹（收件箱/已发送/归档等）。',
  inputSchema: z.object({}),
  execute: async () => ({ mailboxes: await imapListMailboxes() }),
})

export const imapRecentEmailsTool = createTool({
  id: 'imap-recent-emails',
  description: '通过 IMAP 读取收件箱最近 N 封邮件（只读，默认 10 封，倒序）。',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('返回数量，默认 10'),
    unseenOnly: z.boolean().optional().describe('仅未读邮件'),
  }),
  execute: async ({ limit, unseenOnly }) => imapCheckRecent(limit ?? 10, unseenOnly ?? false),
})

export const imapGetEmailTool = createTool({
  id: 'imap-get-email',
  description: '通过 IMAP 按 UID 获取单封邮件全文。',
  inputSchema: z.object({
    uid: z.number().int().describe('邮件 UID（来自 imap-recent-emails 的 uid 字段）'),
  }),
  execute: async ({ uid }) => imapFetch(uid),
})

export const allMailTools = {
  graphTestTool,
  graphRecentEmailsTool,
  graphGetEmailTool,
  imapTestTool,
  imapMailboxesTool,
  imapRecentEmailsTool,
  imapGetEmailTool,
}
