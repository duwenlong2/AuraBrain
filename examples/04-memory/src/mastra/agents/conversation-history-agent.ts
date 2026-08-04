/**
 * ============================================================
 * src/mastra/agents/conversation-history-agent.ts
 * —— 记忆能力 ①：对话历史（Conversation History）
 * ============================================================
 *
 * 这是 Memory 最基础、也是默认开启的能力。
 *
 * 原理（一句话）：
 *   每次对话时，Mastra 会把"最近的几条消息"也塞进模型的上下文，
 *   所以 Agent 能"记得"刚才说过的话。
 *
 * 关键配置：lastMessages
 *   lastMessages: 10  → 上下文里带上最近 10 条消息（默认值）
 *   lastMessages: 5   → 只带最近 5 条
 *   lastMessages: false → 完全关闭对话历史（每句话都失忆）
 *
 * 局限（重要）：
 *   1. 只覆盖"最近的 N 条"，太早的话会超出范围而忘掉
 *   2. 只针对同一个对话线程（thread），新建对话就从头开始
 *   3. 对话越长，塞进上下文的越多，token 成本越高
 *
 * 体验方法（Studio）：
 *   - 问："我叫小明，我最喜欢的颜色是蓝色"
 *   - 下一句直接问："我叫什么？" → 记得（同一线程内）
 *   - 新建一个对话再问 → 失忆（不同线程）
 */
import { Agent } from '@mastra/core/agent';      // Agent 类
import { Memory } from '@mastra/memory';          // 记忆系统

export const conversationHistoryAgent = new Agent({
  id: 'conversation-history-agent',
  name: '对话历史 Agent',
  description: '演示 Memory 最基础的能力：记住同一对话里的最近消息',

  instructions: `你是一个用来演示"对话历史记忆"的助手。
用户会在同一个对话里告诉你一些个人信息，然后反过来考你。
你要认真记住并在被问到的时候回答。用中文回复，简洁。`,

  model: 'deepseek/deepseek-v4-flash',

  // ★ 记忆配置
  memory: new Memory({
    options: {
      // 对话历史：带上最近 6 条消息
      // 试试改成 2，然后连续说 3 件事再问第一件，看是不是忘了
      lastMessages: 6,

      // 自动生成对话标题（方便在 Studio 左侧列表区分）
      generateTitle: true,
    },
  }),
});
