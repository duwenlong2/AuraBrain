#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { resolve } from 'node:path'

process.title = 'AuraBrain.runtime'

const [command = 'help', ...args] = process.argv.slice(2)
const host = process.env.AURABRAIN_HOST || '127.0.0.1'
const port = Number(process.env.AURABRAIN_PORT || 49000)
const baseUrl = `http://${host}:${port}`
const pidFile = resolve('.aurabrain-runtime.pid')
const devLockFile = resolve('.mastra', 'dev.lock')
const logDir = resolve('.aurabrain')
const logFile = resolve(logDir, 'runtime.log')

function printHelp() {
  console.log(`AuraBrain CLI (brain)

Commands:
  brain dev                     Start the local Runtime (后台运行，启动成功后立即返回)
  brain start                   Start the built Runtime (后台运行，启动成功后立即返回)
  brain build                   Build the Runtime
  brain stop                    Stop the started Runtime
  brain logs                    Show the last 50 lines of the Runtime log
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

function spawnRuntime() {
  const runtimeEntry = resolve('.mastra', 'output', 'index.mjs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  const logStream = openSync(logFile, 'a')
  const child = spawn(process.execPath, [runtimeEntry], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    shell: false,
    windowsHide: true,
  })
  closeSync(logStream)
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8')
  child.unref()
  return child
}

function findListeningPid() {
  if (process.platform !== 'win32') return null
  const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
  const line = netstat.split(/\r?\n/).find(item => new RegExp(`127\\.0\\.1:${port}\\s+.*LISTENING\\s+(\\d+)`).test(item))
  return line?.match(/LISTENING\s+(\d+)\s*$/)?.[1] || null
}

async function waitForReady(timeoutMs = 45_000, isAborted = () => false) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isRuntimeRunning()) return true
    if (isAborted()) return false
    await new Promise(resolveTimer => setTimeout(resolveTimer, 300))
  }
  return false
}

function printLogTail(file = logFile, lines = 20) {
  if (!existsSync(file)) return
  const content = readFileSync(file, 'utf8').trimEnd().split(/\r?\n/)
  if (content.length) console.error(content.slice(-lines).join('\n'))
}

async function startRuntimeDaemon() {
  console.log(`AuraBrain Runtime 启动中 (${baseUrl})...`)
  const child = spawnRuntime()
  let exitInfo = null
  if (typeof child.once === 'function') {
    child.once('exit', (code, signal) => { exitInfo = { code, signal } })
  }
  const ready = await waitForReady(45_000, () => exitInfo !== null)
  if (!ready) {
    console.error(exitInfo
      ? `AuraBrain Runtime 启动失败 (进程已退出 code=${exitInfo.code ?? exitInfo.signal})。最近日志:`
      : 'AuraBrain Runtime 启动超时 (45s 内未就绪)。最近日志:')
    printLogTail()
    process.exitCode = 1
    return
  }
  const listeningPid = findListeningPid()
  if (listeningPid) writeFileSync(pidFile, `${listeningPid}\n`, 'utf8')
  const runtimePid = listeningPid || child.pid
  console.log(`✓ 启动成功 (${baseUrl})`)
  console.log(`  PID: ${runtimePid}`)
  console.log(`  日志: ${logFile}`)
  console.log('  查看状态: brain status')
  console.log('  停止: brain stop')
}

async function handleAlreadyRunning() {
  console.log(`AuraBrain Runtime 已在运行 (${baseUrl})，无需重复启动。`)
  if (existsSync(pidFile)) {
    const pid = readFileSync(pidFile, 'utf8').trim()
    if (pid) console.log(`  PID: ${pid}`)
  }
  try {
    const response = await fetch(`${baseUrl}/admin/status`)
    const status = await response.json()
    if (response.ok) {
      console.log(`模型状态: ${status.initialized ? '已初始化' : '未初始化'}`)
      if (status.defaultModel) console.log(`默认模型: ${status.defaultModel}`)
    }
  } catch {
    // 状态接口不可用时只提示运行中
  }
  console.log('如需重启: 先执行 brain stop，再执行 brain dev')
}

async function isRuntimeRunning() {
  try {
    const response = await fetch(`${baseUrl}/health`)
    return response.ok
  } catch {
    return false
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

async function waitUntilStopped(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isRuntimeRunning())) return true
    await new Promise(resolveTimer => setTimeout(resolveTimer, 200))
  }
  return !(await isRuntimeRunning())
}

async function stopRuntime() {
  if (!existsSync(pidFile)) {
    if (process.platform === 'win32') {
      const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
      const line = netstat.split(/\r?\n/).find(item => new RegExp(`127\\.0\\.0\\.1:${port}\\s+.*LISTENING\\s+(\\d+)`).test(item))
      const match = line?.match(/LISTENING\s+(\d+)\s*$/)
      if (match) {
        execFileSync('taskkill.exe', ['/PID', match[1], '/T', '/F'], { stdio: 'ignore' })
        await waitUntilStopped()
        console.log(`✓ AuraBrain Runtime 已停止 (PID ${match[1]}).`)
        return
      }
    }
    console.log('AuraBrain Runtime 未运行。')
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
    const stopped = await waitUntilStopped()
    console.log(stopped
      ? `✓ AuraBrain Runtime 已停止 (PID ${pid}).`
      : `AuraBrain Runtime 停止信号已发送 (PID ${pid})，如端口仍被占用请手动结束进程。`)
  } catch (error) {
    if (error?.status === 128 || error?.code === 'ESRCH') {
      console.log('AuraBrain Runtime 已停止。')
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
    case 'start':
      if (await isRuntimeRunning()) {
        await handleAlreadyRunning()
        break
      }
      if (!existsSync(resolve('.mastra', 'output', 'index.mjs'))) {
        throw new Error('未找到构建产物，请先执行: brain build')
      }
      await startRuntimeDaemon()
      break
    case 'stop':
      await stopRuntime()
      break
    case 'build':
      if (await isRuntimeRunning()) await stopRuntime()
      runMastra('build', ['--dir', 'src/main', ...args])
      break
    case 'logs': {
      if (!existsSync(logFile)) {
        console.log('暂无日志 (Runtime 未启动过)。')
        break
      }
      const content = readFileSync(logFile, 'utf8').trimEnd().split(/\r?\n/)
      console.log(content.slice(-50).join('\n'))
      break
    }
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
