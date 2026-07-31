/**
 * ============================================================
 * src/mastra/agents/agent.ts —— 通用助手 Agent
 * ============================================================
 *
 * 这个 Agent 是官方模板自带的"通用助手"：
 * - 挂载了多种工具（web_fetch、ask_user、定时任务等）
 * - 能研究信息、管理任务、读写文件、执行命令、设定时任务
 * - 模型：DeepSeek V4 Flash（在 .env 配 DEEPSEEK_API_KEY）
 *
 * 它是"Agent = 系统提示词 + 工具集合 + 模型"的最好示例。
 */
import { pathToFileURL } from 'node:url';   // 把本地路径转成 file:// URL（给 Agent 汇报文件位置用）

import { Agent } from '@mastra/core/agent';             // Agent 类（Mastra 核心）
import { TaskSignalProvider } from '@mastra/core/signals'; // 任务信号机制（Agent 长任务的状态信号）
import { askUserTool } from '@mastra/core/tools';       // 内置工具：向用户提问（human-in-the-loop）
import { LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace'; // 工作空间相关
import { Memory } from '@mastra/memory';                // 记忆系统（记住对话历史）

import { webFetchTool } from '../tools/web-fetch-tool';          // 网页抓取工具
import { startScheduleTool, stopScheduleTool } from '../tools/schedule-tools'; // 定时任务工具

// Agent 的文件工作目录（相对项目根）
const workspacePath = 'workspace';

/**
 * 工作空间（Workspace）：给 Agent 一块"专属沙箱"目录
 * - Agent 只能在这个目录里读写文件、执行命令（安全边界）
 * - 每个文件操作都可以配置审批策略
 */
const workspace = new Workspace({
  id: 'agent-workspace',
  name: 'Agent Workspace',
  filesystem: new LocalFilesystem({
    basePath: workspacePath,   // 文件系统根目录 = workspace/
  }),
  sandbox: new LocalSandbox({
    workingDirectory: workspacePath,   // 命令执行的工作目录 = workspace/
  }),
  tools: {
    // 安全策略：写文件前必须先读（防止覆盖不知道的内容）
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireReadBeforeWrite: true,
    },
    // 编辑文件前必须先读
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      requireReadBeforeWrite: true,
    },
    // 删除文件需要用户审批
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      requireApproval: true,
    },
  },
});

/**
 * 通用助手 Agent 定义
 *
 * 理解 Agent 的三个核心字段：
 * - instructions：系统提示词（决定 Agent 的性格和行为）
 * - model：用哪个大模型（字符串格式 "提供商/模型名"）
 * - tools：挂载哪些工具（决定 Agent 能干什么）
 */
export const agent = new Agent({
  id: 'agent',
  name: 'Agent',
  description:
    'A general-purpose assistant that can research, manage tasks, work with local files, run approved commands, and create recurring schedules.',
  // ★ 系统提示词：Agent 的"人设 + 行为准则"
  // 注意：这里用的是模板字符串，里面嵌入了 file:// URL 让 Agent 知道文件位置
  instructions: `You are a friendly starter agent for exploring what Mastra can do. Help the user try useful capabilities, build small projects, answer current questions, and shape this harness into a starting point for future work.

Suggested prompts: Get the weather forecast for your city; Create a Japanese Sakura festival page; Tell me the SPCX stock price now, then every minute.

When the user greets you or does not have a specific task, invite them to try the suggested prompts.

Ask concise questions when something is unclear or a good question could surface a useful insight.

For local file changes, end with a plain-text URL using ${pathToFileURL(`${workspacePath}/`).href}; avoid Markdown links, localhost, /workspace, relative paths, and static-file servers.
`,
  // ★ 模型：DeepSeek V4 Flash（provider/模型名 格式，Mastra 自动路由）
  model: 'deepseek/deepseek-v4-flash',
  defaultOptions: {
    maxSteps: 100,                    // Agent 推理循环最多 100 步（防止无限循环）
    autoResumeSuspendedTools: true,   // 暂停的工具自动恢复
  },
  // 记忆系统：让 Agent 记住对话历史
  memory: new Memory({
    options: {
      generateTitle: true,            // 自动为对话生成标题
      observationalMemory: {          // 观察性记忆：从对话中提取关键信息长期保存
        model: 'deepseek/deepseek-chat',  // 用更便宜的模型做提取
      },
    },
  }),
  workspace,  // 挂载工作空间（Agent 的文件沙箱）
  // ★ 工具集合：Agent 的"手脚"，靠 description 决定用哪个
  tools: {
    ask_user: askUserTool,            // 向用户提问
    start_schedule: startScheduleTool, // 创建定时任务
    stop_schedule: stopScheduleTool,  // 暂停定时任务
    web_fetch: webFetchTool,          // 抓网页（Agent 曾用它查真实天气！）
  },
  signals: [new TaskSignalProvider()], // 任务信号（长任务状态追踪）
});
