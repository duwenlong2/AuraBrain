import type { NativeDeviceConfig } from './config-store.ts'

export type NativeDeviceResponse = {
  ok: boolean
  status: number
  data?: unknown
  error?: string
}

function urlFor(device: NativeDeviceConfig, route: string): string {
  return `${device.baseUrl.replace(/\/$/, '')}/${route}`
}

async function request(device: NativeDeviceConfig, route: string, init?: RequestInit): Promise<NativeDeviceResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(urlFor(device, route), {
      ...init,
      signal: controller.signal,
      headers: { accept: 'application/json', ...(init?.headers || {}) },
    })
    const text = await response.text()
    let data: unknown = text
    try { data = text ? JSON.parse(text) : null } catch { /* allow plain text device responses */ }
    return response.ok
      ? { ok: true, status: response.status, data }
      : { ok: false, status: response.status, data, error: `设备返回 HTTP ${response.status}` }
  } catch (error: any) {
    return { ok: false, status: 0, error: error?.name === 'AbortError' ? '设备响应超时' : error?.message || String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export function getNativeDeviceStatus(device: NativeDeviceConfig): Promise<NativeDeviceResponse> {
  return request(device, 'status')
}

export function sendNativeDeviceCommand(device: NativeDeviceConfig, command: string, params: Record<string, unknown>): Promise<NativeDeviceResponse> {
  return request(device, 'command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, params }),
  })
}