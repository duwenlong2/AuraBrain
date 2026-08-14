import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';

import { loopAgent } from './agents/loop-agent';

export const mastra = new Mastra({
  agents: {
    loopAgent,
  },
  storage: new LibSQLStore({
    id: 'agent-loop-storage',
    url: 'file:./agent-loop.db',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'agent-loop-learning',
        exporters: [new MastraStorageExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
