/**
 * ============================================================
 * src/mastra/tools/device-control-tool.ts —— 设备控制工具（createTool 示例）
 * ============================================================
 *
 * 这是一个"模拟"智能家居设备控制工具，用来学习：
 *   1. 一个有"动作"（不只是查询）的工具怎么写
 *   2. 工具内部如何自己维护状态（这里用模块级变量模拟设备）
 *   3. Agent 如何通过自然语言触发"开灯/关灯/查状态"等动作
 *
 * ⚠️ 这是内存模拟，服务重启后设备状态会重置。
 *    真实项目里应该把设备状态存到数据库或实际调用硬件接口。
 */
import { createTool } from '@mastra/core/tools';   // Mastra 的工具工厂函数
import { z } from 'zod';                            // 数据校验库（定义参数和返回类型）

// ──────────────────────────────────────────────
// 用模块级变量模拟"家里的几台设备"
// 真实项目里，这些状态应该来自数据库 / 硬件 / API
// ──────────────────────────────────────────────
type DeviceState = {
  type: string;        // 设备类型
  power: boolean;      // 是否开机
  room: string;        // 所在房间
};

// 模拟 3 台设备：客厅灯、卧室空调、厨房风扇
const devices: Record<string, DeviceState> = {
  '客厅灯': { type: 'light', power: false, room: '客厅' },
  '卧室空调': { type: 'ac', power: false, room: '卧室' },
  '厨房风扇': { type: 'fan', power: false, room: '厨房' },
};

// 查询一台设备当前状态
function getDeviceState(name: string): DeviceState | undefined {
  return devices[name];
}

// 设置一台设备的开关状态
function setDevicePower(name: string, on: boolean): DeviceState | undefined {
  const device = devices[name];
  if (!device) return undefined;
  device.power = on;  // 直接修改模块变量里的设备状态
  return device;
}

/**
 * 设备控制工具
 *
 * 和"查询类工具"不同，这个工具有 3 个动作：
 *   - status：查询设备状态
 *   - turn_on：打开设备
 *   - turn_off：关闭设备
 *
 * Agent 会根据用户的自然语言，决定传入哪个 action。
 * 例如用户说"打开客厅灯"，Agent 会调用：
 *   { action: 'turn_on', deviceName: '客厅灯' }
 */
export const deviceControlTool = createTool({
  // 工具的唯一标识（Agent 调用时用的名字）
  id: 'device_control',

  // ★ 写给 Agent（AI）看的描述：必须写清楚"有哪些设备、能做什么动作"
  //    描述写得越清楚，Agent 越能正确选择设备名和动作
  description:
    'Control smart home devices. Available devices: 客厅灯 (light in living room), 卧室空调 (AC in bedroom), 厨房风扇 (fan in kitchen). Actions: status (query power state), turn_on (turn the device on), turn_off (turn the device off).',

  // 输入参数：要操作哪个设备 + 做什么动作
  inputSchema: z.object({
    deviceName: z.string().describe('The device name, e.g. "客厅灯", "卧室空调", "厨房风扇"'),
    action: z.enum(['status', 'turn_on', 'turn_off']).describe('What to do: status, turn_on, or turn_off'),
  }),

  // 返回结构：设备名 + 操作结果 + 当前状态
  outputSchema: z.object({
    deviceName: z.string(),
    action: z.enum(['status', 'turn_on', 'turn_off']),
    success: z.boolean(),
    power: z.boolean(),
    room: z.string(),
    message: z.string(),
  }),

  // ★ 真正干活的函数：根据 action 执行查询或开关
  execute: async ({ deviceName, action }) => {
    // 1. 先查设备是否存在
    const device = getDeviceState(deviceName);
    if (!device) {
      return {
        deviceName,
        action,
        success: false,
        power: false,
        room: 'unknown',
        message: `找不到设备「${deviceName}」。可用设备：客厅灯、卧室空调、厨房风扇`,
      };
    }

    // 2. 根据动作执行
    if (action === 'status') {
      return {
        deviceName,
        action,
        success: true,
        power: device.power,
        room: device.room,
        message: `「${deviceName}」当前${device.power ? '已开启' : '已关闭'}（位于${device.room}）`,
      };
    }

    if (action === 'turn_on' || action === 'turn_off') {
      const on = action === 'turn_on';
      const updated = setDevicePower(deviceName, on);  // 修改模拟状态
      return {
        deviceName,
        action,
        success: true,
        power: updated!.power,
        room: updated!.room,
        message: `已${on ? '打开' : '关闭'}「${deviceName}」`,
      };
    }

    // 兜底（理论上不会到这里，因为 inputSchema 已经限定了 action）
    return {
      deviceName,
      action,
      success: false,
      power: device.power,
      room: device.room,
      message: '未知动作',
    };
  },
});
