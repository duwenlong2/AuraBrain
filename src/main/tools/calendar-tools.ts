// ============================================================
//  AuraBrain Runtime · 日历 tools（只读）
//  当前走 Graph（路线 A）。IMAP 不覆盖日历，若 IMAP 路线胜出，
//  日历仍需 Graph 或 EWS —— 这里先固定用 Graph。
// ============================================================
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getEvents as graphGetEvents } from '../lib/graph.ts'

function toISO(d: Date): string {
  // Graph calendarView 要求 local 时间不带时区后缀
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}

export const graphEventsTool = createTool({
  id: 'graph-get-events',
  description:
    '通过 Microsoft Graph 读取日历日程。给定时区本地时间的 start/end（格式 YYYY-MM-DDTHH:mm:ss），返回区间内全部日程（含开始/结束/地点/组织者/在线会议链接）。',
  inputSchema: z.object({
    start: z.string().describe('开始时间，本地时间，格式 YYYY-MM-DDTHH:mm:ss，例如 2026-08-31T00:00:00'),
    end: z.string().describe('结束时间，本地时间，格式 YYYY-MM-DDTHH:mm:ss，例如 2026-09-07T00:00:00'),
    limit: z.number().int().min(1).max(100).optional().describe('最多返回条数，默认 20'),
  }),
  execute: async ({ start, end, limit }) => graphGetEvents(start, end, limit ?? 20),
})

export const graphTodayEventsTool = createTool({
  id: 'graph-today-events',
  description: '读取今天（00:00 到 24:00）的全部日历日程。',
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    return graphGetEvents(toISO(start), toISO(end), 50)
  },
})

export const graphWeekEventsTool = createTool({
  id: 'graph-week-events',
  description: '读取未来 7 天的日历日程（含冲突检测所需的全部时间字段）。',
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date()
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
    return graphGetEvents(toISO(now), toISO(end), 100)
  },
})

export const allCalendarTools = {
  graphEventsTool,
  graphTodayEventsTool,
  graphWeekEventsTool,
}
