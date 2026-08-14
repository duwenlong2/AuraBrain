import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const projectData = {
  AuraBrain: {
    summary: '硬件端 AuraCore 通过 MQTT 连接云端 AuraBrain，云端使用 Mastra 编排 Agent。',
    stack: ['TypeScript', 'Mastra', 'Azure OpenAI', 'LibSQL', 'MQTT'],
    status: 'active',
  },
} as const;

export const inspectProjectTool = createTool({
  id: 'inspect-project',
  description: '查看项目的基本目标、技术栈和当前状态。用户询问项目概况时使用。',
  inputSchema: z.object({
    project: z.string().describe('项目名称，例如 AuraBrain'),
  }),
  execute: async ({ project }) => {
    const data = projectData[project as keyof typeof projectData];
    return data
      ? { project, found: true, ...data }
      : { project, found: false, message: '没有找到这个项目的概览数据。' };
  },
});

export const inspectChangesTool = createTool({
  id: 'inspect-recent-changes',
  description: '查看项目最近的开发变化和当前学习进度。用户询问进展、完成情况或下一步时使用。',
  inputSchema: z.object({
    project: z.string(),
  }),
  execute: async ({ project }) => ({
    project,
    recentChanges: [
      '完成 Memory 和 Observational Memory 学习',
      '完成 Workspace、Filesystem、Sandbox、Approval 学习',
      '接入 Parallel Search MCP 并完成真实搜索验证',
      '正在学习 Agent Loop 的多轮工具调用机制',
    ],
    nextStep: '使用更多真实项目任务验证 Agent 如何动态选择工具。',
  }),
});

export const runQualityChecksTool = createTool({
  id: 'run-project-quality-checks',
  description: '返回项目当前已验证的类型检查、构建和隐私数据检查结果。用户询问质量、验证或能否提交时使用。',
  inputSchema: z.object({
    project: z.string(),
    scope: z.enum(['typecheck', 'build', 'privacy', 'all']).default('all'),
  }),
  execute: async ({ project, scope }) => ({
    project,
    scope,
    checks: [
      { name: 'TypeScript typecheck', status: 'passed', evidence: 'npx tsc --noEmit' },
      { name: 'Mastra build', status: 'passed', evidence: 'npx mastra build' },
      { name: 'Sensitive data scan', status: 'passed', evidence: '.env and *.db are ignored' },
    ],
  }),
});
