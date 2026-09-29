#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import readline from 'node:readline/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.title = 'AuraBrain.runtime'

const [command = 'help', ...args] = process.argv.slice(2)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const host = process.env.AURABRAIN_HOST || '127.0.0.1'
const port = Number(process.env.AURABRAIN_PORT || 49000)
const baseUrl = `http://${host}:${port}`
const pidFile = resolve(projectRoot, '.aurabrain-runtime.pid')
const buildPidFile = resolve(projectRoot, '.mastra', 'build.pid')
const buildOutputDir = resolve(projectRoot, '.mastra', 'output')
const buildToolsDir = resolve(projectRoot, 'scripts', 'build-tools')
const devLockFile = resolve(projectRoot, '.mastra', 'dev.lock')
const logDir = resolve(projectRoot, '.aurabrain')
const logFile = resolve(logDir, 'runtime.log')
const launcherLogFile = resolve(logDir, 'launcher.log')
const runtimeEntry = resolve(projectRoot, '.mastra', 'output', 'index.mjs')

function logLauncher(message) {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  writeFileSync(launcherLogFile, `${new Date().toISOString()} pid=${process.pid} ppid=${process.ppid} ${message}\n`, { flag: 'a' })
}

function buildOutputSnapshot() {
  const dependenciesDir = resolve(buildOutputDir, 'node_modules')
  if (!existsSync(dependenciesDir)) return 'generated-node_modules=missing'
  let files = 0
  let bytes = 0
  const pending = [dependenciesDir]
  while (pending.length) {
    const current = pending.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name)
      if (entry.isDirectory()) pending.push(fullPath)
      else {
        files += 1
        try { bytes += statSync(fullPath).size } catch {}
      }
    }
  }
  const packages = readdirSync(dependenciesDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
  return `generated-node_modules=present packages=${packages} files=${files} bytes=${bytes}`
}

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

function stopProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    // The process may already have exited after an interrupted build.
  }
}

function findOrphanedBuildPids() {
  if (process.platform !== 'win32') return []

  try {
    const script = [
      '$root = $env:AURABRAIN_PROJECT_ROOT',
      '$current = [int]$env:AURABRAIN_CLI_PID',
      'Get-CimInstance Win32_Process |',
      "  Where-Object { $_.ProcessId -ne $PID -and $_.ProcessId -ne $current -and $_.CommandLine -and (( $_.CommandLine.Contains($root) -and $_.CommandLine -match 'mastra[\\\\/].*dist[\\\\/]index\\.js' -and $_.CommandLine -match '(?:^|\\s)build(?:\\s|$)' ) -or $_.CommandLine -match 'aurabrain\\.mjs[\\s\"'']+build(?:\\s|$)' ) } |",
      '  Select-Object -ExpandProperty ProcessId',
    ].join('; ')
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      env: { ...process.env, AURABRAIN_PROJECT_ROOT: projectRoot, AURABRAIN_CLI_PID: String(process.pid) },
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split(/\r?\n/).map(value => Number.parseInt(value.trim(), 10)).filter(Number.isInteger)
  } catch {
    return []
  }
}

function waitForFileRelease(milliseconds) {
  if (milliseconds <= 0) return
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, milliseconds)
}

function prepareBuildOutput() {
  const orphanedPids = findOrphanedBuildPids()
  const hasStaleBuildPid = existsSync(buildPidFile)
  if (!hasStaleBuildPid && orphanedPids.length === 0) return

  if (existsSync(buildPidFile)) {
    const pid = Number.parseInt(readFileSync(buildPidFile, 'utf8').trim(), 10)
    stopProcessTree(pid)
    unlinkSync(buildPidFile)
  }

  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const pid of orphanedPids) stopProcessTree(pid)
    try {
      rmSync(buildOutputDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 })
      return
    } catch (error) {
      lastError = error
      waitForFileRelease(500)
    }
  }

  throw new Error(`无法清理上次构建产物 ${buildOutputDir}，请确认没有其他 brain build 进程正在运行：${lastError?.message || lastError}`)
}

function runMastra(mastraCommand, commandArgs) {
  if (mastraCommand === 'build') prepareBuildOutput()
  const mastraEntry = resolve(projectRoot, 'node_modules/mastra/dist/index.js')
  const startedAt = Date.now()
  const useGeneratedDependencies = process.env.AURABRAIN_BUILD_INSTALL === 'true'
  const buildEnv = mastraCommand === 'build'
    ? {
        ...process.env,
        ...(!useGeneratedDependencies && process.platform === 'win32' ? { PATH: `${buildToolsDir}${process.env.PATH ? `;${process.env.PATH}` : ''}` } : {}),
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
        npm_config_progress: 'false',
        npm_config_prefer_offline: 'true',
        npm_config_fetch_retries: process.env.npm_config_fetch_retries || '1',
      }
    : process.env
  if (mastraCommand === 'build') {
    logLauncher(`build-start command=mastra ${mastraCommand} ${commandArgs.join(' ')} npm=${useGeneratedDependencies ? 'install-generated-dependencies' : 'build-shim,skip-output-install'} ${buildOutputSnapshot()}`)
    console.log(`[AuraBrain build] started pid=pending ${buildOutputSnapshot()}`)
  }
  const child = spawn(process.execPath, [mastraEntry, mastraCommand, ...commandArgs], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    env: buildEnv,
  })
  let heartbeat
  if (mastraCommand === 'build') {
    mkdirSync(dirname(buildPidFile), { recursive: true })
    writeFileSync(buildPidFile, `${child.pid}\n`, 'utf8')
    logLauncher(`build-child-start pid=${child.pid}`)
    console.log(`[AuraBrain build] child pid=${child.pid}`)
    heartbeat = setInterval(() => {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
      const snapshot = buildOutputSnapshot()
      logLauncher(`build-heartbeat elapsed=${elapsedSeconds}s ${snapshot}`)
      console.log(`[AuraBrain build] ${elapsedSeconds}s ${snapshot}`)
    }, 15_000)
  }
  child.on('exit', (code, signal) => {
    if (heartbeat) clearInterval(heartbeat)
    if (mastraCommand === 'build') {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
      logLauncher(`build-exit pid=${child.pid} code=${code ?? 'null'} signal=${signal ?? 'null'} elapsed=${elapsedSeconds}s ${buildOutputSnapshot()}`)
      console.log(`[AuraBrain build] exit code=${code ?? 'null'} signal=${signal ?? 'null'} elapsed=${elapsedSeconds}s ${buildOutputSnapshot()}`)
    }
    const currentPidFile = mastraCommand === 'build' ? buildPidFile : pidFile
    if (existsSync(currentPidFile) && readFileSync(currentPidFile, 'utf8').trim() === String(child.pid)) {
      unlinkSync(currentPidFile)
    }
    process.exitCode = signal ? 1 : (code ?? 1)
  })
  if (mastraCommand === 'build') {
    const forwardInterrupt = () => stopProcessTree(child.pid)
    process.once('SIGINT', forwardInterrupt)
    process.once('SIGTERM', forwardInterrupt)
    child.once('exit', () => {
      process.removeListener('SIGINT', forwardInterrupt)
      process.removeListener('SIGTERM', forwardInterrupt)
    })
  }
}

function spawnRuntime() {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  const logStream = openSync(logFile, 'a')
  logLauncher(`spawn runtime executable=${process.execPath} entry=${runtimeEntry} cwd=${projectRoot}`)
  const child = spawn(process.execPath, [runtimeEntry], {
    cwd: projectRoot,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    shell: false,
    windowsHide: true,
  })
  closeSync(logStream)
  logLauncher(`runtime child started pid=${child.pid} detached=true shell=false windowsHide=true`)
  child.once('exit', (code, signal) => logLauncher(`runtime child exited pid=${child.pid} code=${code ?? '<null>'} signal=${signal ?? '<null>'}`))
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
    try {
      execFileSync('xdg-open', [url], { stdio: 'ignore' })
    } catch {
      console.log(`未检测到图形桌面，未自动打开浏览器。请手动访问：${url}`)
      return
    }
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
      if (!existsSync(runtimeEntry)) {
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
