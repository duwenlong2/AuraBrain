import path from 'node:path';

// Agent 是执行决策的主体：它决定什么时候读文件、写文件或执行命令。
import { Agent } from '@mastra/core/agent';
// Workspace 不是另一个 Agent，而是挂载到 Agent 上的一组受控能力。
import { LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace';
import { Memory } from '@mastra/memory';

import { azureModel } from '../models/azure';
import { getParallelSearchTools } from '../tools/mcp/parallel-search';

// Mastra Dev 的实际服务进程可能以 src/mastra/public 为当前目录启动。
// 使用 INIT_CWD 固定指向 npm 启动项目的根目录，避免相对路径被解析到 public/workspace。
const projectRoot = process.env.INIT_CWD ?? process.cwd();
// 所有文件操作和命令执行都以项目根目录下的 workspace/ 为根目录。
// LocalFilesystem 会把文件路径限制在这里；Agent 不应该直接操作项目根目录。
const workspacePath = path.join(projectRoot, 'workspace');

// Workspace 把“文件系统、命令执行环境、安全策略”组合成一个可挂载对象。
const workspace = new Workspace({
  // id 用于标识这个 Workspace；name 主要用于 Studio 和调试信息。
  id: 'learning-workspace',
  name: 'Learning Workspace',

  // 文件工具：list、read、write、edit、delete 等都会通过这个 filesystem 执行。
  filesystem: new LocalFilesystem({
    basePath: workspacePath,
  }),

  // 命令工具：命令的当前工作目录是 workspace/，但这不是操作系统级沙箱。
  // 官方模板也特别提醒：LocalSandbox 默认不提供 OS 隔离，不要把它暴露给未认证的公网服务。
  sandbox: new LocalSandbox({
    workingDirectory: workspacePath,
  }),

  // tools 配置的是“每种 Workspace 工具的安全策略”，不是 Agent 的普通业务工具。
  tools: {
    // 写入前必须先读过目标文件，避免 Agent 在不了解原内容时直接覆盖它。
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      requireReadBeforeWrite: true,
    },
    // 编辑和写入不同：edit 通常是对已有文件做局部修改，因此同样要求先读取。
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      requireReadBeforeWrite: true,
    },
    // 删除是不可逆的高风险操作，交给 Studio 的 Approval 流程等待用户确认。
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
      requireApproval: true,
    },
  },
});

export const workspaceAgent = new Agent({
  // Agent 的 id 是 Studio/API 路由使用的稳定标识。
  id: 'workspace-agent',
  name: 'Workspace Agent',
  description: '学习 Workspace、Sandbox 和 Approval 的本地 Agent',

  // instructions 负责告诉模型“如何使用能力”；真正的目录限制和审批策略由 Workspace 配置负责。
  instructions: `你是一个运行在本地 Workspace 中的文件助手。
你只能操作 workspace/ 目录内的文件。
你拥有两个联网检索工具：parallel-free_web_search 用于根据关键词发现公开网页，parallel-free_web_fetch 用于读取已知 URL 的精确内容。
需要根据关键词查找最新公开资料时，使用 parallel-free_web_search；已经知道 URL、需要精确内容或搜索摘要不足时，再使用 parallel-free_web_fetch。
不要声称自己已经访问网页而不调用工具；回答搜索结果时尽量提供来源 URL。
涉及文件修改时，先读取文件，再进行写入或编辑。
删除文件前必须等待用户明确确认。
执行命令时，优先使用简单、只读、可解释的命令。
用中文简洁回答，并说明你实际执行了什么。`,

  // 主 Agent 模型负责理解用户请求，并选择 Workspace 自动注册的工具。
  model: azureModel,

  // maxSteps 防止一次请求无限调用工具；autoResumeSuspendedTools 允许审批通过后继续执行。
  defaultOptions: {
    maxSteps: 10,
    autoResumeSuspendedTools: true,
  },

  // Memory 在本项目不是学习重点，但保留它可以让我们观察“工作操作”和对话历史的关系。
  memory: new Memory({
    options: {
      generateTitle: true,
    },
  }),

  // 挂载后，Workspace 会把文件和命令工具注册到 Agent 的 workspaceTools 中。
  workspace,

  // Parallel MCP 工具由独立模块提供，Agent 只负责组合能力。
  tools: await getParallelSearchTools(),
});
