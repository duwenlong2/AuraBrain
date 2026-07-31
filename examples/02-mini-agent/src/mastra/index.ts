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
import { LibSQLStore } from '@mastra/libsql';      // ★ LibSQL 存储（SQLite 系，本地文件）
import { calculatorAgent } from './agents/calculator-agent'; // 计算器 Agent

// 创建 Mastra 实例
export const mastra = new Mastra({
  // ★ 注册 Agent：key 是路由名，value 是 Agent 实例
  agents: { calculatorAgent },

  // ★ 配置存储：记忆/对话存到本地文件 mastra.db（持久化）
  storage: new LibSQLStore({
    id: 'mastra-storage',           // 存储实例的名字
    url: 'file:./mastra.db',        // 数据库文件路径（SQLite 就是一个文件）
  }),
});
