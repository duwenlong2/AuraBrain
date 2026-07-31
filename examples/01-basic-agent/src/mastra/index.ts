/**
 * ============================================================
 * src/mastra/index.ts —— Mastra 项目入口（总闸）
 * ============================================================
 *
 * 这个文件是整个 Mastra 应用的"注册中心"：
 * 所有 Agent、工具、存储、可观测性都要在这里配置，
 * 否则 Studio 里看不到、也用不了。
 *
 * 数据流：
 *   npm run dev
 *     → Mastra CLI 加载本文件
 *     → 注册 Agent 和工具
 *     → 启动 Studio（http://localhost:4111）
 */
import { Mastra } from '@mastra/core/mastra';              // Mastra 框架核心类（创建整个应用）
import { LibSQLStore } from '@mastra/libsql';              // LibSQL 存储（主数据库，SQLite 系，保存记忆/任务）
import { DuckDBStore } from '@mastra/duckdb';              // DuckDB 存储（可观测性/分析用）
import { MastraCompositeStore } from '@mastra/core/storage'; // 复合存储：不同数据可存不同数据库
import {
  MastraStorageExporter,    // 把可观测数据导出到本地存储
  Observability,            // 可观测性：记录每次运行的完整 trace
  SensitiveDataFilter,      // 敏感数据过滤：API key 等不记录到日志
} from '@mastra/observability';
import { agent } from './agents/agent';                    // 通用助手 Agent（web_fetch 等 4+ 工具）
import { helloAgent } from './agents/hello-agent';         // 天气助手 Agent（只有 weather_query 工具）
import { startScheduleTool, stopScheduleTool } from './tools/schedule-tools'; // 定时任务工具（创建/暂停）
import { webFetchTool } from './tools/web-fetch-tool';     // 网页抓取工具（Agent 可抓任意网页）
import { weatherTool } from './tools/weather-tool';        // 天气工具（目前是模拟假数据）

// 创建 Mastra 实例：整个应用的核心对象
export const mastra = new Mastra({
  // ★ 注册 Agent：key 是 Studio 里显示和路由用的名字
  agents: { agent, helloAgent },

  // ★ 注册工具：这些工具会被所有 Agent 共享使用
  tools: { startScheduleTool, stopScheduleTool, webFetchTool, weatherTool },

  // 存储配置：不同数据存不同数据库（复合存储）
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    // 主存储：LibSQL —— 保存 Agent 记忆、任务、定时任务
    default: new LibSQLStore({
      id: 'mastra-storage',
      url: process.env.TURSO_DATABASE_URL || 'file:./mastra.db', // 默认存本地文件 mastra.db
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,      // 用 Turso 云端时填 token
    }),
    // 分域存储：可观测性数据单独存 DuckDB（分析查询更快）
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    },
  }),

  // 可观测性：记录每次运行（调了哪个模型、哪个工具、耗时多少）
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(),   // 观测数据落库（存到上面配的 DuckDB）
          // 说明：没用 Mastra 平台（无 token），所以不配 MastraPlatformExporter
        ],
        spanOutputProcessors: [new SensitiveDataFilter()], // 敏感数据自动脱敏
      },
    },
  }),
});
