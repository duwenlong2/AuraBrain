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
│   └── blog/        ← 系列博客（每篇一个知识点，和 examples 对应）
├── examples/        ← 学习示例（从 helloworld 起步，最小 MVP）
│   └── 01-basic-agent
└── mastra/          ← Mastra 框架源码（独立拉取，见下）
```

## 快速开始

```bash
# 1. 拉取 Mastra 源码（本仓库不包含源码，学习/深挖用）
git clone https://github.com/mastra-ai/mastra.git mastra
# 更新源码：cd mastra && git pull

# 2. 跑第一个示例
cd examples/01-basic-agent
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（默认用 DeepSeek）
npm install
npm run dev            # 打开 http://localhost:4111 访问 Mastra Studio
```

> **API Key 安全**：所有 key 都放在 `.env`（已被 `.gitignore` 忽略），不会提交到 GitHub。
> 本示例默认使用 DeepSeek（`deepseek/deepseek-v4-flash`），也可在 `.env` 填 `OPENAI_API_KEY` 切换回 OpenAI——只需改 `src/mastra/agents/*.ts` 里的 `model` 字符串即可。

## 学习方式

每篇博客对应一个 `examples/` 示例，都是最小 MVP：能跑、验证一个知识点、讲清楚怎么初始化怎么学。

- 从 [01 · 为什么选 Mastra](docs/blog/01-为什么选Mastra.md) 开始看
- 按博客编号逐步学习（02、03...），每篇对应一个示例

## License

MIT
