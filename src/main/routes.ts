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
import { defaultMcpServers, loadConfig, saveConfig, type AuraBrainConfig } from './lib/config-store.ts'
import {
  completeNativeCommand,
  enqueueNativeCommand,
  getNativeDevice,
  isNativeDeviceOnline,
  listNativeDevices,
  registerNativeDevice,
  touchNativeDevice,
  waitForNativeCommand,
} from './lib/native-device-registry.ts'
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
  loadCapabilitySettings,
  readCapabilityCalendar,
  readCapabilityMail,
  saveCapabilitySettings,
  type CapabilityDataMode,
} from './lib/capabilities.ts'
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
import {
  generateModelText,
  streamModelText,
  toOpenAIStream,
} from './lib/model-runtime.ts'
import { scanMachine } from './lib/machine-scan.ts'
import { recommendModels, type UseCase } from './lib/model-recommender.ts'
import { deployModel, type DeployRequest } from './lib/model-deploy.ts'
import { runTask } from './task/runner.ts'
import {
  getMcpStatus,
  setMcpEnabled,
  retryMcpServer,
} from './mcp/registry.ts'
import { getCapabilityFlags } from './agent/default-agent.ts'

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
const CAPABILITIES_SETTINGS_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/capabilities.html'),
  path.resolve(__dirname, '../../src/main/public/capabilities.html'),
  path.resolve(process.cwd(), 'src/main/public/capabilities.html'),
]
const CAPABILITIES_SETTINGS_PAGE_FILE = CAPABILITIES_SETTINGS_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || CAPABILITIES_SETTINGS_PAGE_CANDIDATES[0]
const RECOMMEND_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/recommend.html'),
  path.resolve(__dirname, '../../src/main/public/recommend.html'),
  path.resolve(process.cwd(), 'src/main/public/recommend.html'),
]
const RECOMMEND_PAGE_FILE = RECOMMEND_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || RECOMMEND_PAGE_CANDIDATES[0]
const CONSOLE_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/console.html'),
  path.resolve(__dirname, '../../src/main/public/console.html'),
  path.resolve(process.cwd(), 'src/main/public/console.html'),
]
const CONSOLE_PAGE_FILE = CONSOLE_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || CONSOLE_PAGE_CANDIDATES[0]
const WORKSPACE_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/workspace/index.html'),
  path.resolve(__dirname, '../../src/main/public/workspace/index.html'),
  path.resolve(process.cwd(), 'src/main/public/workspace/index.html'),
]
const WORKSPACE_PAGE_FILE = WORKSPACE_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || WORKSPACE_PAGE_CANDIDATES[0]
const HAS_WORKSPACE_PAGE = fs.existsSync(WORKSPACE_PAGE_FILE)
const WORKSPACE_ASSETS_DIRECTORY = path.dirname(WORKSPACE_PAGE_FILE)

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}
const TASK_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/task.html'),
  path.resolve(__dirname, '../../src/main/public/task.html'),
  path.resolve(process.cwd(), 'src/main/public/task.html'),
]
const TASK_PAGE_FILE = TASK_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || TASK_PAGE_CANDIDATES[0]
const CAPABILITIES_PAGE_CANDIDATES = [
  path.resolve(__dirname, 'public/capabilities.html'),
  path.resolve(__dirname, '../../src/main/public/capabilities.html'),
  path.resolve(process.cwd(), 'src/main/public/capabilities.html'),
]
const CAPABILITIES_PAGE_FILE = CAPABILITIES_PAGE_CANDIDATES.find(p => fs.existsSync(p)) || CAPABILITIES_PAGE_CANDIDATES[0]

function preparePage(html: string): string {
  const prepared = html
    .replaceAll('.nav{display:none}.nav.active{display:flex}', '.nav{display:flex;overflow:auto}')
    .replaceAll("location.href='/settings/models'", "location.href='/aurabrain/settings/models'")
    .replaceAll('location.href="/settings/models"', 'location.href="/aurabrain/settings/models"')
    .replaceAll("location.href='/settings/capabilities'", "location.href='/aurabrain/settings/capabilities'")
    .replaceAll('location.href="/settings/capabilities"', 'location.href="/aurabrain/settings/capabilities"')
  if (
    prepared.includes(`onclick="location.href='/aurabrain/settings/capabilities'"`)
    || prepared.includes('<button class="nav active"><span>◫</span>本机能力</button>')
    || prepared.includes('<button class="nav active"><span>◫</span><div><strong>能力中心</strong>')
  ) return prepared
  return prepared.replaceAll(
    `<button class="nav" onclick="location.href='/setup'">`,
    `<button class="nav" onclick="location.href='/aurabrain/settings/capabilities'"><span>◈</span>能力中心</button><button class="nav" onclick="location.href='/setup'">`,
  )
}

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

type ChatRequestMessage = {
  role: 'system' | 'user' | 'assistant'
  content: unknown
}

function normalizeChatMessages(messages: ChatRequestMessage[], imageData?: string) {
  const normalized = messages.map(message => {
    if (!Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part: any) => {
        if (part?.type === 'image_url' && part.image_url?.url) {
          return { type: 'image', image: part.image_url.url }
        }
        return part
      }),
    }
  })
  if (!imageData) return normalized
  const last = normalized.at(-1)
  if (!last || last.role !== 'user') return normalized
  const text = typeof last.content === 'string' ? last.content : ''
  const content = Array.isArray(last.content) ? last.content : [{ type: 'text', text }]
  return [...normalized.slice(0, -1), { ...last, content: [...content, { type: 'image', image: imageData }] }]
}

async function modelChatHandler(c: any) {
  try {
    const body = await c.req.json() as {
      model?: string
      message?: string
      imageData?: string
      messages?: ChatRequestMessage[]
      stream?: boolean
    }
    const messages = body.messages?.length
      ? body.messages
      : body.message?.trim()
        ? [{ role: 'user' as const, content: body.message.trim() }]
        : []
    if (!body.model || !messages.length) return c.json({ ok: false, error: '模型和消息不能为空' }, 400)

    const requestMessages = normalizeChatMessages(messages, body.imageData)
    if (body.stream) {
      const result = await streamModelText({ model: body.model, messages: requestMessages })
      return new Response(toOpenAIStream(result.textStream), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        },
      })
    }
    const result = await generateModelText({ model: body.model, messages: requestMessages })
    return c.json({ ok: true, model: body.model, text: result.text || '' })
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? '模型网关 120 秒内没有返回。请检查本地模型服务是否已加载、接口地址是否正确，或先用纯文本测试。'
      : error?.message || String(error)
    return c.json({ ok: false, error: message }, error?.name === 'AbortError' ? 504 : 502)
  }
}

export const apiRoutes = [
  registerApiRoute('/', {
    method: 'GET',
    handler: async (c: any) => {
      const config = loadConfig()
      const initialized = Boolean(config.models?.default && config.models?.providers?.length)
      const html = initialized && HAS_WORKSPACE_PAGE
        ? fs.readFileSync(WORKSPACE_PAGE_FILE, 'utf8')
        : preparePage(fs.readFileSync(initialized ? TASK_PAGE_FILE : SETUP_PAGE_FILE, 'utf8'))
      return c.html(html)
    },
  }),

  registerApiRoute('/workspace', {
    method: 'GET',
    handler: async c => {
      const config = loadConfig()
      const initialized = Boolean(config.models?.default && config.models?.providers?.length)
      return c.html(preparePage(fs.readFileSync(initialized && HAS_WORKSPACE_PAGE ? WORKSPACE_PAGE_FILE : initialized ? TASK_PAGE_FILE : SETUP_PAGE_FILE, 'utf8')))
    },
  }),

  registerApiRoute('/workspace/assets/:file', {
    method: 'GET',
    handler: async c => {
      const file = path.basename(c.req.param('file'))
      const assetPath = path.join(WORKSPACE_ASSETS_DIRECTORY, 'assets', file)
      if (!fs.existsSync(assetPath)) return c.text('Not found', 404)
      return c.body(fs.readFileSync(assetPath), 200, {
        'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      })
    },
  }),

  registerApiRoute('/playground', {
    method: 'GET',
    handler: async c => c.html(preparePage(fs.readFileSync(CONSOLE_PAGE_FILE, 'utf8'))),
  }),

  registerApiRoute('/setup', {
    method: 'GET',
    handler: async c => c.html(preparePage(fs.readFileSync(SETUP_PAGE_FILE, 'utf8'))),
  }),

  registerApiRoute('/aurabrain/settings', {
    method: 'GET',
    handler: c => c.redirect('/aurabrain/settings/models', 302),
  }),

  registerApiRoute('/aurabrain/settings/models', {
    method: 'GET',
    handler: async c => c.html(preparePage(fs.readFileSync(MODEL_SETTINGS_PAGE_FILE, 'utf8'))),
  }),

  registerApiRoute('/aurabrain/settings/capabilities', {
    method: 'GET',
    handler: async c => c.html(preparePage(fs.readFileSync(CAPABILITIES_PAGE_FILE, 'utf8'))),
  }),

  registerApiRoute('/recommend', {
    method: 'GET',
    handler: async c => c.html(preparePage(fs.readFileSync(RECOMMEND_PAGE_FILE, 'utf8'))),
  }),

  registerApiRoute('/v1/capabilities/settings', {
    method: 'GET',
    handler: async c => c.json(loadCapabilitySettings()),
  }),

  registerApiRoute('/v1/capabilities/settings', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json() as any
        const mode = (value: unknown): CapabilityDataMode => value === 'demo' ? 'demo' : 'real'
        saveCapabilitySettings({
          mail: { enabled: body.mail?.enabled !== false, dataMode: mode(body.mail?.dataMode) },
          calendar: { enabled: body.calendar?.enabled !== false, dataMode: mode(body.calendar?.dataMode) },
        })
        return c.json({ ok: true, settings: loadCapabilitySettings() })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 400)
      }
    },
  }),

  registerApiRoute('/v1/capabilities/mail', {
    method: 'GET',
    handler: async c => c.json(await readCapabilityMail(Number(c.req.query('limit') || 8))),
  }),

  registerApiRoute('/v1/capabilities/calendar', {
    method: 'GET',
    handler: async c => c.json(await readCapabilityCalendar(Number(c.req.query('days') || 14))),
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

  registerApiRoute('/admin/native-devices', {
    method: 'GET',
    handler: async c => {
      const devices = listNativeDevices().map(device => ({ ...device, online: isNativeDeviceOnline(device) }))
      return c.json({ ok: true, devices })
    },
  }),

  registerApiRoute('/v1/native-devices/register', {
    method: 'POST',
    handler: async c => {
      const body = await c.req.json().catch(() => ({})) as { id?: string; name?: string; mac?: string; firmware?: string }
      if (!body.id?.trim()) return c.json({ ok: false, error: '缺少设备 ID' }, 400)
      const device = registerNativeDevice({ id: body.id.trim(), name: body.name?.trim(), mac: body.mac, firmware: body.firmware })
      return c.json({ ok: true, device, runtime: { protocol: 1, heartbeatMs: 10_000, pollPath: `/v1/native-devices/${device.id}/commands` } })
    },
  }),

  registerApiRoute('/v1/native-devices/:id/heartbeat', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json().catch(() => ({})) as { ip?: string; firmware?: string }
        return c.json({ ok: true, device: touchNativeDevice(c.req.param('id'), body) })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 404)
      }
    },
  }),

  registerApiRoute('/v1/native-devices/:id/commands', {
    method: 'GET',
    handler: async c => {
      try {
        const command = await waitForNativeCommand(c.req.param('id'), Math.min(Number(c.req.query('waitMs') || 25_000), 25_000))
        return command ? c.json({ ok: true, command: { id: command.id, command: command.command, params: command.params } }) : c.body(null, 204)
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 404)
      }
    },
  }),

  registerApiRoute('/v1/native-devices/:id/commands/:commandId/result', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json().catch(() => ({}))
        const accepted = completeNativeCommand(c.req.param('id'), c.req.param('commandId'), body)
        return c.json({ ok: accepted }, accepted ? 200 : 404)
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 404)
      }
    },
  }),

  registerApiRoute('/admin/native-devices/:id/command', {
    method: 'POST',
    handler: async c => {
      const device = getNativeDevice(c.req.param('id'))
      const body = await c.req.json().catch(() => ({})) as { command?: string; params?: Record<string, unknown> }
      if (!body.command?.trim()) return c.json({ ok: false, error: '缺少设备命令' }, 400)
      const result = await Promise.race([
        enqueueNativeCommand(device.id, body.command.trim(), body.params || {}),
        new Promise(resolve => setTimeout(() => resolve({ ok: false, error: '设备未在 30 秒内取走命令' }), 30_000)),
      ])
      return c.json(result)
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

  // ---------- 机器扫描 ----------
  registerApiRoute('/admin/scan/machine', {
    method: 'GET',
    handler: async c => {
      try {
        const machine = await scanMachine()
        return c.json({ ok: true, machine })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 500)
      }
    },
  }),

  // ---------- 模型推荐 ----------
  registerApiRoute('/admin/recommend', {
    method: 'GET',
    handler: async c => {
      try {
        const useCase = (c.req.query('useCase') || 'general') as UseCase
        const preferLocal = c.req.query('preferLocal') !== 'false'
        const validUseCases: UseCase[] = ['coding', 'general', 'vision', 'long-context']
        if (!validUseCases.includes(useCase)) {
          return c.json({ ok: false, error: `无效用途：${useCase}（可选 ${validUseCases.join('/')})` }, 400)
        }
        const machine = await scanMachine()
        const result = recommendModels(machine, useCase, preferLocal)
        return c.json({ ok: true, ...result, machine })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 500)
      }
    },
  }),

  // ---------- 一键部署 ----------
  registerApiRoute('/admin/deploy', {
    method: 'POST',
    handler: async c => {
      try {
        const body = await c.req.json() as DeployRequest
        if (!body.modelId || !body.modelName || !body.source) {
          return c.json({ ok: false, error: '缺少 modelId / modelName / source' }, 400)
        }
        const result = await deployModel(body)
        return c.json(result)
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 500)
      }
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

  // 统一模型透传入口：文本、多轮消息、图片和流式输出都从这里进入 Runtime。
  registerApiRoute('/v1/chat', {
    method: 'POST',
    handler: modelChatHandler,
  }),

  registerApiRoute('/admin/model-chat', {
    method: 'POST',
    handler: modelChatHandler,
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

  // ---------- 任务控制台（SSE 实时推送执行过程） ----------
  registerApiRoute('/admin/task', {
    method: 'POST',
    handler: async c => {
      const body = (await c.req.json().catch(() => ({}))) as { task?: string }
      const task = body.task?.trim()
      if (!task) return c.json({ ok: false, error: '任务不能为空' }, 400)

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          let closed = false
          const send = (ev: Record<string, unknown>) => {
            if (closed) return
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
            } catch { /* stream already closed */ }
          }
          // 心跳：每 20s 一条注释帧，防代理断连
          const hb = setInterval(() => {
            if (closed) return
            try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)) } catch { /* ignore */ }
          }, 20_000)
          c.req.raw.signal.addEventListener('abort', () => {
            closed = true
            clearInterval(hb)
            try { controller.close() } catch { /* ignore */ }
          })
          try {
            await runTask(task, send, c.req.raw.signal)
          } catch (error: any) {
            send({ type: 'error', error: error?.message || String(error) })
          } finally {
            closed = true
            clearInterval(hb)
            try { controller.close() } catch { /* ignore */ }
          }
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

  // ---------- 能力中心 ----------
  registerApiRoute('/admin/capabilities', {
    method: 'GET',
    handler: async c => {
      const config = loadConfig()
      if (!config.mcpServers) {
        config.mcpServers = defaultMcpServers()
        saveConfig(config)
      }
      const mcp = await getMcpStatus()
      return c.json({
        ok: true,
        capabilities: getCapabilityFlags(),
        mcpServers: mcp,
      })
    },
  }),

  registerApiRoute('/admin/capabilities/mcp', {
    method: 'POST',
    handler: async c => {
      const body = (await c.req.json().catch(() => ({}))) as {
        name?: string
        action?: 'enable' | 'disable' | 'retry'
        enabled?: boolean
      }
      const name = body.name?.trim()
      if (!name) return c.json({ ok: false, error: '缺少 MCP 服务器名称' }, 400)
      try {
        if (body.action === 'retry') {
          const state = await retryMcpServer(name)
          return c.json({ ok: state.status === 'ready', name, status: state.status, error: state.error, toolCount: state.toolNames.length })
        }
        const enabled = body.action === 'enable' ? true : body.action === 'disable' ? false : Boolean(body.enabled)
        const state = await setMcpEnabled(name, enabled)
        return c.json({ ok: true, name, enabled: state.status !== 'disabled', status: state.status, error: state.error, toolCount: state.toolNames.length })
      } catch (error: any) {
        return c.json({ ok: false, error: error?.message || String(error) }, 400)
      }
    },
  }),

  registerApiRoute('/admin/capabilities/flags', {
    method: 'POST',
    handler: async c => {
      const body = (await c.req.json().catch(() => ({}))) as {
        browser?: boolean
        filesystem?: boolean
      }
      const config = loadConfig()
      const caps = config.capabilities ?? {}
      if (typeof body.browser === 'boolean') caps.browser = body.browser
      if (typeof body.filesystem === 'boolean') caps.filesystem = body.filesystem
      config.capabilities = caps
      saveConfig(config)
      return c.json({ ok: true, capabilities: getCapabilityFlags() })
    },
  }),
]
