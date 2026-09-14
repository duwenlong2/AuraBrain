// ============================================================
//  AuraBrain Runtime · 默认 Agent（通用任务执行体）
//
//  定位：这台电脑就是 Agent 的"身体"。
//  - 浏览器（AgentBrowser）：独立 Chromium + 独立 profile，不碰用户浏览器
//  - 文件系统（Workspace）：LocalFilesystem + LocalSandbox，限定在工作目录
//  - 模型：从 config.json 的默认模型动态解析（支持本地/云端）
//  - MCP 工具：不在此处静态挂载，而是每次 stream 时通过 toolsets 动态传入
//    （见 mcp/registry.ts），实现热加载 + 故障隔离
//
//  通用能力是"底座"，永远在场；MCP 是"上层"，坏了只降级不崩溃。
// ============================================================
import os from 'node:os'
import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import { ModelRouterLanguageModel } from '@mastra/core/llm'
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace'
import { AgentBrowser } from '@mastra/agent-browser'
import { loadConfig } from '../lib/config-store.ts'
import { getSecret } from '../lib/secret-store.ts'

/** AuraBrain 数据根目录（%APPDATA%\AuraBrain） */
export function dataRoot(): string {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(roaming, 'AuraBrain')
}

/** 浏览器独立 profile 目录（与用户浏览器完全隔离） */
export function browserProfileDir(): string {
  return path.join(dataRoot(), 'browser-profile')
}

/** 工作区根目录（Agent 文件操作的默认落点） */
export function workspaceDir(): string {
  return path.join(dataRoot(), 'workspace')
}

/**
 * 从 config.json 解析默认模型。
 * 返回 ModelRouterLanguageModel 实例；未配置时返回 null。
 * 模型 ID 形如 `providerId/modelId`，baseUrl + apiKey 来自对应 provider。
 */
export async function resolveDefaultModel(): Promise<any | null> {
  const config = loadConfig()
  const defaultId = config.models?.default
  if (!defaultId) return null

  const [providerId, ...rest] = defaultId.split('/')
  const modelId = rest.join('/')
  const provider = config.models?.providers?.find(p => p.id === providerId)
  if (!provider || !modelId) return null

  const apiKey = provider.apiKeyRef ? await getSecret(provider.apiKeyRef) : null
  return new ModelRouterLanguageModel({
    id: `${providerId}/${modelId}`,
    url: provider.baseUrl,
    ...(apiKey ? { apiKey } : {}),
  })
}

/** 浏览器能力开关（能力中心可关） */
function browserEnabled(): boolean {
  return loadConfig().capabilities?.browser !== false
}

/** 文件系统能力开关（能力中心可关） */
function filesystemEnabled(): boolean {
  return loadConfig().capabilities?.filesystem !== false
}

/** 构建浏览器实例（独立 Chromium + 独立 profile） */
function buildBrowser(): AgentBrowser {
  return new AgentBrowser({
    headless: false,
    scope: 'shared',
    profile: browserProfileDir(),
    viewport: { width: 1280, height: 800 },
    timeout: 30_000,
  })
}

/** 构建工作区（文件系统 + 本地沙箱，限定在 workspace 目录） */
function buildWorkspace(): Workspace {
  const base = workspaceDir()
  return new Workspace({
    id: 'aurabrain-workspace',
    name: 'AuraBrain Workspace',
    filesystem: new LocalFilesystem({ basePath: base, contained: true }),
    sandbox: new LocalSandbox({ workingDirectory: base }),
  })
}

const INSTRUCTIONS = `你是 AuraBrain，运行在这台电脑上的本地 AI 运行时。这台电脑就是你的"身体"：你可以操作浏览器、读写工作区文件、联网搜索，并调用已接入的 MCP 能力。

工作原则：
1. 先理解用户目标，再选择合适的能力。一个任务可能需要多轮工具调用，也可能一次就够。
2. 操作浏览器时，优先用 browser_snapshot 获取页面结构（带 @e1、@e2 等元素引用），再用引用去点击/输入，比靠坐标更稳。
3. 涉及登录、支付、删除等敏感或不可逆操作时，先停下来向用户确认，不要擅自执行。
4. 如果某个能力（如某个 MCP）不可用或报错，不要卡死：说明情况，改用其它可用能力，或明确告诉用户缺什么。
5. 完成操作后尽量验证结果（例如截图、读取文件、检查页面状态），再向用户汇报。
6. 用中文回答，简洁直接。不要编造工具没有返回的事实。`

let cachedAgent: Agent | null = null
let cachedFlags: { browser: boolean; filesystem: boolean } | null = null

/**
 * 获取（或构建）默认 Agent。
 * - 模型：动态解析（每次执行读 config），切换默认模型无需重启。
 * - 浏览器/工作区：随 Agent 缓存复用，避免每个任务重启 Chromium。
 * - 仅当基础能力开关变化时重建 Agent（并关闭旧浏览器）。
 */
export async function getDefaultAgent(): Promise<Agent> {
  const flags = getCapabilityFlags()

  if (cachedAgent && cachedFlags && cachedFlags.browser === flags.browser && cachedFlags.filesystem === flags.filesystem) {
    return cachedAgent
  }

  // 开关变化或首次：关闭旧浏览器，重建
  if (cachedAgent) {
    try { await (cachedAgent as any).browser?.close?.() } catch { /* ignore */ }
  }

  const agent = new Agent({
    id: 'aurabrain-default',
    name: 'AuraBrain',
    description: 'AuraBrain 通用任务 Agent：操作本机浏览器、文件、联网搜索，并调用已接入的 MCP 能力。',
    instructions: INSTRUCTIONS,
    // 动态模型：每次执行时从 config 解析，未配置则抛清晰错误
    model: async () => {
      const model = await resolveDefaultModel()
      if (!model) {
        throw new Error('尚未配置默认模型。请先在「模型工作台」导入并设置默认模型。')
      }
      return model
    },
    ...(flags.browser ? { browser: buildBrowser() } : {}),
    ...(flags.filesystem ? { workspace: buildWorkspace() } : {}),
    defaultOptions: {
      // 防止模型陷入无限工具调用的保险上限
      maxSteps: 24,
    },
  })

  cachedAgent = agent
  cachedFlags = flags
  return agent
}

/** 当前能力开关快照（能力中心展示用） */
export function getCapabilityFlags(): { browser: boolean; filesystem: boolean } {
  return {
    browser: browserEnabled(),
    filesystem: filesystemEnabled(),
  }
}

/** 关闭浏览器并清除 Agent 缓存（Runtime 停止时调用） */
export async function shutdownDefaultAgent(): Promise<void> {
  if (cachedAgent) {
    try { await (cachedAgent as any).browser?.close?.() } catch { /* ignore */ }
    cachedAgent = null
    cachedFlags = null
  }
}
