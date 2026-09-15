import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { enqueueNativeCommand, getNativeDevice, isNativeDeviceOnline, listNativeDevices } from '../lib/native-device-registry.ts'

function deviceOrThrow(deviceId: string) {
  const device = getNativeDevice(deviceId)
  if (!isNativeDeviceOnline(device)) throw new Error(`Native 设备不在线：${deviceId}`)
  return device
}

export const nativeDeviceListTool = createTool({
  id: 'native-device-list',
  description: '列出 AuraBrain 已配置的 native 设备及其地址。',
  inputSchema: z.object({}),
  execute: async () => listNativeDevices().map(device => ({ ...device, online: isNativeDeviceOnline(device) })),
})

export const nativeDeviceStatusTool = createTool({
  id: 'native-device-status',
  description: '读取指定 native 设备的在线状态、固件信息和传感器摘要。',
  inputSchema: z.object({ deviceId: z.string().describe('native 设备 ID，例如 esp32') }),
  execute: async ({ deviceId }) => deviceOrThrow(deviceId),
})

export const nativeDeviceCommandTool = createTool({
  id: 'native-device-command',
  description: '向指定 native 设备发送控制命令。只有设备协议明确支持的命令才会执行。',
  inputSchema: z.object({
    deviceId: z.string().describe('native 设备 ID，例如 esp32'),
    command: z.string().min(1).max(120).describe('设备命令名，例如 led.set'),
    params: z.record(z.string(), z.unknown()).optional().describe('命令参数'),
  }),
  execute: async ({ deviceId, command, params }) => enqueueNativeCommand(deviceOrThrow(deviceId).id, command, params || {}),
})

export const allNativeDeviceTools = { nativeDeviceListTool, nativeDeviceStatusTool, nativeDeviceCommandTool }