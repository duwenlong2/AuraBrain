/**
 * ============================================================
 * src/mastra/agents/device-agent.ts —— 设备助手 Agent
 * ============================================================
 *
 * 这是一个"专用 Agent"：只挂一个工具 device_control。
 * 用来学习：
 *   1. 如何让 Agent 通过自然语言控制设备（开灯/关灯/查状态）
 *   2. Agent 的 instructions 如何引导它使用工具
 *   3. 为什么"专用小 Agent + 专用工具"比"一个大 Agent 什么都会"更清晰
 *
 * 对比 hello-agent（天气助手）：结构完全一样，只是换了工具。
 */
import { Agent } from '@mastra/core/agent';                    // Agent 类
import { deviceControlTool } from '../tools/device-control-tool'; // 设备控制工具

// 设备助手 Agent：负责理解和操作智能家居设备
export const deviceAgent = new Agent({
  id: 'device-agent',
  name: 'Device Assistant',
  description: 'A smart home assistant that can query and control home devices.',
  // 系统提示词：告诉 Agent 它是谁、该怎么表现
  // ★ 关键：明确告诉它"用 device_control 工具"，并提醒它先查状态再操作
  instructions: `You are a smart home assistant. You control devices in the user's home.
Available devices: 客厅灯 (living room light), 卧室空调 (bedroom AC), 厨房风扇 (kitchen fan).
When the user asks to control or check a device, ALWAYS use the device_control tool.
If the user says "打开客厅灯", call device_control with action "turn_on" and deviceName "客厅灯".
If the user says "关空调", call device_control with action "turn_off" and deviceName "卧室空调".
If the user asks about a device's status, call device_control with action "status".
Be concise and report the result in Chinese.`,
  // 模型：和其他 Agent 保持一致（DeepSeek）
  model: 'deepseek/deepseek-v4-flash',
  // 工具集合：只挂一个设备控制工具
  tools: {
    device_control: deviceControlTool,
  },
});
