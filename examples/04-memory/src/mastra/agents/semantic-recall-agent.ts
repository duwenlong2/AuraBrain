/**
 * ============================================================
 * src/mastra/agents/semantic-recall-agent.ts
 * —— 记忆能力 ④：语义召回（Semantic Recall）
 * ============================================================
 *
 * 这是 Memory 的"检索型"能力，属于轻量 RAG。
 *
 * 前面三种记忆的本质：
 *   对话历史、工作记忆、观察性记忆 → 都是"主动塞进上下文"
 *
 * 语义召回的本质：
 *   "按需检索" —— 当用户的问题和过去某条消息"意思相近"时，
 *   才把那几条相关消息找出来塞进上下文。
 *
 * 为什么叫"语义"召回：
 *   不是靠关键词精确匹配（搜"灯"找"light"搜不到），
 *   而是把文字转成向量（一串数字），算"意思相似度"。
 *
 * 技术栈（需要三样）：
 *   1. vector：向量数据库（这里用 LibSQLVector，存在本地 mastra.db）
 *   2. embedder：把文字变成向量的模型
 *   3. semanticRecall：检索配置
 *
 * ⚠️ embedder 用法（@mastra/fastembed 新版 API）：
 *   - 直接传 fastembed 对象：fastembed.smallV2 / fastembed.baseV2
 *   - 这些都是英文模型（bge-small-en-v1.5 / bge-base-en-v1.5），
 *     对中文也能工作，只是精度略低于中文专用模型。
 *   - 如果需要远程 embedding，可用 openai/text-embedding-3-small（需 key）。
 *
 * 关键配置：
 *   topK: 3            → 最多找回 3 条最相似的
 *   messageRange: 2    → 每条结果前后各带 2 条，保持上下文连贯
 *   scope: 'resource'  → 跨所有对话检索
 *   threshold: 0.3     → 相似度低于 0.3 就不返回（避免无关结果）
 *
 * 体验方法（Studio）：
 *   1. 对话 A 里说："我下周要去日本出差，帮我准备行李清单"
 *   2. 新建对话 B，问："下周出差要带什么？" → 语义召回找到对话 A
 *   3. 关键：不是问"日本/行李"，而是换个说法，看它能否"理解意思"
 */
import { Agent } from '@mastra/core/agent';              // Agent 类
import { fastembed } from '@mastra/fastembed';            // 本地 embedding 模型（无需 API key）
import { LibSQLVector } from '@mastra/libsql';            // 向量数据库（存在本地文件）
import { Memory } from '@mastra/memory';                  // 记忆系统

// ★ 向量数据库：存"消息的向量表示"，供语义搜索
//   url 是 LibSQLVector 的正确参数（不是 connectionUrl），
//   这里和 Storage 共用同一个本地库 mastra.db
const vectorStore = new LibSQLVector({
  id: 'memory-vectors',
  url: 'file:./mastra.db',
});

// ★ embedding 模型：把文字转成向量
//   fastembed.smallV2 = 本地 bge-small-en-v1.5 模型（无需 API key，完全本地运行）
//   对中文也能工作；需要更高精度时换 fastembed.baseV2 或远程 openai embedding

export const semanticRecallAgent = new Agent({
  id: 'semantic-recall-agent',
  name: '语义召回 Agent',
  description: '演示语义召回：按意思相似度检索历史消息，跨对话找回相关记忆',

  instructions: `你是一个生活助理。用户会聊各种事情，你要自然地交流并帮助用户。
当用户问的问题可能和过去的对话相关时，你会自动获得相关记忆。
用中文回复，简洁。`,

  model: 'deepseek/deepseek-v4-flash',

  memory: new Memory({
    // ★ 向量存储（语义召回必须）
    vector: vectorStore,
    // ★ embedding 模型：本地运行，无需 API key
    embedder: fastembed.smallV2,
    options: {
      // ★ 语义召回配置
      semanticRecall: {
        topK: 3,               // 找回 3 条最相似的
        messageRange: 2,       // 每条前后各带 2 条
        scope: 'resource',     // 跨对话检索
        threshold: 0.3,        // 相似度下限
      },
      // 对话历史也保留少量，保证基本连贯
      lastMessages: 4,
      generateTitle: true,
    },
  }),
});
