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
 * 说明：本示例刻意不配 Storage / Observability（保持"最小 MVP"，
 *       聚焦 Workflow 这一个知识点）。想要持久化运行记录/看 trace，
 *       参考 02-mini-agent 的 index.ts，照抄那两段配置即可。
 */
import { Mastra } from '@mastra/core/mastra';          // Mastra 核心类
import { climateWorkflow } from './workflows/climate-workflow'; // 我们的 Workflow

// 创建 Mastra 实例
export const mastra = new Mastra({
  // ★ 注册 Workflow：key 是 Studio 里显示/路由用的名字
  workflows: {
    climateWorkflow,
  },
});
