# 04-memory · Memory 深度学习

Mastra **Memory 深度学习项目**：一个项目、四个 Agent，把 Memory 的每一种能力单独拆开讲清楚。

> 和 `02-mini-agent` 里"顺带用了一点 Memory"不同，本项目专门把 Memory 当主题深度学习。
> 每个 Agent 只演示一种记忆能力，方便对比它们分别解决什么问题、各自有什么局限。

> 📘 **想深入理解记忆的"为什么"和行业全景？看 [DEEP-DIVE.md](./DEEP-DIVE.md)**
> 它从第一性原理讲清记忆本质、行业问题与方案流派、embedding 中文质量问题、产品化与多用户安全等，共 25 个问题逐个梳理。

## 快速开始

```shell
cp .env.example .env   # 填 DEEPSEEK_API_KEY
npm install
npm run dev            # 打开 http://localhost:4111
```

## 目录结构

```
04-memory/
├── package.json
├── tsconfig.json
├── .env.example / .env
└── src/mastra/
    ├── index.ts                            ← 入口：注册 4 个 Agent + Storage
    └── agents/
        ├── conversation-history-agent.ts   ← 能力① 对话历史
        ├── working-memory-agent.ts         ← 能力② 工作记忆
        ├── observational-memory-agent.ts   ← 能力③ 观察性记忆
        └── semantic-recall-agent.ts        ← 能力④ 语义召回
```

---

# 学习笔记

## 一、Memory 到底是做什么的？

一句话：**让 Agent 在"对话之间"保留和召回信息。**

没有 Memory：

```text
你："我叫小明，我喜欢蓝色"
Agent："好的"
你："我叫什么？"     → Agent：忘了（每句话都是全新开始）
```

有 Memory：

```text
你："我叫小明，我喜欢蓝色"
Agent："好的，记住了"
你："我叫什么？"     → Agent："你叫小明" ✅
```

## 二、Mastra Memory 的五大能力

官方把 Memory 拆成几种能力，它们**互相配合、解决不同问题**：

| 能力 | 关键词 | 一句话 | 默认 |
| --- | --- | --- | --- |
| ① 对话历史 | `lastMessages` | 把最近的 N 条消息塞进上下文 | 开（10 条） |
| ② 工作记忆 | `workingMemory` | 结构化保存用户长期档案 | 关 |
| ③ 观察性记忆 | `observationalMemory` | 后台自动提炼值得记住的事实 | 关 |
| ④ 语义召回 | `semanticRecall` | 按"意思相似"检索历史消息 | 关 |
| ⑤ 线程标题 | `generateTitle` | 自动给对话起标题（辅助） | 关 |

### 能力①：对话历史（Conversation History）

```ts
memory: new Memory({
  options: {
    lastMessages: 6,        // 上下文带最近 6 条
    generateTitle: true,    // 自动起标题
  },
}),
```

- 最基础、默认开启
- 只记住**同一个对话线程**里的最近 N 条
- 局限：太早的话会忘；新对话从头开始；对话越长 token 越贵

**实验**（在 `对话历史 Agent`）：

1. 说"我叫小明，我喜欢蓝色"
2. 问"我叫什么？" → 记得 ✅
3. 新建对话再问 → 忘了 ❌（不同线程）

### 能力②：工作记忆（Working Memory）

```ts
memory: new Memory({
  options: {
    workingMemory: {
      enabled: true,
      scope: 'resource',      // 跨所有对话
      schema: userProfileSchema,  // 用 zod 定义"用户档案"
    },
  },
}),
```

- 解决"对话历史跨对话就忘"的问题
- 做法：定义一个**结构化档案模板**，Agent 把用户长期信息写进去
- `scope: 'resource'` = 一个用户的所有对话共享这份档案
- 两种格式：Markdown 模板（`template`）或 Zod Schema（`schema`，推荐）

**实验**（在 `工作记忆 Agent`）：

1. 对话 A 说"我叫小明，在做智能家居项目，喜欢简洁回答"
2. 新建对话 B 直接问"我的项目是什么？" → 还记得 ✅

### 能力③：观察性记忆（Observational Memory）

```ts
memory: new Memory({
  options: {
    observationalMemory: {
      enabled: true,
      scope: 'resource',
      model: 'deepseek/deepseek-v4-flash',  // 指定观察/反思模型
      observation: { messageTokens: 2000 }, // 触发阈值
    },
  },
}),
```

- 最独特的能力：**不靠用户显式说，后台模型自动观察提炼**
- 三段式：
  - `Observer`（观察者）：从对话提取值得记住的事实
  - `Reflector`（反思者）：观察太多时压缩合并
  - `Scope`：'thread' 或 'resource'
- ⚠️ 默认 Observer/Reflector 是 Gemini，本项目显式换成 DeepSeek
- 触发阈值 `messageTokens` 默认 30000，这里调小方便观察

**实验**（在 `观察性记忆 Agent`）：

1. 多轮聊工作、家庭、爱好（不用刻意告诉它要记住）
2. 打开 Traces 找 Observer 的运行记录
3. 新建对话问"之前聊过的事" → 观察性记忆跨对话召回

### 能力④：语义召回（Semantic Recall）

```ts
memory: new Memory({
  vector: new LibSQLVector({
    id: 'memory-vectors',
    url: 'file:./mastra.db',   // 注意：正确参数是 url（不是 connectionUrl）
  }),
  embedder: fastembed.smallV2,  // 本地 bge-small-en-v1.5（无需 API key）
  options: {
    semanticRecall: {
      topK: 3,          // 找回 3 条最相似
      messageRange: 2,  // 每条前后带 2 条
      scope: 'resource',
      threshold: 0.3,
    },
  },
}),
```

- 属于"按需检索"型记忆（轻量 RAG）
- 核心：把文字转成向量，按**意思相似度**搜索，而非关键词
- 需要三样：向量库（LibSQLVector）+ embedding 模型 + 配置

**embedder 用法（@mastra/fastembed 新版 API）：**

```text
fastembed             → 默认 bge-small-en-v1.5（v3 spec）
fastembed.smallV2     → bge-small-en-v1.5（v2 spec，本项目用这个）
fastembed.baseV2      → bge-base-en-v1.5（更大，更准）
```

这些是英文模型，对中文也能工作，只是精度略低于中文专用模型。需要远程 embedding 时可用 `openai/text-embedding-3-small`（需 key）。

**安装 fastembed 的一个坑（已解决）：**

```text
@mastra/fastembed 依赖 onnxruntime-node，
它在 linux/x64 上会额外尝试下载 CUDA GPU 二进制，
如果网络访问 GitHub Releases 被 302 重定向，npm install 会失败。

解决办法：用 ONNXRUNTIME_NODE_INSTALL=skip 跳过 CUDA 下载
（fastembed 只用 CPU 推理，根本不需要 CUDA）：
```

```shell
ONNXRUNTIME_NODE_INSTALL=skip npm install
```

**已实际验证 ✅**（2026-08-04）：

1. 对话 A 说"我下周要去日本出差，帮我准备行李清单"
2. 新建对话 B，问"还记得我之前准备出差的事吗？帮我补充转换插头"
3. Agent 回答："记得，之前帮你整理过日本出差清单" ✅ —— 跨对话语义召回成功

## 三、五种能力怎么选？

```text
只要"当前对话内连贯"        → 对话历史（默认就够）
要"跨对话记住用户偏好"      → 工作记忆（结构化）或 观察性记忆（自动）
要"按意思检索历史内容"      → 语义召回（需要向量库）
```

实际项目通常是**组合使用**：

```text
对话历史（基础连贯）
+ 工作记忆（用户档案）
+ 观察性记忆（自动长期记忆）
+ 语义召回（需要时检索）
```

## 四、重要前提：必须配 Storage

所有记忆都依赖 Storage 持久化：

```text
没配 Storage → 记忆只在内存，重启就丢
配 LibSQL   → 存到本地 mastra.db，重启还在
```

本项目的 `index.ts` 已配置 LibSQL。

## 五、数据库里存了什么

跑过几个 Agent 后，`mastra.db` 里的关键表：

| 表 | 存什么 |
| --- | --- |
| `mastra_threads` | 对话线程（标题等） |
| `mastra_messages` | 对话消息 |
| `mastra_memories` | 工作记忆 / 观察性记忆 |
| `mastra_ai_spans` | 可观测性 trace |
| `memory_*`（向量表） | 消息的向量表示（语义召回用） |

## 六、常见坑

```text
1. 不配 Storage → 记忆重启就丢
2. 观察性记忆默认用 Gemini → 没 Gemini key 会失败，要显式指定模型
3. 语义召回必须同时配 vector + embedder，缺一不可
4. 语义召回阈值 threshold 设太高 → 什么也召回不到
5. 改 Memory 配置后热更新可能不彻底 → 完全重启 dev server
```

---

_最后更新：2026-08-04_
