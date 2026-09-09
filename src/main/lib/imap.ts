// ============================================================
//  SightTwin · IMAP 客户端（路线 B）
//  逻辑移植自 OpenClaw skill `imap-smtp-email`（gzlicanyi）的 imap.js，
//  但把老旧的 `imap` 包换成现代、仍在维护的 `imapflow`（同一作者 mscdex 的新作）。
//  只读：列出/获取/搜索邮件。
// ============================================================
import { ImapFlow, type MessageStructure } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { loadConfig } from './config-store.ts'
import { getSecret } from './secret-store.ts'

// ---------- 类型 ----------
export interface ImapMailItem {
  uid: number
  messageId: string
  from: string
  to: string
  subject: string
  date: string // ISO
  snippet: string
  text: string
  html?: string
  attachments: { filename: string; contentType: string; size: number }[]
  flags: string[]
  unread: boolean
}

export interface ImapConfig {
  host: string
  port: number
  tls: boolean
  user: string
  pass: string
  mailbox: string
  rejectUnauthorized: boolean
}

export async function getImapConfig(): Promise<ImapConfig> {
  const config = loadConfig().imap || {}
  const user = config.userKey ? await getSecret(config.userKey) : null
  const pass = config.passwordKey ? await getSecret(config.passwordKey) : null
  return {
    host: config.host || 'outlook.office365.com',
    port: config.port || 993,
    tls: config.tls ?? true,
    user: user || '',
    pass: pass || '',
    mailbox: config.mailbox || 'INBOX',
    rejectUnauthorized: config.rejectUnauthorized ?? true,
  }
}

function createClient(cfg: ImapConfig): ImapFlow {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: cfg.rejectUnauthorized },
    logger: false,
  })
  // 关键：服务器掐断连接（租户防火墙/CA 策略）会触发未处理的 'error' 事件，
  // 没有监听器会直接崩溃整个 Node 进程（曾导致 dev server 反复重启）
  client.on('error', () => {})
  return client
}

// 把 imapflow 的 MessageStructure + 原始 source 解析成统一结构
async function parseMessage(msg: { uid: number; source: Buffer; struct: MessageStructure; flags?: string[] }): Promise<ImapMailItem> {
  const parsed: ParsedMail = await simpleParser(msg.source)
  const text = parsed.text || ''
  const html = parsed.html ? (parsed.html as string) : undefined
  const snippet = text
    ? text.slice(0, 300).replace(/\s+/g, ' ').trim()
    : html
      ? (html as string).replace(/<[^>]*>/g, '').slice(0, 300).trim()
      : ''

  const flags = (msg.flags || []).map(String)
  return {
    uid: msg.uid,
    messageId: parsed.messageId || '',
    from: parsed.from?.text || 'Unknown',
    to: parsed.to?.text || '',
    subject: parsed.subject || '(no subject)',
    date: parsed.date ? parsed.date.toISOString() : '',
    snippet,
    text,
    html,
    attachments: (parsed.attachments || []).map(a => ({
      filename: a.filename || '',
      contentType: a.contentType || '',
      size: a.size || 0,
    })),
    flags,
    unread: !flags.includes('\\Seen'),
  }
}

export async function listMailboxes(): Promise<string[]> {
  const cfg = await getImapConfig()
  if (!cfg.user || !cfg.pass) throw new Error('IMAP 用户名或密码未配置（请在 AuraBrain 配置页设置）')
  const client = createClient(cfg)
  try {
    await client.connect()
    const boxes = await client.list()
    return boxes.map(b => b.path)
  } finally {
    await client.logout().catch(() => {})
  }
}

/** 列出最近 limit 封邮件（按日期倒序） */
export async function checkRecentEmails(limit = 10, unseenOnly = false): Promise<ImapMailItem[]> {
  const cfg = await getImapConfig()
  if (!cfg.user || !cfg.pass) throw new Error('IMAP 用户名或密码未配置（请在 AuraBrain 配置页设置）')
  const client = createClient(cfg)
  try {
    await client.connect()
    await client.mailboxOpen(cfg.mailbox)

    const criteria: Record<string, unknown> = { all: true }
    if (unseenOnly) {
      criteria.all = undefined
      criteria.unread = true
    }
    const uids = (await client.search(criteria, { uid: true })) as number[]
    if (!uids || uids.length === 0) return []

    // 取最新 limit 封（imapflow search 返回升序 uid，倒序取最新）
    const target = uids.slice(-limit).reverse()
    const items: ImapMailItem[] = []
    const list = await client.fetch(target, {
      source: true,
      struct: true,
      flags: true,
    })
    for await (const msg of list) {
      if (msg.source) {
        items.push(await parseMessage({ uid: msg.uid, source: msg.source, struct: msg.struct, flags: msg.flags }))
      }
    }
    return items
  } finally {
    await client.logout().catch(() => {})
  }
}

/** 按 UID 获取完整邮件 */
export async function fetchEmail(uid: number): Promise<ImapMailItem> {
  const cfg = await getImapConfig()
  if (!cfg.user || !cfg.pass) throw new Error('IMAP 用户名或密码未配置（请在 AuraBrain 配置页设置）')
  const client = createClient(cfg)
  try {
    await client.connect()
    await client.mailboxOpen(cfg.mailbox)
    const list = await client.fetch([uid], { source: true, struct: true, flags: true })
    for await (const msg of list) {
      if (msg.source) return parseMessage({ uid: msg.uid, source: msg.source, struct: msg.struct, flags: msg.flags })
    }
    throw new Error(`邮件 UID ${uid} 未找到`)
  } finally {
    await client.logout().catch(() => {})
  }
}

/** 测试连接：能登录并返回 INBOX 数量即视为通 */
export async function testConnection(): Promise<{ ok: boolean; message: string; mailbox?: string; total?: number }> {
  const cfg = await getImapConfig()
  if (!cfg.user || !cfg.pass) return { ok: false, message: 'IMAP 用户名或密码未配置（请在 AuraBrain 配置页设置）' }
  try {
    const client = createClient(cfg)
    await client.connect()
    await client.mailboxOpen(cfg.mailbox)
    const total = client.mailbox?.messages ?? -1
    await client.logout().catch(() => {})
    return { ok: true, message: `连接成功，${cfg.mailbox} 共 ${total} 封`, mailbox: cfg.mailbox, total }
  } catch (e: any) {
    return { ok: false, message: `连接失败：${e?.message || String(e)}` }
  }
}
