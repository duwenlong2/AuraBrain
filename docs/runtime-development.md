# AuraBrain Runtime 开发指南

这份指南面向把 AuraBrain 拉到本机、运行它，或在现有 Runtime 上增加能力的开发者。

## 1. 从源码启动

要求：Windows、Node.js 25 或兼容的较新版本、npm。

```powershell
git clone <repository-url> AuraBrain
cd AuraBrain
npm install
npm link
brain build
brain dev
```

另开一个终端检查：

```powershell
cd AuraBrain
brain status
brain init
```

`brain init` 会打开模型工作台。先扫描 VS Code 配置，再点击候选模型的“一键添加”，检查 API 地址和 API Key，最后保存。扫描不会自动保存，也不会读取 VS Code 的密钥内容。

验证默认模型：

```powershell
brain chat
```

Chat 支持多轮文字输入；`/clear` 清空上下文，`/exit` 或 `/quit` 退出。它主要用于确认 Runtime、凭据和模型网关是否连通。

## 2. 日常命令

```powershell
brain status   # 查看 Runtime 和模型状态
brain health   # 查看 /health
brain settings # 打开模型工作台
brain stop     # 停止 Runtime
brain build    # 修改源码后重新构建
brain dev      # 启动最近一次构建产物
```

`brain build` 会在构建前停止正在运行的 AuraBrain，并生成 `.mastra/output/`。这个目录不提交到 Git。`brain dev` 已经在运行时不要重复启动，否则会占用 49000 端口。

## 3. 配置和安全

普通配置写入：

```text
%APPDATA%\AuraBrain\config.json
```

API Key、Graph OAuth Token 和 IMAP 密码写入 Windows Credential Manager，服务名为 `AuraBrain`。不要把这些值写进源码、README、Git 或 `.env`。

`%APPDATA%\AuraBrain\config.json` 仍然需要保留，它只保存模型地址、模型 ID、默认模型和 `apiKeyRef` 等非敏感元数据。Runtime 在请求时从 Credential Manager 读取 Key，并通过 Mastra 原生模型解析器创建本次调用使用的内存模型对象；不会把 Key 写入配置文件或构建产物。

VS Code 扫描默认读取：

```text
%APPDATA%\Code\User\chatLanguageModels.json
%APPDATA%\Code - Insiders\User\chatLanguageModels.json
```

目前只导入有 `apiType: "chat-completions"`、模型 ID 和 URL 的候选。Copilot 等没有可直接复用 URL 的配置会被跳过。

## 4. 二次开发入口

| 目标 | 入口 |
|------|------|
| Runtime 启动和端口 | `mastra.config.ts`、`src/main/index.ts` |
| 自定义 HTTP 路由 | `src/main/routes.ts` |
| Agent、Tool、Workflow 注册 | `src/main/index.ts` |
| 邮件和日历工具 | `src/main/tools/` |
| Graph、IMAP、Outlook 适配 | `src/main/lib/` |
| 配置存储 | `src/main/lib/config-store.ts` |
| 敏感凭据 | `src/main/lib/secret-store.ts` |
| 配置和测试页面 | `src/main/public/` |
| CLI | `bin/aurabrain.mjs` |

增加工具时，优先把外部系统访问写在 `src/main/lib/`，把参数校验和 Mastra Tool 定义写在 `src/main/tools/`，再从 `src/main/index.ts` 注册。不要把业务密钥硬编码进 Tool。

增加 API 时，明确区分：

- `/admin/*`：仅供本地管理页面使用的配置、扫描和测试接口。
- `/v1/*`：规划中的面向 SightTwin 或第三方客户端的稳定公共接口。
- `/health`：进程健康检查。

## 5. 代码提交边界

应该提交：

- `src/`、`bin/`、`docs/`、`examples/`
- `package.json`、`package-lock.json`、`tsconfig.json`、`mastra.config.ts`
- `.gitignore`、README 和其他源码文档

不应该提交：

- `node_modules/`
- `.mastra/`
- `.aurabrain/` 和 `.aurabrain-runtime.pid`
- `%APPDATA%\AuraBrain\config.json`
- `.env`、API Key、OAuth Token、IMAP 密码

示例项目是学习 Mastra 的独立工程，可以使用自己的 `.env.example` 和 `.env` 流程；这不代表 AuraBrain Runtime 使用 `.env` 配置。