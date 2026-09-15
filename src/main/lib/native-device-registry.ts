export type NativeDeviceInfo = {
  id: string
  name?: string
  ip?: string
  mac?: string
  firmware?: string
  lastSeen: number
}

type PendingCommand = {
  id: string
  command: string
  params: Record<string, unknown>
  resolve: (result: unknown) => void
}

type DeviceSession = NativeDeviceInfo & {
  queue: PendingCommand[]
  inFlight: Map<string, PendingCommand>
  waiter?: { resolve: (command: PendingCommand | null) => void; timer: NodeJS.Timeout }
}

const sessions = new Map<string, DeviceSession>()

function session(id: string): DeviceSession {
  const current = sessions.get(id)
  if (!current) throw new Error(`Native 设备未连接：${id}`)
  return current
}

export function registerNativeDevice(info: Omit<NativeDeviceInfo, 'lastSeen'>): NativeDeviceInfo {
  const current = sessions.get(info.id)
  const next: DeviceSession = current
    ? { ...current, ...info, lastSeen: Date.now() }
    : { ...info, lastSeen: Date.now(), queue: [], inFlight: new Map() }
  sessions.set(info.id, next)
  return publicInfo(next)
}

export function touchNativeDevice(id: string, info: Partial<Omit<NativeDeviceInfo, 'id' | 'lastSeen'>> = {}): NativeDeviceInfo {
  const current = session(id)
  Object.assign(current, info, { lastSeen: Date.now() })
  return publicInfo(current)
}

export function listNativeDevices(): NativeDeviceInfo[] {
  return [...sessions.values()].map(publicInfo)
}

export function getNativeDevice(id: string): NativeDeviceInfo {
  return publicInfo(session(id))
}

export function waitForNativeCommand(id: string, timeoutMs: number): Promise<PendingCommand | null> {
  const current = session(id)
  const queued = current.queue.shift()
  if (queued) {
    current.inFlight.set(queued.id, queued)
    return Promise.resolve(queued)
  }
  if (current.waiter) clearTimeout(current.waiter.timer)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      if (current.waiter?.timer === timer) current.waiter = undefined
      resolve(null)
    }, timeoutMs)
    current.waiter = { resolve, timer }
  })
}

export function enqueueNativeCommand(id: string, command: string, params: Record<string, unknown>): Promise<unknown> {
  const current = session(id)
  const commandId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return new Promise(resolve => {
    const pending = { id: commandId, command, params, resolve }
    if (current.waiter) {
      clearTimeout(current.waiter.timer)
      const waiter = current.waiter
      current.waiter = undefined
      current.inFlight.set(pending.id, pending)
      waiter.resolve(pending)
    } else {
      current.queue.push(pending)
    }
  })
}

export function completeNativeCommand(id: string, commandId: string, result: unknown): boolean {
  const current = session(id)
  const pending = current.inFlight.get(commandId)
  if (pending) {
    current.inFlight.delete(commandId)
    pending.resolve(result)
  }
  return Boolean(pending)
}

export function isNativeDeviceOnline(info: NativeDeviceInfo): boolean {
  return Date.now() - info.lastSeen < 30_000
}

function publicInfo(info: NativeDeviceInfo): NativeDeviceInfo {
  return { id: info.id, name: info.name, ip: info.ip, mac: info.mac, firmware: info.firmware, lastSeen: info.lastSeen }
}