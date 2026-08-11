import { MCPClient } from '@mastra/mcp';

const parallelSearchMcp = new MCPClient({
  servers: {
    'parallel-free': {
      url: new URL('https://search.parallel.ai/mcp'),
    },
  },
  timeout: 30_000,
});

export function getParallelSearchTools() {
  return parallelSearchMcp.listTools();
}
