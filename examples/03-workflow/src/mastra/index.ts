/**
 * ============================================================
 * src/mastra/index.ts —— 项目入口（总闸）
 * ============================================================
 *
 * 和 01/02 相比，这次注册的不是 Agent，而是 Workflow。
 *
 * 数据流：npm run dev → 加载本文件 → 注册 Workflow → 启动 Studio
 *         → Studio 的 Workflows 标签页里选 climate-workflow
 *         → 右侧输入表单填温度/湿度 → 点运行 → 看图实时跑
 *
 * 说明：本示例已经配置 Storage / Observability，
 *       用来学习 Workflow 状态持久化和运行 trace。
 */
import { Mastra } from '@mastra/core/mastra';          // Mastra 核心类
import { LibSQLStore } from '@mastra/libsql';          // 本地 SQLite 风格存储
import { climateWorkflow } from './workflows/climate-workflow'; // 我们的 Workflow
import { bankDepositWorkflow } from './workflows/bank-deposit-workflow';
import { stateWorkflow } from './workflows/state-workflow';
import {
  MastraStorageExporter,    // ★ 把可观测数据导出到本地存储（mastra.db）
  Observability,            // ★ 可观测性：记录每次运行的 trace
  SensitiveDataFilter,      // ★ 敏感数据过滤：API key 等不记录
} from '@mastra/observability';
// 创建 Mastra 实例
export const mastra = new Mastra({
  // 把 Workflow 的运行状态保存到本地文件，服务重启后仍可读取。
  storage: new LibSQLStore({
    id: 'workflow-storage',
    url: 'file:./mastra.db',
  }),

  // ★ 注册 Workflow：key 是 Studio 里显示/路由用的名字
  workflows: {
    climateWorkflow,
    bankDepositWorkflow,
    stateWorkflow,
  },
  // ★ 可观测性：记录每次运行的完整 trace
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'workflow-demo',                // 服务名（区分来源）
        exporters: [
          new MastraStorageExporter(),            // 记录存到 mastra.db
        ],
        spanOutputProcessors: [new SensitiveDataFilter()], // 敏感数据脱敏
      },
    },
  }),
});
