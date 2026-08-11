// Mastra 是应用入口：负责注册 Agent、Storage 和 Observability。
import { Mastra } from '@mastra/core/mastra';
// Memory、任务状态和 OM 记录等持久化数据放在本地 LibSQL 文件中。
import { LibSQLStore } from '@mastra/libsql';
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';

import { workspaceAgent } from './agents/workspace-agent';

export const mastra = new Mastra({
  // 只有注册后，workspace-agent 才会出现在 Studio 和 /api/agents 中。
  agents: {
    workspaceAgent,
  },

  // 这里的 Storage 不是 Workspace 文件目录。
  // workspace/ 保存 Agent 操作的文件；workspace.db 保存 Memory 和运行数据。
  storage: new LibSQLStore({
    id: 'workspace-storage',
    url: 'file:./workspace.db',
  }),

  // Observability 用来记录模型调用、Workspace 工具调用和审批相关 Trace。
  // SensitiveDataFilter 避免敏感输出直接进入观测数据。
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'workspace-learning',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
