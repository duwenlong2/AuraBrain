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
 * ============================================================
 * workingMemory 配置详解（全部参数）
 * ============================================================
 *
 * workingMemory: {
 *   enabled: boolean,          // 必填：是否开启
 *
 *   scope: 'resource'|'thread',// 作用域（默认 'resource'）
 *     'resource' = 跨所有对话共享（同一个用户的所有会话都能读到）
 *     'thread'   = 只在这场对话内有效（不同对话各自独立）
 *
 *   // ---- 二选一：template 或 schema（不能同时给）----
 *   template: string,          // Markdown 模板（"替换式"更新）
 *   schema: ZodObject,         // Zod 结构（"合并式"更新，推荐）
 *
 *   // ---- 可选进阶 ----
 *   agentManaged: boolean,     // 是否让 Agent 用 updateWorkingMemory 工具
 *                              // 来维护档案（默认 true）
 *                              // 设 false = 档案由程序管理，Agent 只读
 * }
 *
 * ============================================================
 * template（Markdown 模板）vs schema（Zod 结构）
 * ============================================================
 *
 * ① template：一段 Markdown 文本，带占位空行
 *
 *   template: `
 *   # User Profile
 *   - **Name**:
 *   - **Project**:
 *   - **Style**:
 *   `
 *
 *   - 更新方式：REPLACE（替换式）
 *     Agent 每次必须给出"完整的新文本"替换旧文本
 *   - 优点：自由、像人写笔记
 *   - 缺点：不可靠（Agent 可能改坏格式）、程序难以按字段读取
 *
 * ② schema：Zod 定义的结构化字段（本项目用的）
 *
 *   schema: z.object({ name: z.string(), project: z.string() })
 *
 *   - 更新方式：MERGE（合并式）
 *     Agent 只需要给"要改的字段"，没给的字段自动保留
 *   - 优点：
 *     a. 结构稳定：字段和类型固定，Agent 不会写歪
 *     b. 可校验：数据经过 zod 校验，类型错误会报错
 *     c. 可被程序读取：你的代码能按字段拿到结构化数据
 *     d. 天然支持"只更新一部分"（merge 语义）
 *   - 缺点：字段要提前设计好（改结构要改代码）
 *
 * ============================================================
 * schema 数据长什么样（实例）
 * ============================================================
 *
 * 用户说："我叫小明，在做一个智能家居项目，喜欢简洁回答，家里有客厅灯"
 *
 * 存进工作记忆的 JSON 大概是：
 *
 * {
 *   "name": "小明",
 *   "project": "智能家居项目",
 *   "communicationStyle": "简洁",
 *   "devices": ["客厅灯"]
 * }
 *
 * 下次用户只说："我又买了卧室空调"
 * 因为 merge 语义，只需要更新 devices：
 *
 * {
 *   "devices": ["客厅灯", "卧室空调"]
 * }
 * → 合并后实际变成：
 * {
 *   "name": "小明",                       ← 没动，保留
 *   "project": "智能家居项目",            ← 没动，保留
 *   "communicationStyle": "简洁",        ← 没动，保留
 *   "devices": ["客厅灯", "卧室空调"]     ← 只更新了这里
 * }
 *
 * ⚠️ merge 的规则：
 *   - 对象字段：深合并（只覆盖给的字段）
 *   - 数组字段：整个替换（不是逐项合并）
 *   - 设为 null：删除该字段
 */
import { Agent } from '@mastra/core/agent';      // Agent 类
import { Memory } from '@mastra/memory';          // 记忆系统
import { z } from 'zod';                          // 定义档案结构

// ★ 用 zod 定义"用户档案"的结构
// 这样 Agent 知道该收集哪些信息，程序也能按字段读取
// 每个字段都用 .describe() 告诉 Agent 该填什么
const userProfileSchema = z.object({
  name: z.string().describe('用户的名字'),
  project: z.string().describe('用户正在做的项目'),
  communicationStyle: z.string().describe('用户喜欢的回答风格，例如简洁、详细、中文'),
  devices: z.array(z.string()).describe('用户家里的智能设备列表'),
});

// 想体验"Markdown 模板"版本？把下面这段取消注释、并注释掉 schema 那行：
//
// const userProfileTemplate = `
// # User Profile
// - **Name**:
// - **Project**:
// - **Style**:
// - **Devices**:
// `;

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
        // 必填：开启工作记忆
        enabled: true,

        // 作用域：
        //   'resource' = 同一个用户的所有对话共享这份档案（长期记忆）
        //   'thread'   = 只在当前对话内有效（切换对话就独立）
        scope: 'resource',

        // 档案格式：用 zod schema（结构稳定、可校验、可程序读取）
        // 如果要用 Markdown 模板，改成：
        //   template: userProfileTemplate,
        schema: userProfileSchema,

        // 可选：agentManaged
        //   默认 true  = Agent 会收到 updateWorkingMemory 工具，
        //                自己负责更新档案（最常用）
        //   设 false   = Agent 只读档案，由你的程序负责更新
        // agentManaged: true,
      },
      generateTitle: true,
    },
  }),
});
