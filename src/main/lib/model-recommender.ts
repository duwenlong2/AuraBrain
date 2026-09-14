// ============================================================
//  AuraBrain Runtime · 模型推荐引擎
//  输入：机器扫描结果 + 用途 + 偏好（本地/云端）
//  输出：带理由的排序推荐（本地 Ollama 模型 + 云端 API 模型）
//
//  设计原则：
//  - 诚实：硬件不够就明说，不硬推本地大模型
//  - 规则透明：每条推荐都给出"为什么"
//  - 可解释：显存/内存需求写清楚
// ============================================================
import type { MachineInfo } from './machine-scan.ts'

export type UseCase = 'coding' | 'general' | 'vision' | 'long-context'

export interface Recommendation {
  /** 展示名 */
  name: string
  /** 模型标识（Ollama tag 或云端 model id） */
  id: string
  /** 来源 */
  source: 'local' | 'cloud'
  /** 运行时（本地时） */
  runtime: string
  /** 用途标签 */
  useCase: UseCase
  /** 推荐理由 */
  reason: string
  /** 显存/内存需求（GB） */
  vramRequiredGb: number
  /** 是否支持视觉 */
  vision: boolean
  /** 上下文窗口（token） */
  contextTokens: number
  /** 综合得分（0-100，越高越推荐） */
  score: number
  /** 是否能在本机跑（本地模型） */
  fitsMachine: boolean
  /** 部署命令（本地时，如 ollama pull xxx） */
  deployCommand: string | null
}

export interface RecommendationResult {
  localViability: 'excellent' | 'good' | 'limited' | 'poor'
  viabilityNote: string
  recommendations: Recommendation[]
  machineSummary: string
}

// ---------- 模型目录 ----------
// vramRequiredGb 是 FP16/INT8 量化后的大致需求（Ollama 默认 Q4 会更省）

interface CatalogEntry {
  name: string
  id: string
  source: 'local' | 'cloud'
  runtime: string
  useCases: UseCase[]
  vramRequiredGb: number
  vision: boolean
  contextTokens: number
  blurb: string
}

const CATALOG: CatalogEntry[] = [
  // ---- 编码 ----
  { name: 'Qwen2.5-Coder 32B', id: 'qwen2.5-coder:32b', source: 'local', runtime: 'ollama', useCases: ['coding'], vramRequiredGb: 20, vision: false, contextTokens: 32768, blurb: '编码能力强，适合复杂代码任务' },
  { name: 'Qwen2.5-Coder 14B', id: 'qwen2.5-coder:14b', source: 'local', runtime: 'ollama', useCases: ['coding'], vramRequiredGb: 9, vision: false, contextTokens: 32768, blurb: '编码/速度平衡，多数场景够用' },
  { name: 'Qwen2.5-Coder 7B', id: 'qwen2.5-coder:7b', source: 'local', runtime: 'ollama', useCases: ['coding'], vramRequiredGb: 5, vision: false, contextTokens: 32768, blurb: '轻量编码，低配机器首选' },
  { name: 'DeepSeek-Coder-V2 16B', id: 'deepseek-coder-v2:16b', source: 'local', runtime: 'ollama', useCases: ['coding'], vramRequiredGb: 10, vision: false, contextTokens: 163840, blurb: '长上下文编码，适合大仓库' },
  { name: 'Qwen3-Coder (云端)', id: 'qwen3-coder', source: 'cloud', runtime: 'azure-openai', useCases: ['coding'], vramRequiredGb: 0, vision: false, contextTokens: 262144, blurb: '云端最强编码，无需本地算力' },

  // ---- 通用 ----
  { name: 'Qwen2.5 32B', id: 'qwen2.5:32b', source: 'local', runtime: 'ollama', useCases: ['general'], vramRequiredGb: 20, vision: false, contextTokens: 131072, blurb: '通用能力强，本地旗舰' },
  { name: 'Qwen2.5 14B', id: 'qwen2.5:14b', source: 'local', runtime: 'ollama', useCases: ['general'], vramRequiredGb: 9, vision: false, contextTokens: 131072, blurb: '通用均衡，性价比之选' },
  { name: 'Qwen2.5 7B', id: 'qwen2.5:7b', source: 'local', runtime: 'ollama', useCases: ['general', 'long-context'], vramRequiredGb: 5, vision: false, contextTokens: 131072, blurb: '轻量通用，128k 长上下文' },
  { name: 'Llama 3.1 8B', id: 'llama3.1:8b', source: 'local', runtime: 'ollama', useCases: ['general', 'long-context'], vramRequiredGb: 5, vision: false, contextTokens: 131072, blurb: 'Meta 通用模型，生态成熟' },
  { name: 'Gemma 2 9B', id: 'gemma2:9b', source: 'local', runtime: 'ollama', useCases: ['general'], vramRequiredGb: 6, vision: false, contextTokens: 8192, blurb: 'Google 轻量模型，低配友好' },
  { name: 'Phi-3 Mini', id: 'phi3:mini', source: 'local', runtime: 'ollama', useCases: ['general'], vramRequiredGb: 2, vision: false, contextTokens: 8192, blurb: '极小模型，纯 CPU 也能跑' },
  { name: 'Qwen3 (云端)', id: 'qwen3', source: 'cloud', runtime: 'azure-openai', useCases: ['general'], vramRequiredGb: 0, vision: false, contextTokens: 131072, blurb: '云端通用旗舰' },

  // ---- 视觉 ----
  { name: 'Qwen2.5-VL 7B', id: 'qwen2.5-vl:7b', source: 'local', runtime: 'ollama', useCases: ['vision'], vramRequiredGb: 5, vision: true, contextTokens: 32768, blurb: '本地视觉理解，看图说话' },
  { name: 'Qwen2.5-VL 72B (云端)', id: 'qwen2.5-vl-72b', source: 'cloud', runtime: 'azure-openai', useCases: ['vision'], vramRequiredGb: 0, vision: true, contextTokens: 131072, blurb: '云端强视觉，复杂图像理解' },

  // ---- 长上下文 ----
  { name: 'Qwen2.5 7B (128k)', id: 'qwen2.5:7b', source: 'local', runtime: 'ollama', useCases: ['long-context'], vramRequiredGb: 5, vision: false, contextTokens: 131072, blurb: '128k 窗口，处理长文档' },
  { name: 'DeepSeek-Coder-V2 16B (160k)', id: 'deepseek-coder-v2:16b', source: 'local', runtime: 'ollama', useCases: ['long-context'], vramRequiredGb: 10, vision: false, contextTokens: 163840, blurb: '160k 窗口，大文档/大仓库' },
]

// ---------- 硬件评估 ----------

function assessLocalViability(machine: MachineInfo): { level: 'excellent' | 'good' | 'limited' | 'poor'; note: string; effectiveVramGb: number } {
  const gpuVram = machine.gpu.vramTotalGb ?? 0
  const ram = machine.ramTotalGb
  const isArm = machine.arch === 'arm64'

  // ARM Windows 上 GPU 加速受限，有效显存打折
  const armPenalty = isArm ? 0.5 : 1.0
  const effectiveVram = gpuVram * armPenalty

  let level: 'excellent' | 'good' | 'limited' | 'poor'
  let note: string

  if (effectiveVram >= 20) {
    level = 'excellent'
    note = `显存充足（${gpuVram}GB），可跑 32B 级模型。`
  } else if (effectiveVram >= 9) {
    level = 'good'
    note = `显存较好（${gpuVram}GB），可跑 14B 级模型。`
  } else if (effectiveVram >= 4) {
    level = 'limited'
    note = `显存有限（${gpuVram}GB），建议 7B 及以下。`
  } else if (ram >= 16) {
    level = 'limited'
    note = `无明显 GPU 显存，但内存 ${ram}GB，可 CPU 跑 7B（较慢）。`
  } else {
    level = 'poor'
    note = `硬件偏紧（内存 ${ram}GB），本地大模型不划算，建议云端。`
  }

  if (isArm) {
    note += ` 注意：Windows ARM 平台 GPU 加速受限，实际速度可能低于 x86。`
  }

  return { level, note, effectiveVramGb: effectiveVram }
}

// ---------- 评分 ----------

function scoreEntry(entry: CatalogEntry, useCase: UseCase, machine: MachineInfo, viability: { effectiveVramGb: number }, preferLocal: boolean): number {
  let score = 50

  // 用途匹配
  if (entry.useCases.includes(useCase)) score += 20
  else score -= 30

  // 本地模型：是否跑得动
  if (entry.source === 'local') {
    const fits = entry.vramRequiredGb <= viability.effectiveVramGb + 1 // 留 1GB 余量
    if (fits) score += 15
    else score -= 40 // 跑不动，大幅降权
  } else {
    // 云端：不占本地资源，稳定
    score += 10
  }

  // 本地/云端偏好
  if (preferLocal && entry.source === 'local') score += 10
  if (!preferLocal && entry.source === 'cloud') score += 10

  // 视觉需求
  if (useCase === 'vision' && !entry.vision) score -= 50

  return Math.max(0, Math.min(100, score))
}

// ---------- 主入口 ----------

export function recommendModels(
  machine: MachineInfo,
  useCase: UseCase,
  preferLocal: boolean = true,
): RecommendationResult {
  const viability = assessLocalViability(machine)

  const scored = CATALOG
    .filter(entry => entry.useCases.includes(useCase))
    .map(entry => {
      const score = scoreEntry(entry, useCase, machine, viability, preferLocal)
      const fitsMachine = entry.source === 'cloud'
        ? true
        : entry.vramRequiredGb <= viability.effectiveVramGb + 1
      return {
        name: entry.name,
        id: entry.id,
        source: entry.source,
        runtime: entry.runtime,
        useCase,
        reason: buildReason(entry, useCase, machine, viability, fitsMachine),
        vramRequiredGb: entry.vramRequiredGb,
        vision: entry.vision,
        contextTokens: entry.contextTokens,
        score,
        fitsMachine,
        deployCommand: entry.source === 'local' ? `ollama pull ${entry.id}` : null,
      }
    })
    .sort((a, b) => b.score - a.score)

  const machineSummary = `${machine.gpu.name} · ${machine.cpuCores} 核 · ${machine.ramTotalGb}GB 内存 · ${machine.arch}`

  return {
    localViability: viability.level,
    viabilityNote: viability.note,
    recommendations: scored,
    machineSummary,
  }
}

function buildReason(
  entry: CatalogEntry,
  useCase: UseCase,
  machine: MachineInfo,
  viability: { effectiveVramGb: number; level: string },
  fitsMachine: boolean,
): string {
  const parts: string[] = []
  parts.push(entry.blurb)

  if (entry.source === 'local') {
    if (fitsMachine) {
      parts.push(`本机可跑（需约 ${entry.vramRequiredGb}GB，有效显存 ${viability.effectiveVramGb.toFixed(1)}GB）`)
    } else {
      parts.push(`⚠ 本机显存不足（需 ${entry.vramRequiredGb}GB，有效仅 ${viability.effectiveVramGb.toFixed(1)}GB），建议云端或更小模型`)
    }
  } else {
    parts.push('云端运行，不占本地算力')
  }

  if (useCase === 'vision' && entry.vision) parts.push('支持图片输入')
  if (entry.contextTokens >= 100000) parts.push(`${(entry.contextTokens / 1000).toFixed(0)}k 长上下文`)

  return parts.join(' · ')
}
