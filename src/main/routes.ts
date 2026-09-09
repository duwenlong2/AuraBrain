// ============================================================
//  AuraBrain Runtime · 自定义 API 路由（测试页 + 登录 + tools 直调）
//  - GET  /test-page            测试页面（读 public/test-page.html）
//  - POST /api/test/graph-login  发起 Graph 设备码登录
//  - POST /api/test/graph-poll   轮询设备码结果
//  - GET  /api/test/graph-status 查看当前 Graph 登录状态
//  - POST /api/test/graph-logout 清除本地令牌
//  - POST /api/test/run          直接调用某个 tool（证明 tools 层走通）
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerApiRoute } from '@mastra/core/server'
import { loadConfig, saveConfig, type AuraBrainConfig } from './lib/config-store.ts'
import { getSecret, setSecret } from './lib/secret-store.ts'
import {
  startDeviceCode,
  pollDeviceCode,
  clearToken,
  loadToken,
  getMe,
  graphClientId,
} from './lib/graph.ts'
import {
  graphTestTool,
  graphRecentEmailsTool,
  graphGetEmailTool,
  imapTestTool,
  imapMailboxesTool,
  imapRecentEmailsTool,
  imapGetEmailTool,
} from './tools/mail-tools.ts'
import { graphEventsTool, graphTodayEventsTool, graphWeekEventsTool } from './tools/calendar-tools.ts'
import {
  outlookTestTool,
  outlookRecentEmailsTool,
  outlookGetEmailTool,
  outlookEventsTool,
} from './tools/outlook-tools.ts'
import {
  startOutlookWatcher,
  stopOutlookWatcher,
  getWatcherStatus,
  addSSEClient,
  removeSSEClient,
  broadcastPush,
  type PushEvent,
} from './lib/outlook.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// dev 时 __dirname 指向 .mastra/output，HTML 不会被打进 bundle，
// 所以按候选路径依次查找（生产部署时把 html 拷到 output/public 即可命中第一个）
const TEST_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/test-page.html'),
  path.resolve(__dirname, '../../src/main/public/test-page.html'),
  path.resolve(process.cwd(), 'src/main/public/test-page.html'),
]
const TEST_PAGE_FILE = TEST_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || TEST_PAGE_CANDIDATES[0]
const SETUP_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/setup.html'),
  path.resolve(__dirname, '../../src/main/public/setup.html'),
  path.resolve(process.cwd(), 'src/main/public/setup.html'),
]
const SETUP_PAGE_FILE = SETUP_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || SETUP_PAGE_CANDIDATES[0]
const MODEL_SETTINGS_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/models.html'),
  path.resolve(__dirname, '../../src/main/public/models.html'),
  path.resolve(process.cwd(), 'src/main/public/models.html'),
]
const MODEL_SETTINGS_PAGE_FILE = MODEL_SETTINGS_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || MODEL_SETTINGS_PAGE_CANDIDATES[0]
const CONSOLE_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/console.html'),
  path.resolve(__dirname, '../../src/main/public/console.html'),
  path.resolve(process.cwd(), 'src/main/public/console.html'),
]
const CONSOLE_PAGE_FILE = CONSOLE_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || CONSOLE_PAGE_CANDIDATES[0]

// 设备码流程的临时状态（POC 用内存即可）
let pendingDeviceCode: { code: string; interval: number; expiresAt: number } | null = null

const TOOL_REGISTRY: Record<string, any> = {
  'graph-test-connection': graphTestTool,
  'graph-recent-emails': graphRecentEmailsTool,
  'graph-get-email': graphGetEmailTool,
  'graph-get-events': graphEventsTool,
  'graph-today-events': graphTodayEventsTool,
  'graph-week-events': graphWeekEventsTool,
  'imap-test-connection': imapTestTool,
  'imap-list-mailboxes': imapMailboxesTool,
  'imap-recent-emails': imapRecentEmailsTool,
  'imap-get-email': imapGetEmailTool,
  'outlook-test-connection': outlookTestTool,
  'outlook-recent-emails': outlookRecentEmailsTool,
  'outlook-get-email': outlookGetEmailTool,
  'outlook-get-events': outlookEventsTool,
}

export const apiRoutes = [
  registerApiRoute('/', {
    method: 'GET',
    handler: async c => {
      const config = loadConfig()
      const html = config.models?.default
        ? fs.readFileSync(CONSOLE_PAGE_FILE, 'utf8').replaceAll("/settings/models", "/aurabrain/settings/models")
        : fs.readFileSync(SETUP_PAGE_FILE, 'utf8')
      return c.html(html)
    },
  }),

  registerApiRoute('/setup', {
    method: 'GET',
    handler: async c => c.html(fs.readFileSync(SETUP_PAGE_FILE, 'utf8')),
  }),

  registerApiRoute('/aurabrain/settings/models', {
    method: 'GET',
    handler: async c => c.html(fs.readFileSync(MODEL_SETTINGS_PAGE_FILE, 'utf8')),
  }),

  registerApiRoute('/admin/status', {
    method: 'GET',
    handler: async c => {
      const config = loadConfig()
      const providers = config.models?.providers || []
      const providerStatus = await Promise.all(providers.map(async provider => ({
        id: provider.id,
        name: provider.name,
        apiType: provider.apiType,
        baseUrl: provider.baseUrl,
        models: provider.models,
        hasApiKey: provider.apiKeyRef ? Boolean(await getSecret(provider.apiKeyRef)) : false,
      })))
      return c.json({
        initialized: Boolean(config.models?.default && providers.length),
        defaultModel: config.models?.default || null,
        providers: providerStatus,
      })
    },
  }),

  registerApiRoute('/admin/scan/vscode-models', {
    method: 'GET',
    handler: async c => {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Roaming')
      const files = [
        path.join(appData, 'Code', 'User', 'chatLanguageModels.json'),
        path.join(appData, 'Code - Insiders', 'User', 'chatLanguageModels.json'),
      ]
      const candidates: any[] = []
      for (const file of files) {
        try {
          const entries = JSON.parse(fs.readFileSync(file, 'utf8')) as any[]
          for (const entry of entries) {
            if (entry.apiType !== 'chat-completions' || !Array.isArray(entry.models)) continue
            for (const model of entry.models) {
              if (!model.id || !model.url) continue
              candidates.push({
                source: path.basename(path.dirname(path.dirname(file))),
                providerId: entry.vendor === 'customendpoint' ? entry.name : entry.vendor || entry.name,
                providerName: entry.name,
                apiType: entry.apiType,
                baseUrl: model.url,
                modelId: model.id,
                modelName: model.name || model.id,
                vision: Boolean(model.vision),
                thinking: Boolean(model.thinking),
                hasApiKeyReference: typeof entry.apiKey === 'string',
              })
            }
          }
        } catch {
          // A missing or invalid VS Code file should not fail the whole scan.
        }
      }
      return c.json({ ok: true, candidates })
    },
  }),

  registerApiRoute('/admin/setup', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json() as {
          providerId?: string
          providerName?: string
          apiType?: 'chat-completions' | 'responses'
          baseUrl?: string
          modelId?: string
          modelName?: string
          apiKey?: string
          vision?: boolean
        }
        if (!body.providerId || !body.providerName || !body.baseUrl || !body.modelId || !body.modelName) {
          return c.json({ ok: false, error: '请完整填写提供商、接口地址和模型名称' }, 400)
        }
        const current = loadConfig()
        const existingProvider = current.models?.providers?.find(item => item.id === body.providerId?.trim())
        const provider = {
          id: body.providerId.trim(),
          name: body.providerName.trim(),
          apiType: body.apiType || 'chat-completions',
          baseUrl: body.baseUrl.trim().replace(/\/$/, ''),
          apiKeyRef: body.apiKey?.trim() ? `model.${body.providerId.trim()}.apiKey` : existingProvider?.apiKeyRef,
          models: [{ id: body.modelId.trim(), name: body.modelName.trim(), vision: Boolean(body.vision) }],
        } satisfies NonNullable<NonNullable<AuraBrainConfig['models']>['providers']>[number]
        if (provider.apiKeyRef && body.apiKey?.trim()) await setSecret(provider.apiKeyRef, body.apiKey.trim())
        saveConfig({
          ...current,
          models: {
            ...current.models,
            default: `${provider.id}/${provider.models[0].id}`,
            providers: [
              ...(current.models?.providers || []).filter(item => item.id !== provider.id),
              provider,
            ],
          },
        })
        return c.json({ ok: true, defaultModel: `${provider.id}/${provider.models[0].id}` })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 500)
      }
    },
  }),

  registerApiRoute('/admin/model-chat', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json() as {
          model?: string
          message?: string
          imageData?: string
          messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
          stream?: boolean
        }
        const messages = body.messages?.length
          ? body.messages
          : body.message?.trim()
            ? [{ role: 'user' as const, content: body.message.trim() }]
            : []
        if (!body.model || !messages.length) return c.json({ ok: false, error: '模型和消息不能为空' }, 400)
        const [providerId, ...modelParts] = body.model.split('/')
        const modelId = modelParts.join('/')
        const provider = loadConfig().models?.providers?.find(item => item.id === providerId)
        if (!provider || !modelId) return c.json({ ok: false, error: '找不到所选模型' }, 404)
        if (provider.apiType !== 'chat-completions') return c.json({ ok: false, error: '当前测试页只支持 Chat Completions 接口' }, 400)
        const apiKey = provider.apiKeyRef ? await getSecret(provider.apiKeyRef) : null
        const requestMessages = body.imageData
          ? [...messages.slice(0, -1), { ...messages.at(-1)!, content: [{ type: 'text', text: messages.at(-1)!.content }, { type: 'image_url', image_url: { url: body.imageData } }] }]
          : messages
        const abortController = new AbortController()
        const timeout = setTimeout(() => abortController.abort(), 120_000)
        let response: Response
        try {
          response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
            body: JSON.stringify({ model: modelId, messages: requestMessages, temperature: 0.2, ...(body.stream ? { stream: true } : {}) }),
            signal: abortController.signal,
          })
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            return c.json({ ok: false, error: '模型网关 120 秒内没有返回。请检查本地模型服务是否已加载、接口地址是否正确，或先用纯文本测试。' }, 504)
          }
          return c.json({ ok: false, error: `无法连接模型网关：${error?.message || String(error)}` }, 502)
        } finally {
          clearTimeout(timeout)
        }
        if (body.stream) {
          if (!response.ok) {
            const errorText = await response.text()
            let errorResult: any = {}
            try { errorResult = errorText ? JSON.parse(errorText) : {} } catch { /* Preserve the upstream text below. */ }
            return c.json({ ok: false, error: errorResult?.error?.message || errorText || `模型接口返回 HTTP ${response.status}` }, 502)
          }
          return new Response(response.body, {
            status: response.status,
            headers: { 'content-type': response.headers.get('content-type') || 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
          })
        }
        const responseText = await response.text()
        let result: any = {}
        try { result = responseText ? JSON.parse(responseText) : {} } catch { /* Preserve the upstream text below. */ }
        if (!response.ok) return c.json({ ok: false, error: result?.error?.message || responseText || `模型接口返回 HTTP ${response.status}` }, 502)
        return c.json({ ok: true, model: body.model, text: result?.choices?.[0]?.message?.content || '' })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 500)
      }
    },
  }),

  // ---------- 测试页 ----------
  registerApiRoute('/test-page', {
    method: 'GET',
    handler: async c => {
      const html = fs.readFileSync(TEST_PAGE_FILE, 'utf8')
      return c.html(html)
    },
  }),

  // ---------- Graph 设备码登录 ----------
  registerApiRoute('/test-api/graph-login', {
    method: 'POST',
    handler: async c => {
      if (!graphClientId()) {
        return c.json({ ok: false, error: 'Graph Client ID 未配置，请先在 AuraBrain 配置页设置' })
      }
      try {
        const dc = await startDeviceCode()
        pendingDeviceCode = {
          code: dc.deviceCode,
          interval: dc.interval || 5,
          expiresAt: Date.now() + (dc.expires_in || 900) * 1000,
        }
        return c.json({
          ok: true,
          user_code: dc.user_code,
          verification_uri: dc.verification_uri,
          message: dc.message,
        })
      } catch (e: any) {
        return c.json({ ok: false, error: e?.message || String(e) })
      }
    },
  }),

  registerApiRoute('/test-api/graph-poll', {
    method: 'POST',
    handler: async c => {
      if (!pendingDeviceCode) {
        return c.json({ ok: false, pending: false, error: '没有进行中的设备码登录，请先点「发起登录」' })
      }
      try {
        const token = await pollDeviceCode(pendingDeviceCode.code)
        pendingDeviceCode = null
        void token
        const me = await getMe()
        return c.json({ ok: true, message: `登录成功！欢迎 ${me.displayName}`, user: me })
      } catch (e: any) {
        const msg = e?.message || String(e)
        if (Date.now() < (pendingDeviceCode?.expiresAt ?? 0) && !msg.includes('invalid_grant')) {
          // authorization_pending / slow_down / 其它临时错误：继续等待
          return c.json({ ok: false, pending: true, message: msg })
        }
        pendingDeviceCode = null
        if (msg.includes('expired_token')) return c.json({ ok: false, pending: false, error: '设备码已过期，请重新发起登录' })
        if (msg.includes('authorization_declined')) return c.json({ ok: false, pending: false, error: '登录被拒绝' })
        return c.json({ ok: false, pending: false, error: msg })
      }
    },
  }),

  registerApiRoute('/test-api/graph-status', {
    method: 'GET',
    handler: async c => {
      const token = await loadToken()
      if (!token) return c.json({ loggedIn: false, clientIdConfigured: !!graphClientId() })
      try {
        const me = await getMe()
        return c.json({ loggedIn: true, expiresAt: new Date(token.expires_at).toISOString(), user: me })
      } catch (e: any) {
        return c.json({ loggedIn: false, error: e?.message })
      }
    },
  }),

  registerApiRoute('/test-api/graph-logout', {
    method: 'POST',
    handler: async c => {
      await clearToken()
      pendingDeviceCode = null
      return c.json({ ok: true, message: '已清除本地 Graph 令牌' })
    },
  }),

  // ---------- 实时推送（SSE） ----------
  // 浏览器 EventSource 连上来 → 注册为 SSE 客户端 →
  // watch 进程发现新邮件/新日程 → broadcastPush → 推给所有订阅者
  registerApiRoute('/test-api/push-stream', {
    method: 'GET',
    handler: async c => {
      const encoder = new TextEncoder()
      let sendFn: (ev: PushEvent) => boolean
      let client: ReturnType<typeof addSSEClient>
      let closed = false

      const stream = new ReadableStream({
        start(controller) {
          // 首帧：协议说明 + 当前状态
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'hello', message: 'SSE 连接已建立' })}\n\n`))
          const st = getWatcherStatus()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: st.running ? `watcher 运行中（PID ${st.pid}）` : 'watcher 未运行，请先点「启动推送」' })}\n\n`))
          // 把已有最近事件补发一遍（新连接者也能看到上下文）
          for (const ev of st.recent) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
          }
          client = addSSEClient(ev => {
            if (closed) return false
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
              return true
            } catch {
              return false
            }
          })
          // sendFn 占位（实际由 client 接管，这里只是类型完整）
          sendFn = () => true
          // 心跳：每 25s 一条注释帧，防代理断连
          const hb = setInterval(() => {
            if (closed) return
            try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)) } catch {}
          }, 25_000)
          c.req.raw.signal.addEventListener('abort', () => {
            closed = true
            clearInterval(hb)
            removeSSEClient(client)
            try { controller.close() } catch {}
          })
        },
        cancel() {
          closed = true
          if (client) removeSSEClient(client)
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    },
  }),

  registerApiRoute('/test-api/push-start', {
    method: 'POST',
    handler: async c => {
      const body = (await c.req.json().catch(() => ({}))) as { interval?: number }
      const interval = Math.min(Math.max(parseInt(String(body.interval || 10), 10) || 10, 5), 60)
      const r = await startOutlookWatcher(interval)
      if (r.ok) broadcastPush({ type: 'status', message: r.message })
      return c.json({ ok: r.ok, message: r.message })
    },
  }),

  registerApiRoute('/test-api/push-stop', {
    method: 'POST',
    handler: async c => {
      const r = stopOutlookWatcher()
      broadcastPush({ type: 'status', message: 'watcher 已停止' })
      return c.json({ ok: r.ok, message: r.message })
    },
  }),

  registerApiRoute('/test-api/push-status', {
    method: 'GET',
    handler: async c => {
      return c.json({ ok: true, ...getWatcherStatus() })
    },
  }),

  // ---------- Tool 直调（测试页核心：证明 tools 层走通） ----------
  registerApiRoute('/test-api/run', {
    method: 'POST',
    handler: async c => {
      const body = (await c.req.json().catch(() => ({}))) as { tool?: string; input?: Record<string, unknown> }
      const toolId = body.tool || ''
      const tool = TOOL_REGISTRY[toolId]
      if (!tool) {
        return c.json({ ok: false, error: `未知 tool: ${toolId}`, available: Object.keys(TOOL_REGISTRY) })
      }
      const t0 = Date.now()
      try {
        const result = await tool.execute(body.input ?? {}, {} as any)
        return c.json({ ok: true, tool: toolId, durationMs: Date.now() - t0, result })
      } catch (e: any) {
        return c.json({ ok: false, tool: toolId, durationMs: Date.now() - t0, error: e?.message || String(e) })
      }
    },
  }),
]
