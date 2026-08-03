# Mastra 学习路线

这里的目标不是把 Mastra 的每个 API 都背下来，而是用几个很小的例子，判断每个能力什么时候有用。

## Mastra 的大块知识

可以先分成三层：

```text
核心层：Agent / Tool / Memory / Storage
流程层：Workflow / suspend-resume / retries / Observability
扩展层：RAG / MCP / Processors / Evals / Voice / 部署
```

### 核心层：大概率会用到

| 模块 | 解决什么问题 | 当前例子 |
| --- | --- | --- |
| Agent | 理解用户意图并生成回答 | `01-basic-agent`、`02-mini-agent` |
| Tool | 让 Agent 调用代码、API 或数据库 | `01-basic-agent`、`02-mini-agent` |
| Memory | 让 Agent 记住对话上下文 | `02-mini-agent` |
| Storage | 保存对话、运行记录和其他数据 | `02-mini-agent`、`03-workflow` |

### 流程层：有固定业务流程时使用

| 模块 | 解决什么问题 | 当前例子 |
| --- | --- | --- |
| Workflow | 把多个固定步骤串成可观察的流程 | `03-workflow` |
| suspend/resume | 等待人工确认、支付结果或外部事件 | `03-workflow` |
| retries | 临时失败后自动重试 | `03-workflow` |
| Observability | 查看模型、工具和步骤到底做了什么 | `02-mini-agent`、`03-workflow` |

### 扩展层：先知道用途，遇到需求再深入

| 模块 | 什么时候需要 |
| --- | --- |
| RAG / Embeddings | 让 Agent 从自己的文档、知识库中检索回答 |
| MCP | 接入外部 MCP Server 提供的工具 |
| Processors | 在 Agent 输入或输出前统一过滤、改写或拦截 |
| Evals | 批量评估 Agent 回答质量，比较不同 prompt 或模型 |
| Voice | 语音输入、语音输出和实时语音 Agent |
| Auth / Deploy | 把 Agent 应用接入用户系统并部署上线 |

## Workflow 到底用不用得到？

不一定。可以用这个判断：

```text
用户一句话
  -> Agent 自己判断怎么回答、要不要调用工具
```

这种场景主要用 Agent + Tool，不需要 Workflow。

```text
固定经过 A -> B -> C
中间可能暂停、重试、分支，还要记录每一步
```

这种场景才适合 Workflow。

对 AuraBrain 来说：

```text
聊天问答、查状态、控制一个设备 -> Agent + Tool
执行“检查设备 -> 判断条件 -> 下发指令 -> 等待反馈 -> 重试” -> Workflow
```

所以 Workflow 是可选的流程工具，不是所有 Agent 都必须套一层 Workflow。

## 小例子学习顺序

已有例子先这样跑：

1. `01-basic-agent`：看 Agent、Tool、注册和 Studio。
2. `02-mini-agent`：看最小 Agent、Memory、Storage、Observability。
3. `03-workflow`：看顺序、并行、分支、`map`、`foreach`、State、暂停恢复和重试。

接下来不要直接做大项目，按下面的小实验逐个增加：

1. **Tool 小实验**：写一个 `device-status` 工具，返回设备当前状态。
2. **Agent + Tool**：让 Agent 根据自然语言调用这个工具。
3. **Memory 小实验**：让 Agent 记住设备名称和用户偏好。
4. **RAG 小实验**：放两三条设备说明，让 Agent 回答“这个灯支持什么模式”。
5. **Workflow 小实验**：固定执行“读取状态 -> 判断 -> 控制设备”。
6. **暂停恢复小实验**：危险操作前暂停，等待用户确认。
7. **Observability 小实验**：比较没有工具、调用工具、调用模型时各自花了多少时间。

每个实验只新增一个概念。能解释清楚数据从哪里来、经过哪一步、最后去哪儿，就算学会了，不需要一次掌握所有 Mastra 类型。

## TypeScript 学习顺序

你现在不需要先学完整套 TypeScript。后面遇到代码时，按这个顺序补最实用的部分：

```text
1. const / let：定义变量
2. 对象和数组：{ name: '小明' }、['邮件', '会议']
3. 函数和箭头函数：function、(value) => value
4. async / await：等待异步任务完成
5. 解构：从 { inputData, state } 中取出字段
6. 展开运算符：复制对象或数组并追加内容
7. 类型和接口：说明数据应该长什么样
8. 泛型、类型推导：最后再接触，暂时不用硬背
```

Mastra 代码里看到这种写法时，可以先按普通 JavaScript 理解：

```ts
createStep({
  id: 'device-status',
  inputSchema: z.object({ deviceId: z.string() }),
  execute: async ({ inputData }) => {
    return { deviceId: inputData.deviceId, online: true };
  },
});
```

这里的大括号首先是一个“配置对象”，不是函数传入了很多个参数。复杂的类型只是帮助编辑器检查这份配置是否正确，我们会在真正需要时再拆开学习。

## 学习方式

当前阶段以“看懂和解释”为主，不急着独立写完整项目。后面每次只做一个很小的改动：

```text
先解释语法和数据来源
  -> 再看一个最小例子
  -> 最后运行或修改一处
```

这样可以同时确认两件事：Mastra 的概念没有学错，TypeScript 的语法也没有被跳过。

## 目前的学习边界

已经实际跑过：

```text
Agent / Tool / Memory / Storage / Observability
Workflow 控制流 / State / suspend-resume / retries / foreach
```

暂时不用急着学：

```text
复杂部署、Voice、企业级 Auth、复杂 Evals、底层 Execution Engine
```

下一次最适合写的例子是“设备状态 Tool + Agent”，因为它和 AuraBrain 的硬件方向直接相关，也比 Workflow 更能验证你平时到底用不用得上 Agent。