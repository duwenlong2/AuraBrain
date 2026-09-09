// ============================================================
//  AuraBrain Runtime · 经典 Outlook 本机 MAPI 直读桥（路线 C）
//  原理：经典 Outlook 已登录的 MAPI Profile 提供本机 OST 数据，
//  通过 PowerShell + Outlook COM/ADO 在本地直接读取，
//  不走网络、不发起登录、不受条件访问策略限制。
//  实现：spawn powershell 执行 outlook-bridge.ps1，
//  参数经临时 JSON 文件传入，结果经输出 JSON 文件返回。
// ============================================================
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// dev 时 __dirname 指向 .mastra/output，ps1 不会被打进 bundle，按候选路径回退到 src
const PS1_CANDIDATES = [
  path.resolve(__dirname, 'outlook-bridge.ps1'),
  path.resolve(__dirname, '../../src/main/lib/outlook-bridge.ps1'),
  path.resolve(process.cwd(), 'src/main/lib/outlook-bridge.ps1'),
]
const PS1_FILE = PS1_CANDIDATES.find(p => fs.existsSync(p))

export interface OutlookEmailItem {
  entryId: string
  subject: string
  from: string
  fromEmail: string
  received: string
  unread: boolean
  hasAttach: boolean
  body: string
  html: string | null
}

export interface OutlookEventItem {
  subject: string
  start: string
  end: string
  location: string
  organizer: string
  online: boolean
  meetingUrl: string
}

interface BridgeResult<T> {
  ok: boolean
  data?: T
  error?: string
}

// Outlook COM 是单实例且不适合被多个 PowerShell 进程并发调用；串行化一次性请求，
// 避免连接测试、邮件读取和日程读取同时访问 MAPI 时触发 RPC_E_CALL_FAILED。
let bridgeQueue: Promise<void> = Promise.resolve()

function findPs1(): string {
  if (!PS1_FILE) throw new Error('找不到 outlook-bridge.ps1（候选路径均不存在）')
  ensurePs1Bom(PS1_FILE)
  return PS1_FILE
}

/**
 * 自愈：Windows PowerShell 5.1 读 .ps1 时，若文件是「UTF-8 无 BOM」会按 ANSI/GBK 解码，
 * 中文注释的字节会被误读（可能产生 0x22 引号字节 → 字符串提前截断 → ParserError）。
 * 本函数在每次 spawn 前检查 BOM，丢失则补回（编辑工具重写文件时可能丢 BOM）。
 */
function ensurePs1Bom(file: string): void {
  try {
    const head = Buffer.alloc(3)
    const fd = fs.openSync(file, 'r')
    try { fs.readSync(fd, head, 0, 3, 0) } finally { fs.closeSync(fd) }
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return // 已有 BOM
    const content = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')]))
  } catch {
    // 补 BOM 失败不阻塞主流程（最坏情况回退到无 BOM 的旧行为）
  }
}

/** 调用 PS1 桥，返回解析后的 JSON 结果 */
function runBridge<T>(command: string, args: Record<string, unknown> = {}, timeoutMs = 90_000): Promise<BridgeResult<T>> {
  const operation = bridgeQueue.then(() => new Promise<BridgeResult<T>>((resolve, reject) => {
    const ps1 = findPs1()
    const id = crypto.randomBytes(8).toString('hex')
    const argsFile = path.join(os.tmpdir(), `sighttwin-${id}-args.json`)
    const outFile = path.join(os.tmpdir(), `sighttwin-${id}-out.json`)

    fs.writeFileSync(argsFile, JSON.stringify(args), 'utf8')

    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        fs.unlinkSync(argsFile)
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile)
      } catch {}
      fn()
    }

    const child = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, command, argsFile, outFile],
      { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      finish(() => reject(new Error(`Outlook 桥超时（${timeoutMs}ms）。首次调用可能需要启动 MAPI 会话，请重试。`)))
    }, timeoutMs)

    const stderrChunks: Buffer[] = []
    if (child.stderr) child.stderr.on('data', d => stderrChunks.push(d))
    child.on('error', err => finish(() => reject(new Error(`无法启动 PowerShell：${err.message}`))))
    child.on('close', code => {
      // 关键：finish() 会先删除 outFile 再执行回调，
      // 所以必须在调用 finish 之前就把输出内容读出来
      let stderr = ''
      try { stderr = stderrChunks.map(c => c.toString('utf8')).join('').trim() } catch {}
      let raw: string | null = null
      if (fs.existsSync(outFile)) {
        try { raw = fs.readFileSync(outFile, 'utf8') } catch {}
      }
      finish(() => {
        if (raw === null) {
          reject(new Error(`Outlook 桥未产生输出（exit=${code}）。PowerShell 输出：${stderr || '(空)'}`))
          return
        }
        try {
          resolve(JSON.parse(raw) as BridgeResult<T>)
        } catch (e: any) {
          reject(new Error(`Outlook 桥输出解析失败：${e?.message || e}`))
        }
      })
    })
  }))
  bridgeQueue = operation.then(() => undefined, () => undefined)
  return operation
}

// ---------- 对外能力 ----------

export async function outlookTest(): Promise<{ ok: boolean; message: string; profile?: string; inboxCount?: number; outlookVersion?: string }> {
  try {
    const r = await runBridge<{ profile: string; inboxName: string; inboxCount: number; calendarName: string; outlookVersion: string }>('test')
    if (!r.ok) return { ok: false, message: r.error || '连接失败' }
    return {
      ok: true,
      message: `连接成功：profile=${r.data.profile}，收件箱 ${r.data.inboxCount} 封，Outlook ${r.data.outlookVersion}`,
      profile: r.data.profile,
      inboxCount: r.data.inboxCount,
      outlookVersion: r.data.outlookVersion,
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export async function outlookRecentEmails(limit = 10, days = 7): Promise<OutlookEmailItem[]> {
  const r = await runBridge<{ count: number; emails: OutlookEmailItem[] }>('mail', { limit, days })
  if (!r.ok) throw new Error(r.error || '读取邮件失败')
  return r.data.emails || []
}

export async function outlookGetEmail(entryId: string): Promise<{ subject: string; body: string; html: string | null }> {
  const r = await runBridge<{ subject: string; body: string; html: string | null }>('mail-one', { entryId })
  if (!r.ok) throw new Error(r.error || '读取邮件全文失败')
  return r.data
}

export async function outlookEvents(days = 7): Promise<OutlookEventItem[]> {
  const r = await runBridge<{ count: number; events: OutlookEventItem[] }>('events', { days })
  if (!r.ok) throw new Error(r.error || '读取日程失败')
  return r.data.events || []
}

// ============================================================
//  实时推送（SSE）
//  当前：spawn 一个常驻 powershell 进程跑 ps1 的 'watch' 命令，
//  它每 interval 秒轮询一次 OST，发现新邮件/新日程就往 stdout
//  写一行 JSON。Node 端按行读取并广播给所有 SSE 订阅者。
//  后续：经典 Outlook C# sink 已验证 NewMailEx，可替换 watch；
//  日历 ItemAdd 仍需独立验证。watch 进程与一次性命令进程共享
//  同一个 Outlook COM 实例（COM 单实例）。
// ============================================================

export type PushEvent =
  | { type: 'status'; message: string; baselineMail?: string; baselineEvent?: string; intervalSec?: number }
  | { type: 'mail'; subject: string; from: string; fromEmail: string; received: string; unread: boolean }
  | { type: 'event'; subject: string; start: string; end: string; location: string; organizer: string }
  | { type: 'watcher-error'; message: string }
  | { type: 'watcher-exited'; message: string }

type SSEClient = {
  id: number
  send: (ev: PushEvent) => boolean // false = 客户端已断开
  lastEventId: number
}

let watcherProc: { pid: number; kill: () => void } | null = null
let watcherStarting = false
let sseClients = new Set<SSEClient>()
let eventCounter = 0
let lastEventLog: PushEvent[] = [] // 最近 50 条，供 /status 查询

/** 广播一条事件给所有 SSE 客户端 */
export function broadcastPush(ev: PushEvent): void {
  lastEventLog.push({ ...ev, seq: ++eventCounter } as PushEvent & { seq: number })
  if (lastEventLog.length > 50) lastEventLog.shift()
  for (const c of [...sseClients]) {
    if (!c.send(ev)) sseClients.delete(c)
  }
}

/** 添加 SSE 订阅者，返回客户端句柄 */
export function addSSEClient(send: (ev: PushEvent) => boolean): SSEClient {
  const client: SSEClient = { id: ++eventCounter, send, lastEventId: 0 }
  sseClients.add(client)
  return client
}

export function removeSSEClient(client: SSEClient): void {
  sseClients.delete(client)
}

/** 启动常驻 watch 进程（幂等） */
export async function startOutlookWatcher(intervalSec = 10): Promise<{ ok: boolean; message: string }> {
  if (watcherProc) return { ok: true, message: 'watcher 已在运行' }
  if (watcherStarting) return { ok: true, message: 'watcher 正在启动中' }
  watcherStarting = true

  try {
    const ps1 = findPs1()
    const id = crypto.randomBytes(8).toString('hex')
    const argsFile = path.join(os.tmpdir(), `sighttwin-watch-${id}-args.json`)
    fs.writeFileSync(argsFile, JSON.stringify({ interval: intervalSec }), 'utf8')

    const child = spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, 'watch', argsFile, path.join(os.tmpdir(), `sighttwin-watch-${id}-unused.json`)],
      { windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    watcherProc = { pid: child.pid ?? -1, kill: () => child.kill() }

    let buf = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => {
      buf += chunk
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line || line === 'done') continue
        try {
          const ev = JSON.parse(line) as PushEvent
          broadcastPush(ev)
        } catch {}
      }
    })
    child.stderr?.on('data', () => {}) // 忽略 stderr 噪音
    child.on('error', err => {
      watcherProc = null
      watcherStarting = false
      broadcastPush({ type: 'watcher-error', message: `watcher 进程错误：${err.message}` })
    })
    child.on('close', code => {
      watcherProc = null
      watcherStarting = false
      try { fs.unlinkSync(argsFile) } catch {}
      broadcastPush({ type: 'watcher-exited', message: `watcher 进程已退出（exit=${code}），推送已停止` })
    })

    watcherStarting = false
    // 等一小会确认进程活着
    await new Promise(r => setTimeout(r, 3000))
    if (watcherProc) {
      return { ok: true, message: `经典 Outlook watcher 已启动（PID ${watcherProc.pid}，每 ${intervalSec}s 轮询，零网络）` }
    }
    return { ok: false, message: 'watcher 启动失败（进程已退出），请查看 Outlook 是否异常' }
  } catch (e: any) {
    watcherStarting = false
    return { ok: false, message: `启动 watcher 失败：${e?.message || e}` }
  }
}

/** 停止 watcher */
export function stopOutlookWatcher(): { ok: boolean; message: string } {
  if (!watcherProc) return { ok: false, message: 'watcher 未运行' }
  watcherProc.kill()
  watcherProc = null
  return { ok: true, message: 'watcher 已停止' }
}

export function getWatcherStatus(): { running: boolean; pid?: number; sseClients: number; recent: PushEvent[] } {
  return {
    running: !!watcherProc,
    pid: watcherProc?.pid,
    sseClients: sseClients.size,
    recent: lastEventLog.slice(-20),
  }
}
