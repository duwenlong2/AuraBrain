# 09 · 能力扩展框架：Tools、MCP、Skills 与自学习闭环

> 本文讨论 AuraBrain 的能力扩展架构：能力从哪里来、如何分层、如何让 Agent 拥有"眼睛"（多模态感知）、如何从成功任务中蒸馏出可复用的技能、以及本地模型约束下的效率策略。
>
> 这是 AuraBrain 系列中"框架层"的核心设计文档。不涉及具体代码实现，聚焦架构和协议设计。

## 关于 AuraBrain 开源项目

这是我的开源项目 [AuraBrain](https://github.com/duwenlong2/AuraBrain)（MIT 开源），一个"硬件 + 云端 AI"的完整系列：

```
AuraBrain = 本地 AI 大脑（用 Mastra 构建，本系列）→ 🧠
AuraCore  = ESP32 硬件端（WiFi/蓝牙 控制）       → ⚙️
    两者通过 HTTP + mDNS 通信，从自然语言到真实硬件
```

本文讨论的核心问题：

- AuraBrain 的能力从哪里来？内置工具、MCP 外部生态、自学习技能，三者如何分层协作？
- 如何让 Agent 拥有"眼睛"——通过浏览器截图 + 视觉模型，对照任务完成情况？
- 一个任务做对了，怎么把"怎么做对的"持久化为可复用的技能？
- 本地模型算力 = 电费，框架层面如何控制 token 消耗？
- 模型能力有上限，框架如何"长"出新能力，而不是等模型升级？

## 一、核心命题：能力从哪里来

### 1.1 本地模型的约束

AuraBrain 的设计前提是**本地部署**。这意味着：

| 约束 | 含义 | 框架层面的应对 |
|------|------|---------------|
| 算力 = 电费 | 每次 LLM 调用都有真实成本 | 工具集裁剪、验证预算、模型路由 |
| 上下文窗口有限 | 不能把所有工具描述都塞进 prompt | 按需加载、分层暴露 |
| 推理能力有上限 | 复杂规划容易出错 | 用确定性流程（Workflow）兜底 |
| 多模态能力有限 | 视觉理解不如云端旗舰 | 截图验证用"对比"而非"理解" |

**核心思路**：模型能力是"地板"，框架设计是"天花板"。模型再强，没有工具也做不了事；模型再弱，框架设计好了也能完成大量任务。

### 1.2 三种能力来源

```
┌─────────────────────────────────────────────────────────────┐
│                    AuraBrain 能力来源                         │
│                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │  内置工具      │  │  MCP 服务器    │  │  自学习技能     │  │
│  │  (Tools)      │  │  (MCP)        │  │  (Skills)      │  │
│  │               │  │               │  │                │  │
│  │  代码定义      │  │  外部生态      │  │  从任务中蒸馏   │  │
│  │  确定性        │  │  标准化协议    │  │  程序性知识     │  │
│  │  随版本发布    │  │  运行时接入    │  │  运行时生长     │  │
│  └───────┬───────┘  └───────┬───────┘  └───────┬────────┘  │
│          │                  │                   │           │
│          └──────────────────┼───────────────────┘           │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  能力注册表      │                      │
│                    │  (Registry)     │                      │
│                    └────────┬────────┘                      │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  Agent 执行层    │                      │
│                    │  (Mastra Agent) │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

| 来源 | 类比 | 特点 | 例子 |
|------|------|------|------|
| 内置工具 | 手 | 原子操作，确定性，代码定义 | `browser_screenshot`、`file_read`、`outlook_get_email` |
| MCP 服务器 | 手臂 | 外部能力，标准化协议，运行时接入 | Playwright MCP、GitHub MCP、Figma MCP |
| 自学习技能 | 经验 | 程序性知识，从成功任务中蒸馏，运行时生长 | "导入 PS 文件到 Figma 的完整步骤" |

**关键区分**：

- **工具是"动词"**：`click(x, y)`、`screenshot()`、`read_file(path)`
- **技能是"菜谱"**：先做 A，再做 B，如果 C 出现就做 D，最后验证 E
- **MCP 是"外接器官"**：别人写好的能力包，通过标准协议接入

## 二、能力分层模型

### 2.1 四层架构

```
L3  工作流 (Workflows)     ← 固化的可靠流程，Durable，可暂停恢复
    "导入 PS 到 Figma 的标准流程 v2.1"
         ▲ 编译
         │
L2  技能 (Skills)          ← 学习到的程序性知识，有版本，可晋升/降级
    "上次成功导入 PS 到 Figma 的步骤记录"
         ▲ 蒸馏
         │
L1  MCP 服务器             ← 外部能力生态，标准化协议
    Playwright MCP / Figma MCP / GitHub MCP
         ▲ 调用
         │
L0  原子工具 (Tools)       ← 确定性操作，代码定义
    browser_open / browser_click / browser_screenshot / file_read
```

**层间关系**：

- L0 → L1：MCP 服务器内部由原子工具组成，但对 Agent 暴露为独立工具
- L1 → L2：技能是"工具调用序列 + 条件分支 + 验证标准"的结构化描述
- L2 → L3：经过多次验证的技能可以"编译"为 Durable Workflow，获得暂停/恢复/重试能力

### 2.2 各层职责

| 层 | 谁定义 | 何时产生 | 存储位置 | 生命周期 |
|----|--------|---------|---------|---------|
| L0 Tools | 开发者 | 代码发布时 | 源码 `src/main/tools/` | 随版本 |
| L1 MCP | 第三方/开发者 | 运行时配置 | `config.json` 的 `mcpServers` | 运行时 |
| L2 Skills | Agent 自学习 | 任务成功后蒸馏 | `skills/` 目录 (JSON) | 运行时生长 |
| L3 Workflows | 从 Skill 编译 | 技能晋升时 | 源码或 `workflows/` 目录 | 半持久 |

### 2.3 能力注册表 (Capability Registry)

Agent 不直接知道"有哪些工具"，而是通过注册表查询：

```typescript
// 概念设计（非最终代码）
interface CapabilityRegistry {
  // 列出所有可用能力（按层）
  listCapabilities(filter?: { layer?: 'tool' | 'mcp' | 'skill' }): Capability[]

  // 获取某个能力的详细描述（给 LLM 看的）
  getCapability(id: string): CapabilityDetail

  // 执行能力
  execute(id: string, args: Record<string, unknown>): Promise<CapabilityResult>

  // 注册新能力（MCP 接入 / 技能蒸馏）
  register(capability: Capability): void

  // 注销能力（MCP 断开 / 技能降级）
  unregister(id: string): void
}

interface Capability {
  id: string
  name: string
  layer: 'tool' | 'mcp' | 'skill'
  description: string
  // 给 LLM 看的参数描述（控制 token 消耗的关键）
  inputSchema: string
  // 安全等级
  riskLevel: 'read' | 'write' | 'destructive'
  // 来源
  source: { type: 'builtin' } | { type: 'mcp', server: string } | { type: 'skill', version: string }
}
```

**设计要点**：

- **按需暴露**：不是把所有工具描述都塞进 system prompt，而是 Agent 先"浏览目录"，再"查看详情"
- **风险分级**：`read` 类工具自动执行，`write` 类需要确认，`destructive` 类必须人工审批
- **来源追踪**：每个能力都知道自己从哪来，方便调试和审计

## 三、多模态感知：让 Agent 有"眼睛"

### 3.1 为什么需要"眼睛"

纯文本的 Agent Loop 有一个根本问题：**Agent 不知道自己的操作是否真的生效了**。

```
Agent: "我点击了上传按钮"
现实:  按钮没点到 / 页面没加载完 / 弹出了错误对话框
Agent: "上传完成了"
现实:  文件根本没上传
```

**多模态验证**解决的就是这个问题：操作之后，截图，让视觉模型对比"期望状态"和"实际状态"。

### 3.2 浏览器工具集 (L0)

基于 Playwright 的原子工具集：

| 工具 ID | 功能 | 输入 | 输出 | 风险 |
|---------|------|------|------|------|
| `browser_open` | 打开 URL | `url` | `pageId`, 页面快照 | read |
| `browser_navigate` | 导航/刷新 | `pageId`, `type` | 页面快照 | read |
| `browser_click` | 点击元素 | `pageId`, `selector/ref` | 操作结果 | write |
| `browser_type` | 输入文本 | `pageId`, `text`, `selector` | 操作结果 | write |
| `browser_screenshot` | 截图 | `pageId`, `selector?` | 图片 (base64/路径) | read |
| `browser_read_page` | 读取页面结构 | `pageId` | 可访问性树 (文本) | read |
| `browser_wait` | 等待条件 | `pageId`, `condition` | 等待结果 | read |
| `browser_close` | 关闭页面 | `pageId` | 确认 | write |

**关键设计**：

- `browser_read_page` 返回的是**可访问性树**（文本），不是 HTML。这对本地模型友好——token 少，结构清晰
- `browser_screenshot` 返回图片，供视觉模型验证
- 每个操作都返回**操作后的页面状态摘要**，Agent 不需要额外调用就能知道"现在页面长什么样"

### 3.3 验证循环 (Verification Loop)

```
┌─────────────────────────────────────────────────────────┐
│                  感知-行动-验证循环                        │
│                                                         │
│   ┌──────────┐     ┌──────────┐     ┌──────────────┐   │
│   │  规划     │────►│  执行     │────►│  验证         │   │
│   │ (Plan)   │     │ (Act)    │     │ (Verify)     │   │
│   └──────────┘     └──────────┘     └──────┬───────┘   │
│        ▲                                    │           │
│        │         ┌──────────┐               │           │
│        └─────────│  修正     │◄──────────────┘           │
│                  │ (Repair) │  验证失败                   │
│                  └──────────┘                            │
│                                                         │
│   验证方式（按成本从低到高）：                              │
│   1. 文本验证：read_page 检查 DOM 状态（最便宜）           │
│   2. 截图对比：screenshot + 视觉模型对比期望（中等）        │
│   3. 人工确认：展示截图给用户，用户判断（最贵但最可靠）      │
└─────────────────────────────────────────────────────────┘
```

**验证策略分级**（控制 token 消耗的关键）：

| 级别 | 方式 | Token 成本 | 适用场景 |
|------|------|-----------|---------|
| V0 | 工具返回值检查 | 极低 | 工具返回了明确的成功/失败 |
| V1 | `read_page` 文本检查 | 低 | 检查页面是否包含预期文本/元素 |
| V2 | `screenshot` + 视觉模型 | 中 | 需要"看"才能确认（布局、图片、颜色） |
| V3 | 人工确认 | 高（时间） | 高风险操作、V2 不确定时 |

**原则**：能用 V0 就不用 V1，能用 V1 就不用 V2。截图验证是"最后手段"，不是"默认手段"。

### 3.4 视觉验证的具体实现

```typescript
// 概念设计：验证工具
const verifyScreenshot = createTool({
  id: 'verify-screenshot',
  description: '对比截图与期望描述，判断操作是否成功。返回 match/mismatch + 差异描述。',
  inputSchema: z.object({
    screenshotPath: z.string().describe('截图文件路径'),
    expectation: z.string().describe('期望状态的描述，如"页面显示文件已上传成功，文件名 visible"'),
    // 可选：参考截图（之前成功时的截图）
    referencePath: z.string().optional().describe('参考截图路径（可选）'),
  }),
  execute: async ({ screenshotPath, expectation, referencePath }) => {
    // 调用视觉模型（可以是本地多模态模型）
    // 输入：截图 + 期望描述 (+ 参考截图)
    // 输出：{ match: boolean, confidence: number, diff: string }
    const result = await visionModel.compare({
      image: screenshotPath,
      expectation,
      reference: referencePath,
    })
    return result
  },
})
```

**对本地模型的适配**：

- 本地多模态模型（如 Qwen2.5-VL、LLaVA）的视觉理解能力有限
- 所以验证 prompt 要**具体**：不是"看看对不对"，而是"截图中是否有一个绿色的成功提示框，文字包含'上传成功'"
- 如果本地模型不确定，降级到 V3（人工确认）

## 四、自学习闭环：从任务到技能

### 4.1 核心思想

**Agent 不会"学习"（权重不更新），但框架可以"记住"。**

```
传统 ML 学习：  数据 → 梯度更新 → 权重变化 → 行为变化
AuraBrain 学习：任务 → 执行轨迹 → 蒸馏 → 技能文件 → 下次复用
```

这不是"学习"，是**程序性记忆的积累**。类比人类：

- 你第一次用 Figma 导入 PS 文件，要查教程、试错、摸索
- 第二次，你"记得"步骤了，直接做
- 第十次，你闭着眼都能做

AuraBrain 的"学习"就是这个过程：**第一次靠探索，第十次靠技能**。

### 4.2 技能生命周期

```
                    ┌─────────────────────────────────────────┐
                    │            技能生命周期                    │
                    │                                         │
  任务成功 ──────►  │  ┌──────────┐    ┌──────────┐          │
  (Trace)          │  │  Draft   │───►│  Active  │          │
                    │  │  (草稿)  │    │  (活跃)  │          │
                    │  └────┬─────┘    └────┬─────┘          │
                    │       │               │                │
                    │       │ 失败          │ 成功 N 次       │
                    │       ▼               ▼                │
                    │  ┌──────────┐    ┌──────────┐          │
                    │  │  Retired │    │  Stable  │          │
                    │  │  (退役)  │    │  (稳定)  │          │
                    │  └──────────┘    └────┬─────┘          │
                    │                       │                │
                    │                       │ 编译            │
                    │                       ▼                │
                    │                  ┌──────────┐          │
                    │                  │ Workflow │          │
                    │                  │ (工作流) │          │
                    │                  └──────────┘          │
                    └─────────────────────────────────────────┘
```

| 状态 | 含义 | 触发条件 | Agent 如何使用 |
|------|------|---------|--------------|
| Draft | 刚蒸馏出来，未验证 | 任务成功 + 蒸馏 | 作为"参考"，Agent 可以偏离 |
| Active | 验证过，可复用 | Draft 被成功复用 1 次 | Agent 优先按技能执行 |
| Stable | 多次成功，高度可靠 | Active 成功复用 ≥ 3 次 | 可编译为 Workflow |
| Retired | 不再适用 | 连续失败 / 环境变化 | 不再暴露给 Agent |

### 4.3 技能存储格式

```json
{
  "id": "import-ps-to-figma",
  "name": "导入 PS 文件到 Figma",
  "version": "1.2.0",
  "status": "active",
  "createdAt": "2026-09-11T10:00:00Z",
  "updatedAt": "2026-09-11T15:30:00Z",
  "successCount": 5,
  "failureCount": 1,

  "trigger": {
    "description": "用户要求将 .ps 文件导入 Figma",
    "keywords": ["导入", "Figma", ".ps", "Photoshop"],
    "examplePrompts": [
      "帮我把桌面的 design.ps 导入到 Figma",
      "把这个 PS 文件传到 Figma 里"
    ]
  },

  "preconditions": [
    "Figma 已在浏览器中登录",
    "目标 .ps 文件路径已知",
    "Figma 项目/文件已打开或可创建"
  ],

  "steps": [
    {
      "id": "step-1",
      "action": "browser_open",
      "args": { "url": "https://figma.com/files" },
      "verify": {
        "level": "V1",
        "check": "read_page 包含 'Files' 或 '文件' 文本"
      }
    },
    {
      "id": "step-2",
      "action": "browser_click",
      "args": { "selector": "button:has-text('New file')" },
      "verify": {
        "level": "V1",
        "check": "read_page 包含 'Untitled' 或新建文件界面"
      }
    },
    {
      "id": "step-3",
      "action": "browser_click",
      "args": { "selector": "button:has-text('Import')" },
      "verify": {
        "level": "V0",
        "check": "文件选择对话框出现"
      }
    },
    {
      "id": "step-4",
      "action": "file_select_in_dialog",
      "args": { "path": "{{filePath}}" },
      "verify": {
        "level": "V2",
        "check": "screenshot 显示文件已出现在 Figma 画布中",
        "expectation": "画布中可见导入的图层/元素"
      }
    }
  ],

  "parameters": [
    { "name": "filePath", "type": "string", "description": "PS 文件的绝对路径" }
  ],

  "knownIssues": [
    {
      "issue": "Figma 更新后 Import 按钮位置变化",
      "workaround": "step-3 的 selector 需要更新",
      "lastSeen": "2026-09-10"
    }
  ],

  "provenance": {
    "sourceTaskId": "task-20260911-001",
    "distilledBy": "skill-distiller-v1",
    "traceRef": "traces/task-20260911-001.json"
  }
}
```

**设计要点**：

- **steps 是"建议"不是"指令"**：Agent 可以偏离（比如页面结构变了），但偏离要记录
- **verify 分级**：每步都有验证，但验证成本不同
- **parameters 模板化**：`{{filePath}}` 是参数占位符，让技能可复用
- **knownIssues**：记录已知的坑，下次执行时 Agent 可以提前规避
- **provenance**：追溯来源，方便调试

### 4.4 蒸馏过程 (Distillation)

任务成功后，蒸馏器从执行轨迹中提取技能：

```
执行轨迹 (Trace)
┌─────────────────────────────────────────────────┐
│ task-20260911-001                               │
│                                                 │
│  user: "帮我把 C:\design\logo.ps 导入 Figma"      │
│                                                 │
│  agent: [browser_open] figma.com/files          │
│  verify: V1 ✓ (看到文件列表)                     │
│                                                 │
│  agent: [browser_click] "New file"              │
│  verify: V1 ✓ (看到新建文件界面)                  │
│                                                 │
│  agent: [browser_click] "Import"                │
│  verify: V0 ✓ (文件对话框出现)                   │
│                                                 │
│  agent: [file_select] C:\design\logo.ps         │
│  verify: V2 ✓ (截图显示画布中有元素)              │
│                                                 │
│  agent: "导入完成，logo 已在 Figma 画布中"         │
│  user: "好的，谢谢"                              │
└─────────────────────────────────────────────────┘
         │
         ▼  蒸馏 (LLM 辅助 + 规则)
┌─────────────────────────────────────────────────┐
│ Skill: import-ps-to-figma v1.0.0 (Draft)        │
│                                                 │
│  参数: filePath (string)                        │
│  步骤: 4 步 (如上 JSON)                          │
│  验证: V1, V1, V0, V2                           │
│  来源: task-20260911-001                        │
└─────────────────────────────────────────────────┘
```

**蒸馏策略**：

1. **规则提取**：从 trace 中提取工具调用序列、参数、验证结果
2. **LLM 辅助**：让 LLM 生成 `trigger.description`、`trigger.keywords`、`knownIssues`
3. **参数泛化**：把具体值（`C:\design\logo.ps`）替换为参数（`{{filePath}}`）
4. **去噪**：去掉重试、错误恢复步骤（除非是"必要的容错"）

### 4.5 技能复用与修正

下次遇到类似任务时：

```
用户: "把 D:\assets\banner.ps 导入 Figma"
         │
         ▼
  技能匹配: import-ps-to-figma (Active, v1.2.0)
         │
         ▼
  Agent 按技能执行:
    step-1: browser_open figma.com/files → V1 ✓
    step-2: browser_click "New file" → V1 ✓
    step-3: browser_click "Import" → V1 ✗ (按钮没找到!)
         │
         ▼  偏离
    Agent 自主探索:
    browser_read_page → 发现按钮文字变成了 "Add file"
    browser_click "Add file" → V0 ✓
         │
         ▼
    step-4: file_select D:\assets\banner.ps → V2 ✓
         │
         ▼
  任务成功
         │
         ▼
  技能更新:
    - successCount: 5 → 6
    - knownIssues 新增: "Import 按钮可能变为 Add file"
    - step-3 selector 更新为 "button:has-text('Import'), button:has-text('Add file')"
    - version: 1.2.0 → 1.3.0
```

**关键**：技能不是"一次写对"，而是**每次使用都在进化**。这就是"逐渐迭代"的框架层体现。

## 五、与记忆系统的关系

AuraBrain 的记忆设计（见博客 04 和 Memory 系列）定义了三种记忆：

| 记忆类型 | 内容 | 对应能力层 | 存储 |
|---------|------|-----------|------|
| 情景记忆 (Episodic) | "上次做了什么" | Task Traces | Storage (LibSQL) |
| 语义记忆 (Semantic) | "世界是什么样的" | Facts / Knowledge | Storage + 向量检索 |
| 程序性记忆 (Procedural) | "怎么做某事" | **Skills** | `skills/` 目录 |

**Skills 就是程序性记忆的具体实现。**

```
┌─────────────────────────────────────────────────────────┐
│                    记忆系统                               │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  情景记忆     │  │  语义记忆     │  │  程序性记忆     │  │
│  │  (Episodic)  │  │  (Semantic)  │  │  (Procedural)  │  │
│  │             │  │             │  │                │  │
│  │  任务轨迹    │  │  事实/知识    │  │  技能 (Skills)  │  │
│  │  对话历史    │  │  用户偏好     │  │  步骤/验证/参数  │  │
│  │  操作记录    │  │  环境状态     │  │  已知问题       │  │
│  └──────┬──────┘  └──────┬──────┘  └───────┬────────┘  │
│         │                │                  │           │
│         ▼                ▼                  ▼           │
│  ┌─────────────────────────────────────────────────┐   │
│  │              统一存储层 (LibSQL)                  │   │
│  │  + 向量索引 (语义检索)                            │   │
│  │  + 全文索引 (关键词检索)                          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**交互关系**：

- 执行任务时：检索**程序性记忆**（有没有相关技能）+ **语义记忆**（环境状态）
- 任务完成后：写入**情景记忆**（trace）+ 可能更新**程序性记忆**（蒸馏/更新技能）
- 技能执行失败时：查询**情景记忆**（上次失败的原因）+ **语义记忆**（环境是否变化）

## 六、MCP 集成：外部能力生态

### 6.1 为什么需要 MCP

内置工具是"手"，MCP 是"外接器官"。不是所有能力都需要自己写：

- **浏览器自动化**：Playwright MCP 已经做得很好，不需要自己写
- **Figma 操作**：Figma 官方有 MCP 服务器
- **GitHub**：GitHub MCP
- **数据库**：各种 DB MCP

**原则**：能复用生态的，不自己写。自己写的只保留"核心 + 差异化"。

### 6.2 MCP 配置

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "enabled": true
    },
    "figma": {
      "url": "https://mcp.figma.com/mcp",
      "headers": { "Authorization": "Bearer {{FIGMA_TOKEN}}" },
      "enabled": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": { "GITHUB_TOKEN": "{{GITHUB_TOKEN}}" },
      "enabled": false
    }
  }
}
```

### 6.3 MCP 工具与内置工具的关系

```
Agent 视角：
┌─────────────────────────────────────────────┐
│  能力注册表                                   │
│                                             │
│  builtin:                                   │
│    - browser_open (L0)                      │
│    - browser_screenshot (L0)                │
│    - file_read (L0)                         │
│    - outlook_get_email (L0)                 │
│                                             │
│  mcp:playwright:                            │
│    - browser_navigate (L1)                  │
│    - browser_click (L1)                     │
│    - browser_type (L1)                      │
│                                             │
│  mcp:figma:                                 │
│    - figma_create_file (L1)                 │
│    - figma_import_file (L1)                 │
│    - figma_get_layers (L1)                  │
│                                             │
│  skill:                                     │
│    - import-ps-to-figma (L2)                │
└─────────────────────────────────────────────┘
```

**注意**：MCP 工具和内置工具可能有重叠（比如 Playwright MCP 也有 `browser_click`）。注册表需要**去重和优先级**：

- 同名工具：内置优先（更可控）
- 功能重叠：按"最小权限"原则，优先用更细粒度的
- Agent 看到的是**统一命名空间**，不关心来源

### 6.4 MCP 安全

MCP 服务器是外部代码，需要安全边界：

| 风险 | 应对 |
|------|------|
| MCP 服务器执行恶意代码 | 只信任已知服务器，`allowedHosts` 限制出站 |
| MCP 工具返回恶意内容 | 工具结果标记为"不可信输入"，不直接执行 |
| 凭据泄露 | Token 存 Credential Manager，不写 config.json |
| 工具滥用 | `requireToolApproval` 对高风险工具要求确认 |

## 七、本地模型下的效率策略

### 7.1 Token 预算模型

```
一次任务的 token 消耗 = 规划 + 执行 + 验证 + 蒸馏

规划:   system prompt + 工具描述 + 用户任务     ≈ 2000-5000 tokens
执行:   每步 (工具调用 + 结果) × N 步           ≈ 500-2000 × N
验证:   截图描述 + 视觉模型输入                  ≈ 1000-3000 × M
蒸馏:   trace 摘要 + 技能生成                    ≈ 2000-5000 (一次性)
```

**控制策略**：

| 策略 | 做法 | 节省 |
|------|------|------|
| 工具描述精简 | 每个工具描述 ≤ 50 tokens，参数用 JSON Schema | 30-50% |
| 按需加载 | 不把所有工具都放进 prompt，先"浏览目录" | 50%+ |
| 验证分级 | 优先 V0/V1，V2 截图验证只在必要时 | 40-60% |
| 技能复用 | 有技能时跳过探索，直接执行 | 70-90% |
| 模型路由 | 简单步骤用小模型，规划/蒸馏用大模型 | 50%+ |

### 7.2 模型路由

```
┌─────────────────────────────────────────────────────────┐
│                    模型路由                               │
│                                                         │
│  任务类型          模型选择          原因                  │
│  ─────────────────────────────────────────────────────  │
│  工具调用决策      小模型 (7B)       结构化输出，不需要强推理  │
│  页面状态判断      小模型 (7B)       简单分类               │
│  任务规划          大模型 (70B+)     需要强推理             │
│  技能蒸馏          大模型 (70B+)     需要抽象能力           │
│  视觉验证          多模态 (7B-VL)    需要视觉理解           │
│  错误恢复          大模型 (70B+)     需要创造性             │
│                                                         │
│  原则：能用小模型解决的，不用大模型                          │
│       大模型只用于"规划"和"蒸馏"两个环节                    │
└─────────────────────────────────────────────────────────┘
```

### 7.3 上下文管理

本地模型上下文窗口有限（通常 8K-32K），需要严格的上下文管理：

```
System Prompt (固定)
├── 角色定义                    ≈ 200 tokens
├── 当前可用能力目录 (精简)      ≈ 500-1000 tokens
├── 当前技能 (如果有)            ≈ 500-2000 tokens
└── 安全规则                    ≈ 200 tokens

Conversation (动态)
├── 用户任务                    ≈ 100-500 tokens
├── 执行历史 (滑动窗口)          ≈ 2000-8000 tokens
│   └── 超过窗口时：压缩旧步骤为摘要
└── 当前步骤上下文              ≈ 500-2000 tokens
```

**滑动窗口策略**：

- 保留最近 3-5 步的完整记录
- 更早的步骤压缩为一行摘要："step-2: click 'New file' → ✓"
- 技能步骤的验证结果只保留 ✓/✗，不保留完整页面内容

## 八、架构总览

### 8.1 组件图

```
┌─────────────────────────────────────────────────────────────────┐
│                    AuraBrain Runtime                             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │  Task       │  │  Capability │  │  Skill                 │  │
│  │  Runner     │  │  Registry   │  │  Store                 │  │
│  │             │  │             │  │                        │  │
│  │  接收任务    │  │  能力注册表  │  │  技能存储/检索/版本     │  │
│  │  调度执行    │  │  去重/路由   │  │  生命周期管理           │  │
│  │  管理状态    │  │  安全分级    │  │  蒸馏/晋升/退役         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬────────────┘  │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Agent 执行层 (Mastra Agent)                  │   │
│  │                                                         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │   │
│  │  │  Planner │  │  Executor│  │ Verifier │              │   │
│  │  │  (规划)   │  │  (执行)   │  │  (验证)   │              │   │
│  │  └──────────┘  └──────────┘  └──────────┘              │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │  L0 Tools   │  │  L1 MCP     │  │  多模态感知             │  │
│  │  (内置工具)  │  │  (MCP 服务器)│  │  (截图/视觉模型)        │  │
│  └─────────────┘  └─────────────┘  └────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              存储层 (LibSQL + 向量索引)                    │   │
│  │  Traces / Skills / Facts / Conversations                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              模型路由层                                    │   │
│  │  小模型 (执行) / 大模型 (规划/蒸馏) / 多模态 (验证)         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 数据流：一次完整任务

```
用户: "把 C:\design\logo.ps 导入 Figma"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│ 1. Task Runner 接收任务                                   │
│    - 创建 taskId                                         │
│    - 查询 Skill Store: 有 "import-ps-to-figma" (Active)  │
│    - 加载技能到上下文                                      │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Planner (大模型)                                      │
│    - 输入: 任务 + 技能 + 可用能力目录                      │
│    - 输出: 执行计划 (按技能步骤，参数填充)                  │
│    - 如果技能不适用: 自主规划                              │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Executor (小模型) 逐步执行                             │
│    step-1: browser_open → 结果                           │
│    step-2: browser_click → 结果                          │
│    step-3: browser_click → 结果 (失败!)                   │
│         │                                                │
│         ▼  失败 → 回到 Planner (大模型) 重新规划           │
│    step-3': browser_click "Add file" → 结果              │
│    step-4: file_select → 结果                            │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Verifier 逐步验证                                     │
│    step-1: V1 ✓                                          │
│    step-2: V1 ✓                                          │
│    step-3': V0 ✓                                         │
│    step-4: V2 (截图) ✓                                   │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│ 5. 任务完成                                              │
│    - 写入 Trace (情景记忆)                                │
│    - 更新 Skill: successCount++, 记录偏离                 │
│    - 如果偏离: 更新技能步骤 / 新增 knownIssue             │
│    - 通知用户: "导入完成" + 截图                          │
└─────────────────────────────────────────────────────────┘
```

## 九、PS → Figma 实例走查

用具体例子走一遍完整流程：

### 9.1 第一次（无技能，探索模式）

```
用户: "帮我把 C:\design\logo.ps 导入到 Figma"

Agent (无技能，自主探索):
  1. browser_open "https://figma.com/files"
     → 看到文件列表 ✓
  2. browser_click "New file"
     → 进入新建文件界面 ✓
  3. browser_click "Import"
     → 文件对话框出现 ✓
  4. [文件对话框] 选择 C:\design\logo.ps
     → 等待导入...
  5. browser_screenshot
     → 视觉验证: 画布中出现了 logo 元素 ✓
  6. "导入完成！logo 已在 Figma 画布中。" [附截图]

蒸馏:
  → 生成 Skill "import-ps-to-figma" v1.0.0 (Draft)
  → 4 步，验证级别 V1/V1/V0/V2
```

### 9.2 第二次（有技能，复用模式）

```
用户: "把 D:\assets\banner.ps 导入 Figma"

Agent (加载技能 import-ps-to-figma v1.0.0):
  1. [技能 step-1] browser_open "https://figma.com/files"
     → V1 ✓
  2. [技能 step-2] browser_click "New file"
     → V1 ✓
  3. [技能 step-3] browser_click "Import"
     → V1 ✗ (按钮文字变了，变成 "Add file")
     → 偏离: browser_read_page → 找到 "Add file"
     → browser_click "Add file" → V0 ✓
  4. [技能 step-4] file_select D:\assets\banner.ps
     → V2 ✓ (截图确认)
  5. "导入完成！" [附截图]

技能更新:
  → v1.0.0 → v1.1.0
  → step-3 selector: "Import" → "Import, Add file" (兼容)
  → knownIssues: "Figma 可能将 Import 改为 Add file"
  → successCount: 1
  → status: Draft → Active
```

### 9.3 第五次（技能稳定，可编译为 Workflow）

```
技能状态: Active, successCount=4, failureCount=0
→ 满足晋升条件 (≥3 次成功)
→ 编译为 Durable Workflow "import-ps-to-figma-v1.4"
→ 获得: 暂停/恢复/重试/超时 能力
→ 后续执行走 Workflow 路径（更可靠，token 更少）
```

## 十、安全与边界

### 10.1 操作安全分级

| 级别 | 操作类型 | 示例 | 策略 |
|------|---------|------|------|
| Read | 只读 | screenshot, read_page, file_read | 自动执行 |
| Write | 可逆写入 | browser_click, browser_type, file_write | 自动执行 + 记录 |
| Destructive | 不可逆 | file_delete, browser_submit (表单), 发送邮件 | 必须人工确认 |
| External | 影响外部系统 | 发邮件、提交 PR、支付 | 必须人工确认 + 审计 |

### 10.2 技能安全

- 技能是"建议"不是"指令"：Agent 可以拒绝执行不合理的技能步骤
- 技能中的 Destructive 操作仍然需要人工确认
- 技能来源可追溯：`provenance` 记录来源任务
- 技能可以"毒化"（恶意技能）：需要签名/验证机制（后续迭代）

### 10.3 浏览器安全

- 浏览器操作在**隔离的浏览器实例**中运行（不污染用户日常浏览器）
- 登录态管理：Figma 等需要登录的站点，首次由用户手动登录，之后复用 session
- 不自动处理验证码/2FA：遇到时暂停，通知用户

## 十一、迭代路线

### M1：感知层（当前 → +2 周）

- [ ] 浏览器工具集 (L0)：open / navigate / click / type / screenshot / read_page
- [ ] 验证工具：verify-screenshot (V2)
- [ ] 能力注册表基础版：内置工具注册 + 列表查询
- [ ] 手动任务执行：用户给任务，Agent 用工具完成，无技能

**验证标准**：能完成"打开网页 → 点击 → 截图 → 确认"的完整循环

### M2：MCP 接入（+2 → +4 周）

- [ ] MCPClient 集成：配置驱动，运行时加载
- [ ] Playwright MCP 接入（替代/补充 L0 浏览器工具）
- [ ] 能力注册表：MCP 工具自动注册 + 去重
- [ ] 安全：requireToolApproval 对高风险 MCP 工具

**验证标准**：配置一个 MCP 服务器后，Agent 自动获得其工具

### M3：技能系统（+4 → +8 周）

- [ ] Skill Store：存储/检索/版本管理
- [ ] 蒸馏器：trace → skill (Draft)
- [ ] 技能匹配：任务 → 相关技能
- [ ] 技能执行：Agent 按技能执行 + 偏离记录
- [ ] 技能更新：成功/失败后更新

**验证标准**：PS→Figma 任务第二次执行时，自动使用技能，且技能在偏离后自我更新

### M4：工作流编译（+8 → +12 周）

- [ ] 技能 → Workflow 编译
- [ ] Durable 执行：暂停/恢复/重试
- [ ] 技能晋升/退役自动化
- [ ] 技能健康度监控（成功率、偏离率）

**验证标准**：稳定技能自动编译为 Workflow，执行更可靠

### M5：跨任务泛化（+12 周 →）

- [ ] 技能组合：多个技能组合完成复杂任务
- [ ] 技能模板：参数化技能，适配不同场景
- [ ] 跨应用泛化：Figma 的技能模式 → 其他设计工具
- [ ] 用户反馈闭环：用户纠正 → 技能更新

**验证标准**：Agent 能组合 2-3 个技能完成"导出 Figma 设计 → 上传到 GitHub → 通知团队"

## 十二、与现有代码的关系

当前 AuraBrain 的代码结构：

```
src/main/
├── index.ts          ← Mastra 实例，注册 tools
├── routes.ts         ← API 路由
├── tools/            ← L0 内置工具
│   ├── mail-tools.ts
│   ├── calendar-tools.ts
│   └── outlook-tools.ts
├── lib/              ← 外部系统适配
│   ├── graph.ts
│   ├── imap.ts
│   └── outlook.ts
└── public/           ← 管理页面
```

**扩展后的目标结构**：

```
src/main/
├── index.ts          ← Mastra 实例
├── routes.ts         ← API 路由
├── tools/            ← L0 内置工具
│   ├── mail-tools.ts
│   ├── calendar-tools.ts
│   ├── outlook-tools.ts
│   ├── browser-tools.ts      ← 新增：浏览器工具集
│   └── verify-tools.ts       ← 新增：验证工具
├── mcp/              ← 新增：MCP 集成
│   ├── client.ts               ← MCPClient 配置
│   └── registry.ts             ← MCP 工具注册/去重
├── skills/           ← 新增：技能系统
│   ├── store.ts                ← 技能存储/检索
│   ├── distiller.ts            ← 蒸馏器
│   ├── matcher.ts              ← 技能匹配
│   └── lifecycle.ts            ← 生命周期管理
├── task/             ← 新增：任务执行
│   ├── runner.ts               ← Task Runner
│   ├── planner.ts              ← 规划
│   ├── executor.ts             ← 执行
│   └── verifier.ts             ← 验证
├── lib/              ← 外部系统适配
│   ├── graph.ts
│   ├── imap.ts
│   ├── outlook.ts
│   └── playwright.ts           ← 新增：Playwright 适配
└── public/           ← 管理页面
```

## 十三、设计原则总结

1. **能力分层，各负其责**：工具是动词，MCP 是器官，技能是菜谱，工作流是 SOP
2. **验证优先，截图兜底**：能用文本验证就不用截图，截图是最后手段
3. **技能是建议，不是指令**：Agent 可以偏离，偏离要记录，记录要更新技能
4. **小模型执行，大模型规划**：token 花在刀刃上
5. **每次使用都在进化**：技能不是一次写对，是越用越好
6. **安全分级，不可逆操作必须确认**：框架层保证，不依赖模型"自觉"
7. **复用生态，不重复造轮子**：MCP 能解决的，不自己写
8. **渐进式迭代**：每个里程碑都有可验证的标准，不追求一步到位

## 十四、已知局限与开放问题

| 局限 | 影响 | 可能的解决方向 |
|------|------|--------------|
| 本地多模态模型视觉理解有限 | V2 验证不够可靠 | 更具体的验证 prompt / 降级到 V3 |
| 技能蒸馏依赖 LLM 质量 | 蒸馏出的技能可能不通用 | 多次蒸馏取交集 / 人工审核 |
| 浏览器 UI 变化频繁 | 技能容易失效 | 多 selector 兼容 / 自动修复 |
| 本地模型上下文有限 | 复杂任务容易丢失上下文 | 更激进的压缩 / 分阶段执行 |
| 技能"毒化"风险 | 恶意技能可能误导 Agent | 签名验证 / 沙箱执行 |
| 跨应用泛化困难 | Figma 技能不能直接用于 Sketch | 抽象操作模式 / 应用适配器 |

**这些局限不是"等模型升级"就能解决的，需要框架层持续迭代。** 这正是"逐渐演化"的意义。

---

> 下一篇：[10 · 技能系统实现：从 Trace 到 Skill 的蒸馏管线]（规划中）
