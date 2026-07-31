/**
 * ============================================================
 * src/mastra/index.ts —— 项目入口（总闸）
 * ============================================================
 *
 * 现在配了 Storage（LibSQL 数据库）：
 * 之前没配 → 内存存储（重启数据丢）
 * 现在配了 → 存到本地文件 mastra.db（重启数据还在）✅
 *
 * 数据流：npm run dev → 加载本文件 → 注册 Agent + Storage → 启动 Studio
 */
import { Mastra } from '@mastra/core/mastra';      // Mastra 核心类
import { LibSQLStore } from '@mastra/libsql';      // LibSQL 存储（SQLite 系，本地文件）
import {
  MastraStorageExporter,    // ★ 把可观测数据导出到本地存储（mastra.db）
  Observability,            // ★ 可观测性：记录每次运行的 trace
  SensitiveDataFilter,      // ★ 敏感数据过滤：API key 等不记录
} from '@mastra/observability';
import { calculatorAgent } from './agents/calculator-agent'; // 计算器 Agent

// 创建 Mastra 实例
export const mastra = new Mastra({
  // 注册 Agent：key 是路由名，value 是 Agent 实例
  agents: { calculatorAgent },

  // 配置存储：记忆/对话存到本地文件 mastra.db（持久化）
  storage: new LibSQLStore({
    id: 'mastra-storage',
    url: 'file:./mastra.db',
  }),

  // ★ 可观测性：每次运行的完整记录（调了哪个模型/工具、耗时、token）
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mini-agent',                // 服务名（区分来源）
        exporters: [
          new MastraStorageExporter(),            // 记录存到 mastra.db
        ],
        spanOutputProcessors: [new SensitiveDataFilter()], // 敏感数据脱敏
      },
    },
  }),
});
