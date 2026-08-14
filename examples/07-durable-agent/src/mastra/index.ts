import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';

import { durableAgent } from './agents/durable-agent';

export const mastra = new Mastra({
  agents: {
    durableAgent,
  },
  storage: new LibSQLStore({
    id: 'durable-agent-storage',
    url: 'file:./durable-agent.db',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'durable-agent-learning',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
