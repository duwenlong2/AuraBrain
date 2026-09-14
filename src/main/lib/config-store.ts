import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AuraBrainConfig {
  capabilities?: {
    mail?: {
      enabled?: boolean
      dataMode?: 'real' | 'demo'
    }
    calendar?: {
      enabled?: boolean
      dataMode?: 'real' | 'demo'
    }
    browser?: boolean
    filesystem?: boolean
    webSearch?: boolean
  }
  models?: {
    default?: string
    providers?: Array<{
      id: string
      name: string
      apiType: 'chat-completions' | 'responses'
      baseUrl: string
      apiKeyRef?: string
      models: Array<{
        id: string
        name: string
        vision?: boolean
        thinking?: boolean
        maxInputTokens?: number
        maxOutputTokens?: number
      }>
    }>
  }
  graph?: {
    clientId?: string
    tenantId?: string
  }
  imap?: {
    host?: string
    port?: number
    tls?: boolean
    mailbox?: string
    rejectUnauthorized?: boolean
    userKey?: string
    passwordKey?: string
  }
  /**
   * MCP 服务器配置（能力中心管理）。
   * 每个服务器独立连接、独立故障隔离：某个 MCP 挂了只影响它自己，
   * 通用能力（浏览器/文件/搜索）不受影响。
   */
  mcpServers?: Record<string, McpServerConfig>
}

/**
 * 单个 MCP 服务器配置。
 * - stdio：本地进程（command + args + env）
 * - http：远程/本地 HTTP 端点（url + headers）
 */
export interface McpServerConfig {
  /** 显示名称（能力中心展示用） */
  name?: string
  /** 是否启用（一键禁用/启用的开关） */
  enabled?: boolean
  /** stdio 模式：启动命令 */
  command?: string
  /** stdio 模式：命令参数 */
  args?: string[]
  /** stdio 模式：环境变量 */
  env?: Record<string, string>
  /** http 模式：端点 URL */
  url?: string
  /** http 模式：请求头（如 Authorization） */
  headers?: Record<string, string>
  /** 连接/调用超时（毫秒），默认 30000 */
  timeout?: number
}

function userConfigPath(): string {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(roaming, 'AuraBrain', 'config.json')
}

const LEGACY_CONFIG_CANDIDATES = [
  path.resolve(process.cwd(), '.aurabrain/config.json'),
]

function configPath(): string {
  return [userConfigPath(), ...LEGACY_CONFIG_CANDIDATES].find(candidate => fs.existsSync(candidate)) || userConfigPath()
}

function sanitizeConfig(config: AuraBrainConfig): AuraBrainConfig {
  const models = config.models
  return {
    ...config,
    models: models
      ? {
          ...models,
          providers: models.providers?.map(provider => {
            const persistedProvider = provider as typeof provider & { apiKey?: unknown; secret?: unknown }
            const { apiKey: _apiKey, secret: _secret, ...safeProvider } = persistedProvider
            return safeProvider
          }),
        }
      : undefined,
  }
}

export function loadConfig(): AuraBrainConfig {
  try {
    return sanitizeConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8')) as AuraBrainConfig)
  } catch {
    return {}
  }
}

export function saveConfig(config: AuraBrainConfig): void {
  config = sanitizeConfig(config)
  const filePath = userConfigPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporaryPath, filePath)
}

/** 默认 MCP 服务器种子。仅在 config.json 还没有 mcpServers 时由能力中心写入。 */
export function defaultMcpServers(): Record<string, McpServerConfig> {
  return {
    parallel: {
      name: 'Parallel Web Search',
      enabled: true,
      url: 'https://search.parallel.ai/mcp',
      timeout: 30_000,
    },
  }
}