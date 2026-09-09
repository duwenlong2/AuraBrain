import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AuraBrainConfig {
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