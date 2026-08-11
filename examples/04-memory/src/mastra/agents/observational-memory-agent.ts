/**
 * ============================================================
 * src/mastra/agents/observational-memory-agent.ts
 * —— 记忆能力 ③：观察性记忆（Observational Memory）
 * ============================================================
 *
 * 这是 Mastra 最独特、也最"聪明"的记忆能力。
 *
 * 前面两种的问题：
 *   对话历史：只能回放最近 N 条
 *   工作记忆：需要用户"显式"告诉你信息（靠模板引导）
 *
 * 观察性记忆的思路：
 *   不靠用户显式说，而是让一个"后台 Observer 模型"在对话进行中
 *   自动观察、提炼出值得长期记住的事实，存成"观察记录"。
 *   当观察太多时，再由"Reflector 模型"压缩合并，防止无限膨胀。
 *
 * 三段式结构（官方定义）：
 *   Observer（观察者）：从对话里提取值得记住的事实
 *   Reflector（反思者）：把大量观察压缩成更精炼的总结
 *   Scope（范围）：'thread'=当前对话 或 'resource'=跨对话
 *
 * 关键配置：observationalMemory
 *   true                    → 开启（用默认模型 gemini）
 *   { model, scope, ... }   → 自定义
 *
 * ⚠️ 重要注意：
 *   默认 Observer/Reflector 模型是 google/gemini-2.5-flash。
 *   本示例显式指定 Azure deployment，并把触发阈值调小，
 *   方便在 Studio 里快速看到效果。
 *
 * 体验方法（Studio）：
 *   1. 多轮对话，比如聊项目背景、偏好、家庭成员
 *   2. 观察性记忆触发后，打开 Traces 看 Observer 运行记录
 *   3. 新建对话，问一些"很久以前提过"的事 → 观察性记忆能跨对话召回
 */
import { Agent } from '@mastra/core/agent';      // Agent 类
import { Memory } from '@mastra/memory';          // 记忆系统

import { azureModel } from '../models/azure';

export const observationalMemoryAgent = new Agent({
  id: 'observational-memory-agent',
  name: '观察性记忆 Agent',
  description: '演示观察性记忆：后台自动提炼长期事实，跨对话保留',

  instructions: `你是一个生活助理，擅长聊天。
用户会和你聊一些日常话题（工作、家庭、爱好、计划）。
自然地交流即可，不要刻意提醒用户"我会记住"。用中文回复。`,

  model: azureModel,

  memory: new Memory({
    options: {
      // ★ 观察性记忆配置
      observationalMemory: {
        // 开启
        enabled: true,
        // 先使用线程级观察验证 Observer；当前版本 resource 级同步观察存在兼容限制
        scope: 'thread',
        // Observer/Reflector 使用 Azure 部署模型
        model: azureModel,
        observation: {
          // 触发观察的未观察消息 token 数
          // 默认 30000，这里调小，方便快速看到效果
          messageTokens: 2000,
          // thread scope 支持异步 buffering；单步 Studio 请求依赖它触发 Observer
          bufferTokens: 0.2,
        },
      },
      generateTitle: true,
    },
  }),
});
