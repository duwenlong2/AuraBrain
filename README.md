# AuraBrain

Give your AuraCore a brain. / 给 AuraCore 装上大脑。

基于 [Mastra](https://mastra.ai) 的 TypeScript 云端 AI 框架，连接云端智能与物理世界。本项目也是一个**系统性学习 Mastra 的系列项目**，最终为 [AuraCore](https://github.com/duwenlong2/AuraCore) 构建云端 AI 大脑。

🧠 Think – 理解自然语言，拆解意图（Agent + Workflow）
📡 Connect – 通过 MQTT 与 ESP32 设备通信
⚡ Act – 把意图解析为硬件指令，驱动真实设备（小车 / 摄像头 / 机械臂）

## 目录结构

```
AuraBrain/
├── docs/
│   └── blog/        ← 系列博客（编号和 examples 一一对应）
│       ├── 00-为什么选Mastra.md   ← 系列开篇（调研 + 规划）
│       ├── 01-basic-agent.md      ← 对应 examples/01
│       └── 02-mini-agent.md       ← 对应 examples/02
├── examples/        ← 学习示例（从 helloworld 起步，最小 MVP）
│   ├── 01-basic-agent   ← 官方模板（已加注释讲解）
│   └── 02-mini-agent    ← 极简示例（从 0 手写）
└── mastra/          ← Mastra 框架源码（独立拉取，见下）
```

## 快速开始

```bash
# 1. 拉取 Mastra 源码（本仓库不包含源码，学习/深挖用）
git clone https://github.com/mastra-ai/mastra.git mastra
# 更新源码：cd mastra && git pull

# 2. 跑示例（推荐从 02-mini-agent 开始，最简）
cd examples/02-mini-agent
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（默认用 DeepSeek）
npm install
npm run dev            # 打开 http://localhost:4111 访问 Mastra Studio
```

> **API Key 安全**：所有 key 都放在 `.env`（已被 `.gitignore` 忽略），不会提交到 GitHub。
> 默认模型 DeepSeek（`deepseek/deepseek-v4-flash`），也可换 OpenAI——改 `model` 字符串 + `.env` 填 `OPENAI_API_KEY`。

## 学习方式

每篇博客对应一个 `examples/` 示例，都是最小 MVP：能跑、验证一个知识点、讲清楚怎么初始化怎么学。**博客编号和示例编号一一对应**：

```
blog/00-为什么选Mastra.md   → 系列开篇（为什么学、怎么学）
blog/01-basic-agent.md      → examples/01-basic-agent（官方模板探索）
blog/02-mini-agent.md       → examples/02-mini-agent（极简示例）
```

- 从 [00 · 为什么选 Mastra](docs/blog/00-为什么选Mastra.md) 开始看
- 按博客编号逐步学习（01、02...），每篇对应一个示例

## License

MIT
