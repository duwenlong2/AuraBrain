// ============================================================
//  AuraBrain Runtime · 模型一键部署
//  本地（Ollama）：ollama pull → 写入 AuraBrain 配置 → 设默认 → 测试连通
//  云端：写入 AuraBrain 配置（用户填 API Key）→ 设默认
//  部署 = 拉模型 + 写配置 + 设默认 + 自动测试，一条龙。
// ============================================================
import { execFile } from 'node:child_process'
import { loadConfig, saveConfig, type AuraBrainConfig } from './config-store.ts'
import { setSecret } from './secret-store.ts'

export interface DeployRequest {
  /** 模型标识（Ollama tag 或云端 model id） */
  modelId: string
  /** 显示名 */
  modelName: string
  /** 来源 */
  source: 'local' | 'cloud'
  /** 运行时（本地时，目前只支持 ollama） */
  runtime?: string
  /** 云端 API 地址（source=cloud 时必填） */
  baseUrl?: string
  /** 云端 API Key（source=cloud 时可选，留空则用已有） */
  apiKey?: string
  /** 是否支持视觉 */
  vision?: boolean
  /** 是否拉取本地模型（source=local 时默认 true） */
  pull?: boolean
}

export interface DeployStep {
  label: string
  ok: boolean
  detail?: string
}

export interface DeployResult {
  ok: boolean
  defaultModel: string | null
  steps: DeployStep[]
  error?: string
}

// ---------- Ollama 工具 ----------

function runOllama(args: string[], timeoutMs = 300_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: false, stdout: '', stderr: `timeout after ${timeoutMs}ms` })
      }
    }, timeoutMs)
    execFile('ollama', args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || (error ? String(error) : '') })
    })
  })
}

async function ollamaReachable(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await fetch('http://127.0.0.1:11434/api/version', { signal: controller.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function ollamaHasModel(modelId: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return false
    const data: any = await res.json()
    return (data.models || []).some((m: any) => m.name === modelId || m.name.startsWith(`${modelId}:`))
  } catch {
    return false
  }
}

// ---------- 配置写入 ----------

function upsertProvider(config: AuraBrainConfig, providerId: string, providerName: string, baseUrl: string, modelId: string, modelName: string, vision: boolean, apiKeyRef: string | undefined): AuraBrainConfig {
  const providers = (config.models?.providers || []).filter(p => p.id !== providerId)
  providers.push({
    id: providerId,
    name: providerName,
    apiType: 'chat-completions',
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKeyRef,
    models: [{ id: modelId, name: modelName, vision }],
  })
  return {
    ...config,
    models: {
      ...config.models,
      default: `${providerId}/${modelId}`,
      providers,
    },
  }
}

// ---------- 主入口 ----------

export async function deployModel(req: DeployRequest): Promise<DeployResult> {
  const steps: DeployStep[] = []
  const push = (label: string, ok: boolean, detail?: string) => steps.push({ label, ok, detail })

  try {
    if (req.source === 'local') {
      // ---- 本地 Ollama 部署 ----
      if ((req.runtime || 'ollama') !== 'ollama') {
        return { ok: false, defaultModel: null, steps, error: `暂不支持的本地运行时：${req.runtime}（目前只支持 Ollama）` }
      }

      // 1. 检查 Ollama 是否可达
      const reachable = await ollamaReachable()
      if (!reachable) {
        push('检查 Ollama', false, 'Ollama 未运行（127.0.0.1:11434 不可达）。请先启动 Ollama。')
        return { ok: false, defaultModel: null, steps, error: 'Ollama 未运行，请先启动 Ollama 服务' }
      }
      push('检查 Ollama', true, 'Ollama 服务已连接')

      // 2. 拉取模型（如需要）
      const shouldPull = req.pull !== false
      if (shouldPull) {
        const has = await ollamaHasModel(req.modelId)
        if (has) {
          push('拉取模型', true, `${req.modelId} 已存在，跳过下载`)
        } else {
          push('拉取模型', true, `正在下载 ${req.modelId}（可能耗时较长）…`)
          const pull = await runOllama(['pull', req.modelId], 600_000)
          if (!pull.ok) {
            push('拉取模型', false, `下载失败：${pull.stderr.slice(0, 200)}`)
            return { ok: false, defaultModel: null, steps, error: `ollama pull 失败：${pull.stderr.slice(0, 200)}` }
          }
          // 更新最后一条 step 的 detail
          steps[steps.length - 1].detail = `已下载 ${req.modelId}`
        }
      } else {
        push('拉取模型', true, '跳过下载（使用已有模型）')
      }

      // 3. 写入 AuraBrain 配置
      const config = loadConfig()
      const baseUrl = 'http://127.0.0.1:11434/v1'
      const providerId = 'ollama'
      const updated = upsertProvider(config, providerId, 'Ollama (本地)', baseUrl, req.modelId, req.modelName, Boolean(req.vision), undefined)
      saveConfig(updated)
      push('写入配置', true, `已注册 Ollama 提供商，默认模型 ${providerId}/${req.modelId}`)

      // 4. 测试连通
      const testOk = await testChatCompletion(baseUrl, req.modelId, null)
      push('测试连通', testOk, testOk ? '模型响应正常' : '模型响应异常，请确认模型已加载')

      return { ok: true, defaultModel: `${providerId}/${req.modelId}`, steps }
    } else {
      // ---- 云端部署 ----
      if (!req.baseUrl) {
        return { ok: false, defaultModel: null, steps, error: '云端部署需要 API 地址（baseUrl）' }
      }

      // 1. 写入配置
      const config = loadConfig()
      const providerId = req.modelId.split('/')[0] || 'cloud'
      const apiKeyRef = req.apiKey?.trim() ? `model.${providerId}.apiKey` : config.models?.providers?.find(p => p.id === providerId)?.apiKeyRef
      if (req.apiKey?.trim() && apiKeyRef) {
        await setSecret(apiKeyRef, req.apiKey.trim())
      }
      const updated = upsertProvider(config, providerId, req.modelName, req.baseUrl, req.modelId, req.modelName, Boolean(req.vision), apiKeyRef)
      saveConfig(updated)
      push('写入配置', true, `已注册云端提供商，默认模型 ${providerId}/${req.modelId}`)

      // 2. 测试连通（如有 key）
      const key = apiKeyRef ? (await import('./secret-store.ts')).getSecret(apiKeyRef) : null
      const testOk = await testChatCompletion(req.baseUrl.replace(/\/$/, ''), req.modelId, key)
      push('测试连通', testOk, testOk ? '模型响应正常' : (key ? '模型响应异常' : '未配置 API Key，跳过实际测试'))

      return { ok: true, defaultModel: `${providerId}/${req.modelId}`, steps }
    }
  } catch (error: any) {
    push('部署', false, error?.message || String(error))
    return { ok: false, defaultModel: null, steps, error: error?.message || String(error) }
  }
}

// ---------- 连通测试 ----------

async function testChatCompletion(baseUrl: string, modelId: string, apiKey: string | null): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 8 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return false
    const data: any = await res.json()
    return Boolean(data?.choices?.[0]?.message?.content)
  } catch {
    return false
  }
}
