# Mastra 源码导读（对着代码学）

> 本仓库的 `mastra/` 是 [Mastra](https://github.com/mastra-ai/mastra) 官方源码（独立 git 仓库，可 `git pull` 更新）。
> 这份文档是"系列博客 ↔ 源码"的索引地图：**每个博客知识点，去源码哪里看**。
>
> 核心源码在 `mastra/packages/core/src/`，框架的所有核心原语（Agent / Tool / Workflow / Memory / Storage / Observability）都在这里。

## 0. 怎么读源码（方法论）

1. **测试文件 = 最好的用法文档**。`*.test.ts` 展示真实调用方式，比 README 更准、永远和代码同步。
   - Workflow 用法 → `workflows/*.test.ts`、`workflows/__tests__/`
   - 类型契约 → `workflow-schema-types.test-d.ts`（type-level 测试）
2. **先看类型再看实现**：`types.ts` / `step.ts` 里的接口定义了"应该怎么用"，实现只是兑现。
3. **追一次执行流**：从 `createWorkflow` → `.commit()` → `createRun()` → `run.start()` 顺着看，比漫无目的翻快。
4. **区分两种引擎**：`workflows/` 根目录是"默认引擎"，`workflows/evented/` 是事件化引擎（分支/并行/循环的处理在这里）。

## 1. Workflow（博客 03 · 正在学）

**源码目录**：`mastra/packages/core/src/workflows/`

| 文件 | 讲什么 |
|------|--------|
| `workflow.ts` | **主战场**。`Workflow` 类 + `createStep` 工厂。`.then()` / `.parallel()` / `.map()` / `.branch()` / `.commit()` 的调用链都在这里定义 |
| `create.ts` | `createWorkflow()` 工厂（有 schedule 自动升级到 evented 引擎）、`cloneWorkflow()` |
| `step.ts` | `Step` 接口 + `ExecuteFunctionParams`（`execute` 能拿到什么：`inputData` / `state` / `mastra` / `getInitData` / `getStepResult` ...） |
| `step-factories.ts` | `createStepFromAgent` / `createStepFromTool` / `createMappingStep`（createStep 内部按入参分发） |
| `types.ts` | 大量类型：`StepParams`、`ExecuteFunction`、条件/映射配置、`workflow` 图结构 |
| `execution-engine.ts` / `default.ts` | 默认执行引擎（怎么跑步骤、收集结果） |
| `evented/` | 事件化引擎：`workflow-event-processor/` 里有 `parallel.ts`（并行）、`conditional.ts`（分支）、`loop.ts`（foreach/dountil）的实现 |
| `__tests__/` | **推荐**：`predicate-builder.test.ts`（branch 闭包签名）、`declarative-step-entries.test.ts`（map/parallel 真实链式）、`stored-round-trip.test.ts`（把各种控制流串成一条链） |

**示例 ↔ 源码对照（examples/03-workflow）**：

```
climate-workflow.ts 里的                                   对应源码
────────────────────────────────────────────────────────────────
createStep({ id, inputSchema, outputSchema, execute })   workflows/workflow.ts:createStep
createWorkflow({ id, inputSchema, outputSchema })         workflows/create.ts:createWorkflow
.then(validateStep)                                       workflow.ts:then
.parallel([temp, humidity])                               workflow.ts:parallel → evented/.../parallel.ts
.map(async ({ inputData }) => ...)                        workflow.ts:map → step-factories.ts:createMappingStep
.branch([[closure, step], ...])                           workflow.ts:branch → evented/.../conditional.ts
.commit()                                                 workflow.ts:commit
execute 里的 inputData                                    step.ts:ExecuteFunctionParams.inputData
```

## 2. Agent / Tool（博客 01、02）

**源码目录**：
- Agent → `mastra/packages/core/src/agent/`（`agent.ts` 是主类）
- Tools → `mastra/packages/core/src/tools/`（`createTool` 在 `tools/index.ts` 或类似处）
- Memory → `mastra/packages/core/src/memory/`
- Storage → `mastra/packages/core/src/storage/`
- Observability → `mastra/packages/core/src/observability/`

> 02 里验证过的：`Agent` 用 `new Agent({ id, name, instructions, model, tools, memory })`；
> 记忆/存储/观测的具体实现都在上面这些目录。深挖 agent loop 看 `agent/` 下的执行逻辑。

## 3. 系列博客 ↔ 源码索引

| 博客 | 主题 | 优先读的源码 |
|------|------|-------------|
| 00 | 为什么选 Mastra | `mastra/packages/` 总览 + `README` |
| 01 | 官方模板初探 | `agent/`、`tools/`（Agent 自主选工具、工具质量） |
| 02 | 极简 Agent | `agent/`、`tools/`、`memory/`、`storage/`、`observability/` |
| 03 | 极简 Workflow | `workflows/`（本页第 1 节） |
| 04+ | 待定（foreach 循环 / step 内调 Agent / 多 Agent / MQTT） | 视主题再看 `workflows/evented/`、`agent/` 等 |

## 4. 常用源码入口速查

```bash
# 更新 Mastra 源码
cd mastra && git pull

# 看 Workflow 的 .branch/.parallel 到底怎么定义
code mastra/packages/core/src/workflows/workflow.ts

# 看 branch 闭包签名（测试即文档）
code mastra/packages/core/src/workflows/__tests__/predicate-builder.test.ts

# 看 evented 引擎怎么处理并行/分支/循环
code mastra/packages/core/src/workflows/evented/workflow-event-processor/

# 看 step 的 execute 能拿到哪些参数（inputData/state/mastra/getStepResult）
code mastra/packages/core/src/workflows/step.ts
```

---

_建立于 2026-08-02（对应 Mastra main 分支源码）_
