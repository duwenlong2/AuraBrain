#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { resolve } from 'node:path'

process.title = 'AuraBrain.runtime'

const [command = 'help', ...args] = process.argv.slice(2)
const host = process.env.AURABRAIN_HOST || '127.0.0.1'
const port = Number(process.env.AURABRAIN_PORT || 49000)
const baseUrl = `http://${host}:${port}`
const pidFile = resolve('.aurabrain-runtime.pid')
const devLockFile = resolve('.mastra', 'dev.lock')

function printHelp() {
  console.log(`AuraBrain CLI (brain)

Commands:
  brain dev                     Start the local Runtime
  brain start                   Start the built Runtime
  brain build                   Build the Runtime
  brain stop                    Stop the started Runtime
  brain health                  Check Runtime health
  brain status                  Check health and initialization status
  brain init                    Open the first-time model setup page
  brain settings                Open the Runtime settings page
  brain chat                    Start an interactive text chat
  brain call <path> [json]      Call a Runtime API

Alias: aurabrain
`)
}

function runMastra(mastraCommand, commandArgs) {
  const mastraEntry = resolve('node_modules/mastra/dist/index.js')
  const child = spawn(process.execPath, [mastraEntry, mastraCommand, ...commandArgs], {
    stdio: 'inherit',
    shell: false,
  })
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8')
  child.on('exit', (code, signal) => {
    if (existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() === String(child.pid)) {
      unlinkSync(pidFile)
    }
    process.exitCode = signal ? 1 : (code ?? 1)
  })
}

async function isRuntimeRunning() {
  try {
    const response = await fetch(`${baseUrl}/health`)
    return response.ok
  } catch {
    return false
  }
}

async function ensureRuntimeAvailable() {
  if (await isRuntimeRunning()) {
    throw new Error(`AuraBrain Runtime 已在运行 (${baseUrl})，无需重复执行 brain dev；如需重启请先执行: brain stop`)
  }
}

function removeStaleDevLock() {
  if (!existsSync(devLockFile)) return

  try {
    const lock = JSON.parse(readFileSync(devLockFile, 'utf8'))
    if (Number.isInteger(lock.pid)) {
      process.kill(lock.pid, 0)
      return
    }
  } catch {
    // A missing process or invalid lock is safe to clean up before starting.
  }

  unlinkSync(devLockFile)
}

function stopRuntime() {
  if (!existsSync(pidFile)) {
    if (process.platform === 'win32') {
      const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
      const line = netstat.split(/\r?\n/).find(item => new RegExp(`127\\.0\\.0\\.1:${port}\\s+.*LISTENING\\s+(\\d+)`).test(item))
      const match = line?.match(/LISTENING\s+(\d+)\s*$/)
      if (match) {
        execFileSync('taskkill.exe', ['/PID', match[1], '/T', '/F'], { stdio: 'ignore' })
        console.log(`AuraBrain Runtime stopped (PID ${match[1]}).`)
        return
      }
    }
    console.log('AuraBrain Runtime is not managed by this CLI.')
    return
  }

  const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
  unlinkSync(pidFile)
  if (!Number.isInteger(pid)) {
    console.log('AuraBrain Runtime PID file was invalid.')
    return
  }

  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    console.log(`AuraBrain Runtime stopped (PID ${pid}).`)
  } catch (error) {
    if (error?.status === 128 || error?.code === 'ESRCH') {
      console.log('AuraBrain Runtime is already stopped.')
      return
    }
    throw error
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${baseUrl}/health`)
    const body = await response.text()
    console.log(body)
    if (!response.ok) process.exitCode = 1
  } catch (error) {
    console.error(`AuraBrain Runtime is unavailable at ${baseUrl}`)
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

async function checkStatus() {
  try {
    const healthResponse = await fetch(`${baseUrl}/health`)
    if (!healthResponse.ok) throw new Error(`HTTP ${healthResponse.status}`)

    const response = await fetch(`${baseUrl}/admin/status`)
    const status = await response.json()
    if (!response.ok) throw new Error(status?.error || `HTTP ${response.status}`)

    console.log(`AuraBrain Runtime: 运行中 (${baseUrl})`)
    console.log(`模型状态: ${status.initialized ? '已初始化' : '未初始化'}`)
    if (status.defaultModel) console.log(`默认模型: ${status.defaultModel}`)
    if (Array.isArray(status.providers)) console.log(`模型提供商: ${status.providers.length}`)
  } catch (error) {
    console.log(`AuraBrain Runtime: 未运行 (${baseUrl})`)
    console.log('请先执行: brain dev')
    process.exitCode = 1
  }
}

function openBrowser(path) {
  const url = `${baseUrl}${path}`
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/c', 'start', '', url], { stdio: 'ignore' })
  } else if (process.platform === 'darwin') {
    execFileSync('open', [url], { stdio: 'ignore' })
  } else {
    execFileSync('xdg-open', [url], { stdio: 'ignore' })
  }
  console.log(`已打开 ${url}`)
}

async function callApi(path, json) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const options = json === undefined
    ? {}
    : {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: json,
      }
  const response = await fetch(`${baseUrl}${normalizedPath}`, options)
  const body = await response.text()
  console.log(body)
  if (!response.ok) process.exitCode = 1
}

async function runChat() {
  if (!(await isRuntimeRunning())) throw new Error(`AuraBrain Runtime 未运行，请先执行: brain dev`)

  const statusResponse = await fetch(`${baseUrl}/admin/status`)
  const status = await statusResponse.json()
  if (!statusResponse.ok) throw new Error(status?.error || `无法读取模型状态 (HTTP ${statusResponse.status})`)
  if (!status.defaultModel) throw new Error('还没有默认模型，请先执行: brain init')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const history = []
  console.log(`AuraBrain Chat · ${status.defaultModel}`)
  console.log('输入 /exit 或 /quit 退出，Ctrl+C 也可以退出。')
  console.log('')

  try {
    while (true) {
      let message
      try {
        message = (await rl.question('you> ')).trim()
      } catch (error) {
        if (error?.code === 'ERR_USE_AFTER_CLOSE' || error?.code === 'ERR_INVALID_STATE') break
        throw error
      }
      if (!message) continue
      if (message === '/exit' || message === '/quit') break
      if (message === '/clear') {
        history.length = 0
        console.log('会话上下文已清空。')
        continue
      }

      history.push({ role: 'user', content: message })
      process.stdout.write('assistant> ')
      try {
        const response = await fetch(`${baseUrl}/admin/model-chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: status.defaultModel, messages: history, stream: true }),
        })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          throw new Error(result.error || `请求失败 (HTTP ${response.status})`)
        }
        const text = await readChatStream(response)
        if (!text) process.stdout.write('(模型没有返回文本)')
        console.log('')
        history.push({ role: 'assistant', content: text })
      } catch (error) {
        history.pop()
        console.log(`请求失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } finally {
    rl.close()
    console.log('Chat 已结束。')
  }
}

async function readChatStream(response) {
  if (!response.body) throw new Error('模型没有返回可读取的响应流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const consume = line => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const payload = JSON.parse(data)
      const delta = payload.choices?.[0]?.delta?.content || payload.choices?.[0]?.text || ''
      if (delta) {
        process.stdout.write(delta)
        text += delta
      }
    } catch {
      // Ignore incomplete or non-JSON SSE lines.
    }
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) consume(line)
    if (done) break
  }
  if (buffer) consume(buffer)
  return text
}

try {
  switch (command) {
    case 'dev':
      await ensureRuntimeAvailable()
      if (!existsSync(resolve('.mastra', 'output', 'index.mjs'))) {
        throw new Error('未找到构建产物，请先执行: brain build')
      }
      runMastra('start', args)
      break
    case 'start':
      await ensureRuntimeAvailable()
      runMastra('start', args)
      break
    case 'stop':
      stopRuntime()
      break
    case 'build':
      if (await isRuntimeRunning()) stopRuntime()
      runMastra('build', ['--dir', 'src/main', ...args])
      break
    case 'health':
      await checkHealth()
      break
    case 'status':
      await checkStatus()
      break
    case 'init':
    case 'settings':
      openBrowser(command === 'init' ? '/setup' : '/aurabrain/settings/models')
      break
    case 'chat':
      await runChat()
      break
    case 'call': {
      const [path, json] = args
      if (!path) throw new Error('Usage: brain call <path> [json]')
      await callApi(path, json)
      break
    }
    case 'help':
    case '--help':
    case '-h':
      printHelp()
      break
    default:
      throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
