# AuraBrain

Give your AuraCore a brain. / 给 AuraCore 装上大脑。

AuraBrain 是一个基于 [Mastra](https://mastra.ai) 的 TypeScript 云端 AI 框架，连接云端智能与物理世界。

🧠 Think – 理解自然语言，拆解意图（Agent + Workflow）
📡 Connect – 通过 MQTT 与 ESP32 设备通信
⚡ Act – 把意图解析为硬件指令，驱动真实设备（小车 / 摄像头 / 机械臂）

本项目同时是一个**系统性学习 Mastra 的系列项目**：从研究框架源码出发，逐步深入，最终为 [AuraCore](https://github.com/duwenlong2/AuraCore) 构建云端 AI 大脑。

## 目录结构

```
AuraBrain/
├── docs/              ← 学习文档 + 系列博客 + 调研笔记
├── examples/          ← 学习示例项目（从 helloworld 起步）
│   └── 01-basic-agent ← 第一个示例：基础 Agent
└── mastra/            ← Mastra 框架源码（独立拉取，见下文）
```

## 如何获取 Mastra 源码

本仓库**不包含** Mastra 源码，只提交我们自己的代码。学习 / 源码深挖用的 `mastra/` 目录需要单独拉取：

```bash
# 克隆 Mastra 源码（官方仓库）
git clone https://github.com/mastra-ai/mastra.git mastra

# 更新源码
cd mastra
git pull
```

`mastra/` 已在 `.gitignore` 中忽略，不会进入本仓库的提交。

## 快速开始（examples/01-basic-agent）

```bash
cd examples/01-basic-agent
cp .env.example .env   # 填入 OPENAI_API_KEY
npm install
npm run dev            # 打开 http://localhost:4111 访问 Mastra Studio
```

## 文档

- [学习规划](docs/plan.md)
- [系列博客](docs/blog/)
- [调研笔记](docs/research/)

## License

MIT
