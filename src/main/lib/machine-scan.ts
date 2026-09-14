// ============================================================
//  AuraBrain Runtime · 机器扫描
//  扫描本机硬件（GPU/显存/内存/CPU/磁盘）+ 本地模型运行时
//  （Ollama / LM Studio / llama.cpp / vLLM / Jan / GPT4All）。
//  所有探测都是"尽力而为"：任何一项失败都不影响整体结果。
// ============================================================
import { execFile } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

export interface GpuInfo {
  name: string
  vramTotalGb: number | null
  vramFreeGb: number | null
  driverVersion: string | null
  cudaVersion: string | null
  source: 'nvidia-smi' | 'wmi' | 'unknown'
}

export interface RuntimeModel {
  id: string
  name: string
  sizeGb: number | null
  /** 是否已在运行时中加载/就绪 */
  ready: boolean
}

export interface RuntimeInfo {
  id: string
  name: string
  installed: boolean
  version: string | null
  endpoint: string | null
  reachable: boolean
  models: RuntimeModel[]
}

export interface MachineInfo {
  platform: string
  arch: string
  osRelease: string
  cpuModel: string
  cpuCores: number
  ramTotalGb: number
  ramFreeGb: number
  diskFreeGb: number
  gpu: GpuInfo
  runtimes: RuntimeInfo[]
  scannedAt: string
}

// ---------- 通用工具 ----------

function run(cmd: string, args: string[], timeoutMs = 8000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: false, stdout: '', stderr: `timeout after ${timeoutMs}ms` })
      }
    }, timeoutMs)
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout, stderr) => {
      clearTimeout(timer)
      if (settled) return
      settled = true
      resolve({ ok: !error, stdout: stdout || '', stderr: stderr || (error ? String(error) : '') })
    })
  })
}

async function httpJson(url: string, timeoutMs = 2500): Promise<any | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ---------- 硬件 ----------

async function detectGpu(): Promise<GpuInfo> {
  // 1) nvidia-smi（最权威）
  const smi = await run('nvidia-smi', [
    '--query-gpu=name,memory.total,memory.free,driver_version',
    '--format=csv,noheader,nounits',
  ])
  if (smi.ok && smi.stdout.trim()) {
    const line = smi.stdout.trim().split('\n')[0]
    const [name, memTotal, memFree, driver] = line.split(',').map(s => s.trim())
    const cuda = await run('nvidia-smi', ['--query-gpu=driver_version', '--format=csv,noheader'])
    return {
      name: name || 'NVIDIA GPU',
      vramTotalGb: memTotal ? Number(memTotal) / 1024 : null,
      vramFreeGb: memFree ? Number(memFree) / 1024 : null,
      driverVersion: driver || null,
      cudaVersion: null,
      source: 'nvidia-smi',
    }
  }

  // 2) WMI 兜底（拿不到显存，但能拿到 GPU 名称）
  const wmi = await run('powershell', [
    '-NoProfile', '-Command',
    "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name, DriverVersion | ConvertTo-Json -Compress",
  ], 12000)
  if (wmi.ok && wmi.stdout.trim()) {
    try {
      const parsed = JSON.parse(wmi.stdout.trim())
      const item = Array.isArray(parsed) ? parsed[0] : parsed
      return {
        name: item?.Name || 'Unknown GPU',
        vramTotalGb: null,
        vramFreeGb: null,
        driverVersion: item?.DriverVersion || null,
        cudaVersion: null,
        source: 'wmi',
      }
    } catch {
      /* fall through */
    }
  }

  return { name: 'Unknown GPU', vramTotalGb: null, vramFreeGb: null, driverVersion: null, cudaVersion: null, source: 'unknown' }
}

function detectCpu(): { model: string; cores: number } {
  let model = 'Unknown CPU'
  try {
    const wmi = os.cpus()
    if (wmi.length > 0) model = wmi[0].model.replace(/\s+/g, ' ').trim()
  } catch {
    /* ignore */
  }
  return { model, cores: os.cpus().length }
}

function detectRam(): { totalGb: number; freeGb: number } {
  const total = os.totalmem() / (1024 ** 3)
  const free = os.freemem() / (1024 ** 3)
  return { totalGb: round1(total), freeGb: round1(free) }
}

function detectDiskFree(): number {
  // 取系统盘（C: 或 homedir 所在盘）的可用空间
  const candidates = [process.env.SystemDrive ? `${process.env.SystemDrive}\\` : 'C:\\', os.homedir()]
  for (const dir of candidates) {
    try {
      const stats = fs.statfsSync(dir)
      const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3)
      if (freeGb > 0) return round1(freeGb)
    } catch {
      /* try next */
    }
  }
  return 0
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ---------- 本地运行时 ----------

async function detectOllama(): Promise<RuntimeInfo> {
  const base: RuntimeInfo = {
    id: 'ollama', name: 'Ollama', installed: false, version: null,
    endpoint: 'http://127.0.0.1:11434', reachable: false, models: [],
  }
  // 版本
  const ver = await httpJson('http://127.0.0.1:11434/api/version')
  if (ver?.version) {
    base.installed = true
    base.reachable = true
    base.version = ver.version
  }
  // 模型列表
  const list = await httpJson('http://127.0.0.1:11434/api/tags')
  if (list?.models) {
    base.models = list.models.map((m: any) => ({
      id: m.name,
      name: m.name,
      sizeGb: m.size ? m.size / (1024 ** 3) : null,
      ready: true,
    }))
  }
  // 正在运行的
  const ps = await httpJson('http://127.0.0.1:11434/api/ps')
  if (ps?.models) {
    const running = new Set(ps.models.map((m: any) => m.name))
    base.models = base.models.map(m => ({ ...m, ready: running.has(m.name) }))
  }
  return base
}

async function detectLmStudio(): Promise<RuntimeInfo> {
  const base: RuntimeInfo = {
    id: 'lmstudio', name: 'LM Studio', installed: false, version: null,
    endpoint: 'http://127.0.0.1:1234/v1', reachable: false, models: [],
  }
  const models = await httpJson('http://127.0.0.1:1234/v1/models')
  if (models?.data) {
    base.installed = true
    base.reachable = true
    base.models = models.data.map((m: any) => ({ id: m.id, name: m.id, sizeGb: null, ready: true }))
  }
  return base
}

async function detectVllm(): Promise<RuntimeInfo> {
  const base: RuntimeInfo = {
    id: 'vllm', name: 'vLLM', installed: false, version: null,
    endpoint: 'http://127.0.0.1:8000/v1', reachable: false, models: [],
  }
  const models = await httpJson('http://127.0.0.1:8000/v1/models')
  if (models?.data) {
    base.installed = true
    base.reachable = true
    base.models = models.data.map((m: any) => ({ id: m.id, name: m.id, sizeGb: null, ready: true }))
  }
  return base
}

async function detectLlamaCpp(): Promise<RuntimeInfo> {
  // llama.cpp server 默认 8080，OpenAI 兼容
  const base: RuntimeInfo = {
    id: 'llamacpp', name: 'llama.cpp', installed: false, version: null,
    endpoint: 'http://127.0.0.1:8080/v1', reachable: false, models: [],
  }
  const models = await httpJson('http://127.0.0.1:8080/v1/models')
  if (models?.data) {
    base.installed = true
    base.reachable = true
    base.models = models.data.map((m: any) => ({ id: m.id, name: m.id, sizeGb: null, ready: true }))
  }
  return base
}

async function detectJan(): Promise<RuntimeInfo> {
  // Jan 默认 127.0.0.1:2223，OpenAI 兼容
  const base: RuntimeInfo = {
    id: 'jan', name: 'Jan', installed: false, version: null,
    endpoint: 'http://127.0.0.1:2223/v1', reachable: false, models: [],
  }
  const models = await httpJson('http://127.0.0.1:2223/v1/models')
  if (models?.data) {
    base.installed = true
    base.reachable = true
    base.models = models.data.map((m: any) => ({ id: m.id, name: m.id, sizeGb: null, ready: true }))
  }
  return base
}

// ---------- 汇总 ----------

export async function scanMachine(): Promise<MachineInfo> {
  const [gpu, cpu, ram, disk, runtimes] = await Promise.all([
    detectGpu(),
    Promise.resolve(detectCpu()),
    Promise.resolve(detectRam()),
    Promise.resolve(detectDiskFree()),
    Promise.all([
      detectOllama(),
      detectLmStudio(),
      detectVllm(),
      detectLlamaCpp(),
      detectJan(),
    ]),
  ])

  return {
    platform: process.platform,
    arch: process.arch,
    osRelease: `${os.type()} ${os.release()}`,
    cpuModel: cpu.model,
    cpuCores: cpu.cores,
    ramTotalGb: ram.totalGb,
    ramFreeGb: ram.freeGb,
    diskFreeGb: disk,
    gpu,
    runtimes,
    scannedAt: new Date().toISOString(),
  }
}
