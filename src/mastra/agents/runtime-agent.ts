import { Agent } from '@mastra/core/agent'
import { resolveMastraModel } from '../../main/lib/model-runtime.ts'
import { allCalendarTools } from '../../main/tools/calendar-tools.ts'
import { allMailTools } from '../../main/tools/mail-tools.ts'
import { allOutlookTools } from '../../main/tools/outlook-tools.ts'

export const runtimeAgent = new Agent({
  id: 'aurabrain-runtime-agent',
  name: 'AuraBrain Runtime Agent',
  description: 'Uses the model configured in AuraBrain and can access the registered mail and calendar tools.',
  instructions: `You are the AuraBrain Runtime assistant.
Use the available mail and calendar tools when the user asks about connected accounts.
Do not claim that an operation succeeded unless a tool result confirms it.
Keep answers concise and explain when a connection or capability is not configured.`,
  model: async () => resolveMastraModel(),
  tools: {
    ...allMailTools,
    ...allCalendarTools,
    ...allOutlookTools,
  },
})
