// ============================================================
//  SightTwin · Microsoft Graph 客户端（路线 A · 推荐）
//  新版 Outlook/Teams 底层协议。设备码登录（Device Code Flow）：
//    1. startDeviceCode()  -> 返回 user_code + verification_uri
//    2. 用户在浏览器打开 uri 输入 code，用 Lenovo 域账号登录
//    3. 轮询 token endpoint 拿到 access_token，缓存到本地文件
//  权限：Mail.Read + Calendars.Read（委托权限，设备码流程下可用）
// ============================================================
import { loadConfig } from './config-store.ts'
import { deleteSecret, getSecret, setSecret } from './secret-store.ts'

const GRAPH_TOKEN_KEY = 'graph.oauth-token'

const AUTHORITIES = {
  login: (tenant: string) => (tenant && tenant !== 'common' ? `https://login.microsoftonline.com/${tenant}` : 'https://login.microsoftonline.com/common'),
}

const SCOPES = ['Mail.Read', 'Calendars.Read', 'openid', 'profile', 'offline_access']

interface TokenData {
  access_token: string
  expires_at: number // epoch ms
  refresh_token?: string
  id_token?: string
  scope?: string
}

export function graphClientId(): string {
  return loadConfig().graph?.clientId || ''
}
export function graphTenantId(): string {
  return loadConfig().graph?.tenantId || 'common'
}

// ---------- Token 缓存 ----------
export async function loadToken(): Promise<TokenData | null> {
  try {
    const raw = await getSecret(GRAPH_TOKEN_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as TokenData
    if (data.expires_at && data.expires_at - Date.now() > 60_000) return data
    return null
  } catch {
    return null
  }
}

/** 异步刷新 token（有 refresh_token 时） */
export async function asyncRefreshToken(rt: string): Promise<TokenData | null> {
  const clientId = graphClientId()
  if (!clientId) return null
  try {
    const res = await fetch(`${AUTHORITIES.login(graphTenantId())}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: rt,
        scope: SCOPES.join(' '),
      }),
    })
    if (!res.ok) return null
    const data = JSON.parse(await res.text()) as TokenData
    data.expires_at = Date.now() + (data as any).expires_in * 1000
    await saveToken(data)
    return data
  } catch {
    return null
  }
}

export async function saveToken(t: TokenData): Promise<void> {
  await setSecret(GRAPH_TOKEN_KEY, JSON.stringify(t))
}

export async function clearToken(): Promise<void> {
  await deleteSecret(GRAPH_TOKEN_KEY)
}

// ---------- 设备码流程 ----------
export interface DeviceCode {
  user_code: string
  verification_uri: string
  message: string
  interval: number // 秒
  expires_in: number // 秒
  deviceCode: string // 内部轮询用
}

/** 第 1 步：发起设备码登录 */
export async function startDeviceCode(): Promise<DeviceCode> {
  const clientId = graphClientId()
  if (!clientId) throw new Error('Graph Client ID 未配置，请先在 AuraBrain 配置页设置')
  const res = await fetch(`${AUTHORITIES.login(graphTenantId())}/oauth2/v2.0/devicecode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES.join(' '),
    }),
  })
  if (!res.ok) throw new Error(`devicecode 请求失败 ${res.status}: ${await res.text()}`)
  return (await res.json()) as DeviceCode
}

/** 第 2 步：轮询设备码结果（拿到 token） */
export async function pollDeviceCode(deviceCode: string): Promise<TokenData> {
  const clientId = graphClientId()
  const res = await fetch(`${AUTHORITIES.login(graphTenantId())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`token 轮询失败：${text}`)
  const data = JSON.parse(text) as TokenData
  data.expires_at = Date.now() + (data as any).expires_in * 1000
  await saveToken(data)
  return data
}

/** 确保有有效 token：有缓存直接用；过期尝试刷新；都没有则提示走设备码 */
export async function ensureToken(): Promise<TokenData> {
  const t = await loadToken()
  if (t) return t
  // 尝试用 refresh_token 刷新
  try {
    const raw = await getSecret(GRAPH_TOKEN_KEY)
    const token = raw ? JSON.parse(raw) as TokenData : null
    if (token?.refresh_token) {
      const refreshed = await asyncRefreshToken(token.refresh_token)
      if (refreshed) return refreshed
    }
  } catch {}
  throw new Error('未登录。请先在测试页点击「Graph 设备码登录」完成授权。')
}

// ---------- Graph REST ----------
async function graphFetch(url: string, init: RequestInit = {}): Promise<any> {
  const t = await ensureToken()
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${t.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

/** 当前登录用户信息（验证 token 可用） */
export async function getMe(): Promise<{ displayName: string; userPrincipalName: string; mail: string; id: string }> {
  const me = await graphFetch('https://graph.microsoft.com/v1.0/me')
  return { displayName: me.displayName, userPrincipalName: me.userPrincipalName, mail: me.mail, id: me.id }
}

/** 最近 limit 封收件箱邮件（只读） */
export async function getRecentEmails(limit = 10): Promise<
  {
    id: string
    subject: string
    from: string
    to: string
    receivedDateTime: string
    bodyPreview: string
    isRead: boolean
    hasAttachments: boolean
  }[]
> {
  const q = new URLSearchParams({
    $top: String(limit),
    $orderby: 'receivedDateTime desc',
    $select: 'id,subject,from,to,receivedDateTime,bodyPreview,isRead,hasAttachments',
  })
  const data = await graphFetch(`https://graph.microsoft.com/v1.0/me/messages?${q}`)
  return (data.value || []).map((m: any) => ({
    id: m.id,
    subject: m.subject,
    from: m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : (m.from?.emailAddress?.address || ''),
    to: (m.to || []).map((a: any) => a.emailAddress?.address).filter(Boolean).join(', '),
    receivedDateTime: m.receivedDateTime,
    bodyPreview: m.bodyPreview || '',
    isRead: m.isRead,
    hasAttachments: m.hasAttachments,
  }))
}

/** 获取单封邮件全文 */
export async function getEmailById(id: string): Promise<{ id: string; subject: string; from: string; receivedDateTime: string; body: string; bodyType: string }> {
  const m = await graphFetch(`https://graph.microsoft.com/v1.0/me/messages/${id}?$select=id,subject,from,receivedDateTime,body,bodyType`)
  return {
    id: m.id,
    subject: m.subject,
    from: m.from?.emailAddress ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : '',
    receivedDateTime: m.receivedDateTime,
    body: m.body?.content || '',
    bodyType: m.bodyType,
  }
}

/** 日历日程：[start, end) 区间 */
export async function getEvents(startISO: string, endISO: string, limit = 20): Promise<
  { id: string; subject: string; start: string; end: string; location: string; organizer: string; isOnlineMeeting: boolean; onlineMeetingUrl?: string }[]
> {
  const q = new URLSearchParams({
    startDateTime: startISO,
    endDateTime: endISO,
    $top: String(limit),
    $orderby: 'start/dateTime asc',
    $select: 'id,subject,start,end,location,organizer,isOnlineMeeting,onlineMeetingUrl',
  })
  const data = await graphFetch(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`)
  return (data.value || []).map((e: any) => ({
    id: e.id,
    subject: e.subject,
    start: e.start?.dateTime,
    end: e.end?.dateTime,
    location: e.location?.displayName || '',
    organizer: e.organizer?.emailAddress?.name || '',
    isOnlineMeeting: e.isOnlineMeeting,
    onlineMeetingUrl: e.onlineMeetingUrl,
  }))
}

/** 测试：能拉到 /me 即视为通 */
export async function testConnection(): Promise<{ ok: boolean; message: string; user?: string }> {
  try {
    const me = await getMe()
    return { ok: true, message: `连接成功：${me.displayName} <${me.userPrincipalName}>`, user: me.userPrincipalName }
  } catch (e: any) {
    return { ok: false, message: `连接失败：${e?.message || String(e)}` }
  }
}
