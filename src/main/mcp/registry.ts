// ============================================================
//  AuraBrain Runtime · MCP 注册表（故障隔离 + 热加载）
//
//  设计目标：MCP 是"上层能力"，坏了只影响它自己，绝不拖垮 Agent。
//  四层隔离：
//   1. 加载隔离 —— 每个 MCP 一个独立 MCPClient，各自 try/catch，
//      一个连不上不影响其它 MCP，更不影响通用能力（浏览器/文件/搜索）。
//   2. 工具预算 —— 只把"健康且启用"的 MCP 工具通过 toolsets 挂给 Agent，
//      控制本地模型的上下文体积。
//   3. 调用隔离 —— 每个服务器独立超时（config.timeout），调用卡死可被切断。
//   4. 修复路径 —— 能力中心可一键 禁用 / 重试 / 重连，无需重启 Runtime。
//
//  热加载：通用工具（浏览器/文件）在 Agent 构造时静态挂载；
//  MCP 工具在每次 agent.stream() 时通过 toolsets 动态传入，
//  所以启用/禁用 MCP 立即生效，无需重建 Agent。
// ============================================================
import { loadConfig, type McpServerConfig } from '../lib/config-store.ts'

export type McpServerStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'disabled'

export interface McpServerState {
  name: string
  config: McpServerConfig
  client: any | null
  /** 已加服务器前缀的工具表：`${name}_${toolName}` -> tool */
  tools: Record<string, any>
  status: McpServerStatus
  error: string | null
  toolNames: string[]
  lastChecked: number | null
}

interface McpRegistry {
  servers: Map<string, McpServerState>
}

let registry: McpRegistry | null = null

function getRegistry(): McpRegistry {
  if (!registry) registry = { servers: new Map() }
  return registry
}

/** 从 config 读取某服务器配置（不存在返回 null） */
function readServerConfig(name: string): McpServerConfig | null {
  const servers = loadConfig().mcpServers
  return servers?.[name] ?? null
}

/** 把单个服务器配置转成 MCPClient 的 server definition */
function toServerDefinition(name: string, config: McpServerConfig): any {
  if (config.command) {
    return {
      command: config.command,
      args: config.args ?? [],
      ...(config.env ? { env: config.env } : {}),
    }
  }
  if (config.url) {
    return {
      url: new URL(config.url),
      ...(config.headers ? { requestInit: { headers: config.headers } } : {}),
    }
  }
  throw new Error(`MCP 服务器 ${name} 缺少 command 或 url 配置`)
}

async function createClient(name: string, config: McpServerConfig): Promise<any> {
  const { MCPClient } = await import('@mastra/mcp')
  const definition = toServerDefinition(name, config)
  return new MCPClient({
    id: `aurabrain-mcp-${name}`,
    servers: { [name]: definition },
    timeout: config.timeout ?? 30_000,
  })
}

/** 确保某服务器在注册表里有状态（懒创建 client） */
function ensureServer(name: string): McpServerState {
  const reg = getRegistry()
  let state = reg.servers.get(name)
  const config = readServerConfig(name)
  if (!config) throw new Error(`MCP 服务器 ${name} 未在 config.json 中配置`)

  if (state) {
    state.config = config
    return state
  }

  state = {
    name,
    config,
    client: null,
    tools: {},
    status: 'idle',
    error: null,
    toolNames: [],
    lastChecked: null,
  }
  reg.servers.set(name, state)
  return state
}

/**
 * 连接（或重连）单个服务器并拉取工具列表。
 * 失败只把该服务器标记为 error，不抛给调用方。
 */
async function refreshServer(name: string): Promise<McpServerState> {
  const state = ensureServer(name)
  const config = state.config

  if (!config.enabled) {
    state.status = 'disabled'
    state.tools = {}
    state.toolNames = []
    state.error = null
    return state
  }

  state.status = 'connecting'
  state.error = null
  try {
    // 每个服务器独立 client（id 用服务器名，避免同配置实例冲突）
    const client = await createClient(name, config)
    state.client = client

    const { toolsets, errors } = await client.listToolsetsWithErrors()
    const rawTools = toolsets?.[name] ?? {}
    const serverError = errors?.[name]

    if (serverError) {
      state.status = 'error'
      state.error = serverError
      state.tools = {}
      state.toolNames = []
      return state
    }

    // 加服务器前缀，避免跨服务器同名工具冲突
    const prefixed: Record<string, any> = {}
    for (const [toolName, tool] of Object.entries(rawTools)) {
      prefixed[`${name}_${toolName}`] = tool
    }
    state.tools = prefixed
    state.toolNames = Object.keys(prefixed)
    state.status = 'ready'
    state.lastChecked = Date.now()
    console.log(`[MCP] ${name} 就绪，${state.toolNames.length} 个工具`)
  } catch (error: any) {
    state.status = 'error'
    state.error = error?.message || String(error)
    state.tools = {}
    state.toolNames = []
    console.error(`[MCP] ${name} 连接失败: ${state.error}`)
  }
  return state
}

/** 刷新所有已启用的服务器（并行，互不影响） */
export async function refreshAllMcpServers(): Promise<void> {
  const servers = loadConfig().mcpServers ?? {}
  const names = Object.keys(servers).filter(name => servers[name].enabled)
  await Promise.all(names.map(name => refreshServer(name).catch(() => ensureServer(name))))
}

/**
 * 组装传给 agent.stream() 的 toolsets。
 * 只包含"健康且启用"的服务器；坏掉的服务器被跳过，Agent 降级但不崩溃。
 * 返回 { [serverName]: { [prefixedToolName]: tool } }
 */
export async function getMcpToolsets(): Promise<Record<string, Record<string, any>>> {
  const servers = loadConfig().mcpServers ?? {}
  const result: Record<string, Record<string, any>> = {}
  for (const name of Object.keys(servers)) {
    if (!servers[name].enabled) continue
    const state = await refreshServer(name).catch(() => ensureServer(name))
    if (state.status === 'ready' && Object.keys(state.tools).length > 0) {
      result[name] = state.tools
    }
  }
  return result
}

/** 能力中心展示用的状态列表 */
export async function getMcpStatus(): Promise<Array<{
  name: string
  displayName: string
  type: 'stdio' | 'http'
  enabled: boolean
  status: McpServerStatus
  error: string | null
  toolCount: number
  tools: string[]
  lastChecked: number | null
}>> {
  const servers = loadConfig().mcpServers ?? {}
  const out: Array<{
    name: string
    displayName: string
    type: 'stdio' | 'http'
    enabled: boolean
    status: McpServerStatus
    error: string | null
    toolCount: number
    tools: string[]
    lastChecked: number | null
  }> = []
  for (const [name, config] of Object.entries(servers)) {
    const state = ensureServer(name)
    // 若从未检查过，触发一次刷新
    if (state.lastChecked === null && config.enabled) {
      await refreshServer(name).catch(() => {})
    }
    out.push({
      name,
      displayName: config.name || name,
      type: config.command ? 'stdio' : 'http',
      enabled: Boolean(config.enabled),
      status: state.status,
      error: state.error,
      toolCount: state.toolNames.length,
      tools: state.toolNames,
      lastChecked: state.lastChecked,
    })
  }
  return out
}

/** 一键启用/禁用（立即生效，无需重启） */
export async function setMcpEnabled(name: string, enabled: boolean): Promise<McpServerState> {
  const config = readServerConfig(name)
  if (!config) throw new Error(`MCP 服务器 ${name} 未配置`)
  config.enabled = enabled
  const { saveConfig } = await import('../lib/config-store.ts')
  const full = loadConfig()
  full.mcpServers = { ...full.mcpServers, [name]: config }
  saveConfig(full)
  // 禁用时断开连接释放资源
  if (!enabled && registry?.servers.get(name)?.client) {
    try { await registry.servers.get(name)!.client.disconnect() } catch { /* ignore */ }
    registry.servers.get(name)!.client = null
  }
  return refreshServer(name)
}

/** 一键重试（重新连接 + 拉工具） */
export async function retryMcpServer(name: string): Promise<McpServerState> {
  const state = ensureServer(name)
  if (state.client) {
    try { await state.client.disconnect() } catch { /* ignore */ }
    state.client = null
  }
  return refreshServer(name)
}

/** 断开所有连接（Runtime 停止时调用） */
export async function disconnectAllMcp(): Promise<void> {
  if (!registry) return
  await Promise.all(
    [...registry.servers.values()].map(async state => {
      if (state.client) {
        try { await state.client.disconnect() } catch { /* ignore */ }
        state.client = null
      }
    }),
  )
}
