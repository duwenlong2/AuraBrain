/**
 * ============================================================
 * src/mastra/index.ts —— 04-memory 项目入口（总闸）
 * ============================================================
 *
 * 这个项目专门深度学习 Mastra 的 Memory 能力，包含 4 个 Agent，
 * 每个演示一种记忆能力：
 *
 *   conversation-history-agent   对话历史（默认能力）
 *   working-memory-agent         工作记忆（结构化用户档案）
 *   observational-memory-agent   观察性记忆（后台自动提炼）
 *   semantic-recall-agent        语义召回（向量按意思检索）
 *
 * 共同前提：必须配 Storage（这里用 LibSQL 本地文件 mastra.db），
 * 否则 Memory 只存在内存里，重启就丢。
 */
import { Mastra } from '@mastra/core/mastra';          // Mastra 核心类
import { LibSQLStore } from '@mastra/libsql';          // 主存储（记忆/对话存这里）
import {
  MastraStorageExporter,    // 把可观测数据导出到本地存储
  Observability,            // 可观测性：记录每次运行 trace
  SensitiveDataFilter,      // 敏感数据过滤
} from '@mastra/observability';

// 四个记忆 Agent
import { conversationHistoryAgent } from './agents/conversation-history-agent';
import { workingMemoryAgent } from './agents/working-memory-agent';
import { observationalMemoryAgent } from './agents/observational-memory-agent';
// 语义召回 Agent：用 @mastra/fastembed 本地 embedding（无需 API key）
// 安装后自动启用。它需要 fastembed 的推理引擎 onnxruntime-node。
import { semanticRecallAgent } from './agents/semantic-recall-agent';

// 创建 Mastra 实例
export const mastra = new Mastra({
  // 注册 4 个 Agent
  agents: {
    conversationHistoryAgent,
    workingMemoryAgent,
    observationalMemoryAgent,
    semanticRecallAgent,
  },

  // ★ Storage：所有记忆（对话、工作记忆、观察记录）都存在本地文件
  //   没有它，Memory 只在内存中，重启就丢
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),

  // 可观测性：方便在 Traces 里观察每个 Agent 的 memory recall/save 步骤
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'memory-deep-dive',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
