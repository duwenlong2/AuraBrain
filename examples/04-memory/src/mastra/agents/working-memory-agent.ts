/**
 * ============================================================
 * src/mastra/agents/working-memory-agent.ts
 * —— 记忆能力 ②：工作记忆（Working Memory）
 * ============================================================
 *
 * 对话历史（能力①）有个问题：只记住"最近几条"，而且按对话隔离。
 * 工作记忆解决的是：
 *   "用户的长期信息（偏好、习惯、项目背景）能不能结构化地持久保存？"
 *
 * 原理（一句话）：
 *   定义一个"用户档案"模板，Agent 每次对话时把新知道的用户信息
 *   写进这份档案；以后每次对话都会带着这份档案。
 *
 * 关键配置：workingMemory
 *   enabled: true            → 开启
 *   scope: 'resource'        → 跨所有对话共享（resource 通常=一个用户）
 *                            → 'thread' = 只在当前对话内
 *   template / schema        → 定义"档案"长什么样
 *
 * 两种档案格式：
 *   1. Markdown 模板：template 字段，一段带空格的文本
 *   2. Schema 模板：schema 字段，用 zod 定义结构化字段（推荐，便于程序读取）
 *
 * 体验方法（Studio）：
 *   - 对话 A 说："我叫小明，我在做一个智能家居项目，喜欢简洁的回答"
 *   - 新建对话 B 直接问："我的项目是什么？" → 还记得（因为存进了档案）
 *
 * 与对话历史的本质区别：
 *   对话历史 = 原始消息的"回放"（按条数）
 *   工作记忆 = 提炼后的"档案"（结构化、按模板）
 */
import { Agent } from '@mastra/core/agent';      // Agent 类
import { Memory } from '@mastra/memory';          // 记忆系统
import { z } from 'zod';                          // 定义档案结构

// ★ 用 zod 定义"用户档案"的结构
// 这样 Agent 知道该收集哪些信息，程序也能按字段读取
const userProfileSchema = z.object({
  name: z.string().describe('用户的名字'),
  project: z.string().describe('用户正在做的项目'),
  communicationStyle: z.string().describe('用户喜欢的回答风格，例如简洁、详细、中文'),
  devices: z.array(z.string()).describe('用户家里的智能设备列表'),
});

export const workingMemoryAgent = new Agent({
  id: 'working-memory-agent',
  name: '工作记忆 Agent',
  description: '演示工作记忆：结构化保存用户长期信息，跨对话保留',

  instructions: `你是一个智能家居助手。
当用户告诉你个人信息（名字、项目、偏好、设备）时，
要把这些信息写进你的工作记忆（调用 updateWorkingMemory 工具）。
回答要简洁，用中文。`,

  model: 'deepseek/deepseek-v4-flash',

  memory: new Memory({
    options: {
      // ★ 工作记忆配置
      workingMemory: {
        enabled: true,
        // 'resource' = 跨所有对话保留（相当于"一个用户的长期档案"）
        scope: 'resource',
        // 用 zod schema 定义档案结构
        schema: userProfileSchema,
      },
      generateTitle: true,
    },
  }),
});
