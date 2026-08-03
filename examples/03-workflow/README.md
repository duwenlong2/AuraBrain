# 03-workflow

这是一个 Mastra Workflow 学习示例，目前包含两个场景：

- `climate-workflow`：最小入门，学习顺序和分支
- `bank-deposit-workflow`：更复杂的银行存款申请，学习并行、数据整形和分支

先不考虑湿度，因为这个例子要学习的是 Workflow 的结构，而不是设计复杂的智能家居规则。

## 快速开始

```shell
npm install
npm run dev
```

打开 `http://localhost:4111`，进入 **Workflows**，选择想学习的 Workflow。

## Storage：保存 Workflow 运行状态

本示例已经接入本地 LibSQL 存储：

```text
src/mastra/index.ts
  |
  v
LibSQLStore
  |
  v
mastra.db
```

以前没有配置 `storage` 时，运行状态主要保存在内存中，服务重启后可能丢失。
现在运行记录和暂停状态会保存到 `mastra.db`，因此可以支持更真实的长流程。

可以这样验证：

1. 输入金额 `200000`，让银行 Workflow 暂停。
2. 关闭并重新启动 Studio。
3. 查看这个 Workflow 的运行记录，确认暂停状态仍然存在。

这里要区分两个概念：

```text
Storage：保存 Workflow 运行状态、步骤结果、暂停信息
Memory：保存 Agent 与用户的对话记忆
```

当前这一步只学习 Storage，暂时没有给 Workflow 加 Memory。

## 失败处理与自动重试

`calculate-interest` 步骤现在配置了：

```ts
retries: 2
```

意思是：步骤第一次执行失败后，Mastra 最多再自动尝试 2 次。

为了方便学习，代码中加入了一个固定的测试输入：

```json
{
  "customerType": "normal",
  "accountType": "fixed",
  "amount": 123456,
  "termMonths": 12
}
```

金额正好是 `123456` 时，`calculate-interest` 前两次会模拟临时故障，第三次成功。
其他金额不会触发这个测试故障。

```text
第一次执行：失败
    ↓
自动重试：失败
    ↓
再次重试：成功
```

步骤中的 `retryCount` 表示当前已经是第几次重试，第一次执行时它是 `0`：

```ts
if (inputData.amount === 123456 && retryCount < 2) {
  throw new Error('模拟临时故障');
}
```

在 Observability 中，可以查看这个步骤的执行记录和失败信息。
这里要区分两种错误：

```text
临时错误：重试后可能成功，例如网络短暂中断
业务错误：重试没有意义，例如存款金额小于等于 0
```

真实项目中不应该无条件重试所有错误，需要根据错误类型决定是否重试。

## 银行存款 Workflow

银行存款流程模拟：

```text
提交存款申请
       |
       v
validate-deposit       校验金额、账户类型和期限
       |
       +-----------------------+
       |                       |
       v                       v
calculate-interest      compliance-check
计算预计利息             检查是否符合规则
       |                       |
       +-----------+-----------+
                   v
                 map             合并两个结果
                   |
                   v
                branch
                /     \
             通过       拒绝
              |          |
       create-deposit  reject-deposit
```

在 Studio 的 `bank-deposit-workflow` 中，可以测试：

### 正常存款

```json
{
  "customerType": "normal",
  "accountType": "fixed",
  "amount": 10000,
  "termMonths": 12
}
```

预期：`calculate-interest` 和 `compliance-check` 并行成功，最后执行 `create-deposit`，输出 `approved`。

### VIP 存款

```json
{
  "customerType": "vip",
  "accountType": "fixed",
  "amount": 10000,
  "termMonths": 12
}
```

预期：VIP 利率比普通客户高 `0.2` 个百分点。

### 合规拒绝

```json
{
  "customerType": "normal",
  "accountType": "fixed",
  "amount": 600000,
  "termMonths": 12
}
```

预期：利息仍然会被计算，但 `compliance-check` 输出不通过，最后执行 `reject-deposit`。

### 大额存款：暂停等待人工审核

输入金额超过 `100000` 时，Workflow 不会立即通过或拒绝，而是在 `compliance-check` 暂停：

```json
{
  "customerType": "normal",
  "accountType": "fixed",
  "amount": 200000,
  "termMonths": 12
}
```

此时流程状态是 `suspended`，表示：

```text
流程没有失败
也没有成功
正在等待人工审核结果
```

暂停时，Studio 可以看到：

```json
{
  "reason": "大额存款需要人工审核",
  "amount": 200000
}
```

人工审核后传回：

```json
{
  "approved": true,
  "reviewer": "admin"
}
```

Workflow 恢复后，会继续执行：

```text
compliance-check
  -> map
  -> branch
  -> create-deposit 或 reject-deposit
```

代码中的三个暂停相关概念：

```text
suspendSchema：暂停时需要展示什么数据
resumeSchema：恢复时允许传回什么数据
resumeData：恢复运行时实际收到的审核结果
```

这模拟了真实银行流程：系统自动处理普通申请，大额申请交给人工审核，审核完成后继续原来的流程。

这个例子的重点不是银行规则是否真实，而是观察数据如何流动：

```text
一个输入
  -> 两个并行步骤
  -> map 合并结果
  -> branch 选择通过或拒绝
```

下面的温度例子仍然保留，作为最小 Workflow 参考。

## 关于 batch-deposit-workflow 和 foreach

`batch-deposit-workflow` 用来学习 `.foreach()`：它接收一个数组，对数组中的每个存款申请执行相同的校验和利息计算，最后再聚合结果。

这个能力在 Mastra 运行时是正式支持的，仓库中的官方文档和测试也使用了顶层数组作为 Workflow 输入。但当前 Studio 的动态输入表单对顶层 `z.array(...)` 支持不够友好，可能不会显示可编辑的输入字段。

因此：

- `batch-deposit-workflow` 保留作为 `.foreach()` 的源码和 API 学习案例。
- 不把它作为当前 Studio 练习的主流程。
- 需要运行时，可以通过 API 传入数组，例如：

```json
[
  {
    "customerId": "C001",
    "amount": 10000,
    "termMonths": 12
  },
  {
    "customerId": "C002",
    "amount": 5000,
    "termMonths": 6
  }
]
```

## Workflow State：整理行李的流程

`state-workflow` 用“整理出门行李”这个日常例子学习 `stateSchema`、`state` 和 `setState`。

它模拟整理行李的流程：

```text
准备出门
   |
   v
开始整理         写入 status 和 checklist
   |
   v
装进行李         写入 packedItems 和 checklist
   |
   v
检查完成         从共享 State 读取完整清单
```

这里要区分两种数据传递方式：

```text
inputData / output：当前步骤和下一步骤之间的数据
state / setState：整个 Workflow 运行期间共享、累积的数据
```

在 Studio 的 `state-workflow` 中可以输入：

```json
{
  "person": "小明",
  "destination": "海边",
  "items": ["身份证", "充电器", "雨伞"]
}
```

重点观察每个步骤如何更新同一个 State：`packedItems` 是共享的行李清单，`checklist` 是共享的操作记录。

### 三个最重要的 State 概念

可以先用“说明书、当前数据、修改方法”来理解：

```text
stateSchema：规定 State 必须有哪些字段，像 State 的说明书
state：当前这一次 Workflow 运行中的实际共享数据
setState：把新的数据交回 Mastra，更新共享 State
```

`stateSchema` 不是已经保存好的数据，它只是规定结构。例如本例规定 State 有：

```ts
{
  status: string,
  packedItems: string[],
  checklist: { step: string, message: string }[]
}
```

实际运行时，Mastra 会根据这个结构创建并维护 State。步骤执行时，Mastra 会把当前 State 注入到 `execute`：

```ts
execute: async ({ inputData, state, setState }) => {
  console.log(state.packedItems); // 读取当前共享数据

  await setState({
    status: 'checking',
    packedItems: inputData.items,
    checklist: state.checklist,
  });
}
```

这里还要区分两条数据通道：

```text
上一步 return 的结果 -> 下一步的 inputData
setState 保存的结果  -> 下一步的 state
```

它们不是同一份东西：`return` 负责把当前步骤的输出交给下一步，`State` 负责在整个 Workflow 中保存需要持续累积的数据。

本例的三个步骤只执行一次，`items` 数组也只是一次性读取和保存，不会自动循环。只有使用 `.foreach()`，Mastra 才会对数组中的每一项分别执行步骤。

### State 示例的运行结果

预期最终结果中会看到：

- `status` 变成 `completed`
- `packedItems` 保存输入中的全部物品
- `checklist` 按顺序包含三个步骤留下的记录

## 今天已经学到的 Workflow 能力

到这里，已经覆盖了 Workflow 的主要基础和几项真实运行能力：

```text
基础控制流：.then() / .parallel() / .map() / .branch()
数组处理：.foreach()，以及并发数量的概念
暂停恢复：suspendSchema / resumeSchema / resumeData
共享数据：stateSchema / state / setState
可靠运行：Storage 持久化、错误重试、retryCount
观测运行：Studio Trace 和每个步骤的执行状态
```

尤其要记住：

```text
inputData：当前步骤收到的输入
return：当前步骤输出，通常成为下一步 inputData
state：Workflow 运行期间共享的当前数据
setState：更新共享 State
```

## 还没有学习的重点

后面可以按这个顺序继续：

1. 在整理行李例子中加入 `suspend/resume`，例如遇到“是否需要带雨伞”时暂停等待确认。
2. 学习循环 Workflow：`.dountil()` 和 `.dowhile()`，理解循环条件和每轮输入输出。
3. 深入 `.foreach()` 的结果聚合、错误处理和并发控制。
4. 学习如何在 Workflow Step 中调用 Agent 或 Tool，把确定性流程和模型推理组合起来。
5. 学习更复杂的失败恢复：非重试错误、从中间步骤重新执行、暂停后恢复时的持久化细节。

## 温度 Workflow 的实验

输入一个温度数字后运行，例如：

| 温度 | 判断 | 指令 |
| ---: | --- | --- |
| 33 | 太热 | `AC_ON` |
| 15 | 太冷 | `HEAT_ON` |
| 23 | 舒适 | `IDLE` |
| 999 | 超出传感器范围 | 运行失败 |

## 先看懂整体流程

```text
输入 temperature
       |
       v
validate             检查温度是否合法
       |
       v
judge-temperature    判断 hot / cold / mild
       |
       v
branch               选择一条路
   /       |       \
 太热      太冷      舒适
  /         |         \
AC_ON     HEAT_ON     IDLE
```

整个流程只有两个普通顺序步骤和一个分支：

```text
输入 -> 校验 -> 判断 -> 选择动作 -> 输出
```

## 代码对应关系

代码在 `src/mastra/workflows/climate-workflow.ts`。

### 1. Workflow 的输入

```ts
inputSchema: z.object({ temperature: z.number() })
```

意思是：这个 Workflow 需要一个对象，里面有一个数字类型的 `temperature`。

输入示例：

```json
{ "temperature": 33 }
```

### 2. Step 是流程中的一个动作

每个 `createStep` 都可以先简单理解为一个函数：

```text
输入数据 -> 做一件事 -> 输出数据
```

本例有 5 个 step：

- `validate`：检查温度是否在 -50 到 60 之间
- `judge-temperature`：把温度转换成 `hot`、`cold` 或 `mild`
- `cool-down`：输出 `AC_ON`
- `heat-up`：输出 `HEAT_ON`
- `keep-comfortable`：输出 `IDLE`

### 3. `.then()` 表示按顺序执行

```ts
.then(validateStep)
.then(judgeTemperatureStep)
```

意思是：先校验，校验成功后再判断温度。

### 4. `.branch()` 表示选择分支

```ts
.branch([
  [conditionHot, coolDownStep],
  [conditionCold, heatUpStep],
  [conditionMild, keepComfortableStep],
])
```

可以把它读成：

```text
如果 hot  -> cool-down
如果 cold -> heat-up
如果 mild -> keep-comfortable
```

三个条件互斥，所以一次只应该执行一个动作。

### 5. Workflow 的输出

每个动作都会输出同样形状的数据：

```json
{
  "command": "AC_ON",
  "message": "温度 33°C 偏高，开启空调降温"
}
```

其中：

- `command`：未来可以发送给 ESP32 的机器指令
- `message`：给人看的解释

## 建议实验

### 实验 1：高温

输入：

```json
{ "temperature": 33 }
```

预期：执行 `validate`、`judge-temperature`、`cool-down`，输出 `AC_ON`。

### 实验 2：低温

输入：

```json
{ "temperature": 15 }
```

预期：执行 `heat-up`，输出 `HEAT_ON`。

### 实验 3：舒适

输入：

```json
{ "temperature": 23 }
```

预期：执行 `keep-comfortable`，输出 `IDLE`。

### 实验 4：非法输入

输入：

```json
{ "temperature": 999 }
```

预期：`validate` 失败，后面的步骤不执行。

## 现在只需要理解的 TypeScript

暂时只记住这些：

```ts
const value = 1;                 // 定义变量
async function run() {}          // 可以执行异步任务的函数
await run();                     // 等待异步任务完成
({ inputData })                  // 从对象中取出 inputData
(a) => a + 1                    // 一个简单函数
```

不需要现在就完全掌握泛型、类型推导和复杂的 Zod 写法。先能读懂数据从哪里来、经过哪一步、变成什么即可。

## 为什么暂时不放湿度

湿度当然可以参与真实的空调决策，但那是另一个业务设计问题，例如：

- 温度高，不管湿度如何，都开空调
- 温度不高但湿度很高，开启除湿模式
- 温度和湿度都舒适，保持不动

这些规则需要先明确产品逻辑，再写代码。学习 Workflow 的第一步，不需要同时处理这些业务决定。

等这个最小例子熟悉后，再逐步加入湿度、并行判断、`map` 和循环，会更容易看清每次增加的东西。
