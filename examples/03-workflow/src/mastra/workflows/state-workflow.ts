// 从 Mastra 导入“创建步骤”和“创建 Workflow”的函数。
import { createStep, createWorkflow } from '@mastra/core/workflows';
// 导入 Zod，用来定义并校验数据结构。
import { z } from 'zod';

// 定义整个 Workflow 的输入格式。
// Studio 中填写的 Input Data 必须符合这个结构。
const packingInputSchema = z.object({
  // person 必须是字符串，例如“小明”。
  person: z.string(),
  // destination 必须是字符串，例如“海边”。
  destination: z.string(),
  // items 必须是字符串数组，例如 ["身份证", "充电器"]。
  items: z.array(z.string()),
});

// 定义 checklist 中每一条记录的格式。
const checklistEntrySchema = z.object({
  // 记录是哪一个步骤写入的。
  step: z.string(),
  // 记录这个步骤做了什么。
  message: z.string(),
});

// 定义整个 Workflow 运行期间共享的 State 格式。
const workflowStateSchema = z.object({
  // 当前流程状态；没有初始值时默认为 new。
  status: z.string().default('new'),
  // 已经装进行李的物品；默认是空数组。
  packedItems: z.array(z.string()).default([]),
  // 所有步骤共同维护的操作记录；默认是空数组。
  checklist: z.array(checklistEntrySchema).default([]),
});

// 创建第一个步骤：开始整理行李。
const startPackingStep = createStep({
  // 步骤的唯一 ID，也会显示在 Workflow 图中。
  id: 'start-packing',
  // 这个步骤接收完整的出行输入。
  inputSchema: packingInputSchema,
  // 这个步骤把完整输入原样传给下一步。
  outputSchema: packingInputSchema,
  // 声明这个步骤使用哪一种共享 State。
  stateSchema: workflowStateSchema,
  // execute 是步骤真正执行的函数。
  //
  // 注意：这个函数不是我们自己直接调用的。
  // 当 Workflow 运行到 startPackingStep 时，Mastra 引擎会自动调用它，
  // 并把当前运行上下文放进大括号中传进来。
  //
  // 本步骤收到的 inputData 来自 Studio 的 Input Data：
  // {
  //   person: '小明',
  //   destination: '海边',
  //   items: ['身份证', '充电器', '雨伞']
  // }
  //
  // 本步骤没有读取 state，所以这里只解构 inputData 和 setState。
  execute: async ({ inputData, setState }) => {
    // setState 用来修改整个 Workflow 共享的 State。
    // 执行前 State 使用 schema 中的默认值：
    // {
    //   status: 'new',
    //   packedItems: [],
    //   checklist: []
    // }
    // 下面这次 setState 会把它更新成“正在整理”的状态。
    await setState({
      // 记录当前已经进入整理阶段。
      status: 'packing',
      // 刚开始整理，还没有物品装入包中。
      packedItems: [],
      // 初始化第一条操作记录。
      checklist: [{
        step: 'start-packing',
        message: `开始为 ${inputData.person} 准备去 ${inputData.destination} 的物品`,
      }],
    });
    // return 的数据会成为下一个步骤的 inputData。
    // 这里原样返回 Studio 最初传进来的 inputData，
    // 因此 packItemsStep 会收到完整的 person、destination 和 items。
    return inputData;
  },
});

// 创建第二个步骤：把物品装进行李。
const packItemsStep = createStep({
  // 步骤的唯一 ID。
  id: 'pack-items',
  // 第二步接收第一步 return 出来的完整输入。
  inputSchema: packingInputSchema,
  // 第二步只把人员、目的地和物品数量传给下一步。
  outputSchema: z.object({
    person: z.string(),
    destination: z.string(),
    itemCount: z.number(),
  }),
  // 第二步也可以读取和修改同一份共享 State。
  stateSchema: workflowStateSchema,
  // Mastra 运行这个步骤时，会注入 inputData、state 和 setState。
  //
  // 这三个值的来源不同：
  // inputData：来自上一步 startPackingStep 的 return inputData。
  // state：来自 Workflow 引擎保存的共享 State，已经包含第一步的更新。
  // setState：Mastra 提供的函数，用来把新的 State 保存回 Workflow。
  //
  // 所以这里大致可以想象成 Mastra 在内部做了这样的调用：
  // packItemsStep.execute({
  //   inputData: {
  //     person: '小明',
  //     destination: '海边',
  //     items: ['身份证', '充电器', '雨伞']
  //   },
  //   state: {
  //     status: 'packing',
  //     packedItems: [],
  //     checklist: [{
  //       step: 'start-packing',
  //       message: '开始为小明准备去海边的物品'
  //     }]
  //   },
  //   setState: Mastra提供的更新函数
  // })
  execute: async ({ inputData, state, setState }) => {
    // 复制旧的 checklist，再追加当前步骤的记录。
    // ...state.checklist 表示保留前面步骤已经写入的记录。
    const checklist = [...state.checklist, {
      step: 'pack-items',
      message: `已经装好 ${inputData.items.length} 件物品`,
    }];
    // 把第二步产生的信息写入共享 State。
    // 更新前的 State 仍然是第一步留下的 State。
    // 更新后会变成：
    // {
    //   status: 'checking',
    //   packedItems: ['身份证', '充电器', '雨伞'],
    //   checklist: [第一步记录, 第二步记录]
    // }
    await setState({
      status: 'checking',
      // 一次性保存整个 items 数组；这里没有 foreach 循环。
      packedItems: inputData.items,
      checklist,
    });
    // 这里只传递下一步需要的摘要数据。
    // 这份 return 不会替代 State，它只会成为 finishPackingStep 的 inputData：
    // {
    //   person: '小明',
    //   destination: '海边',
    //   itemCount: 3
    // }
    return {
      person: inputData.person,
      destination: inputData.destination,
      itemCount: inputData.items.length,
    };
  },
});

// 创建第三个步骤：完成最后检查并生成结果。
const finishPackingStep = createStep({
  // 步骤的唯一 ID。
  id: 'finish-packing',
  // 它接收第二步 return 的摘要数据，而不是完整的 items 数组。
  inputSchema: z.object({
    person: z.string(),
    destination: z.string(),
    itemCount: z.number(),
  }),
  // 声明整个 Workflow 最终返回的数据结构。
  outputSchema: z.object({
    person: z.string(),
    destination: z.string(),
    status: z.string(),
    packedItems: z.array(z.string()),
    checklist: z.array(checklistEntrySchema),
  }),
  // 第三步继续使用同一份共享 State。
  stateSchema: workflowStateSchema,
  // 这里同时读取上一步输入和共享 State。
  // inputData 来自 packItemsStep 的 return。
  // state 来自 Mastra 保存的共享 State，已经包含前两步的记录。
  execute: async ({ inputData, state, setState }) => {
    // 保留旧记录，并追加最后检查的记录。
    const checklist = [...state.checklist, {
      step: 'finish-packing',
      message: `检查完成，共 ${inputData.itemCount} 件物品`,
    }];
    // 把流程状态更新为已完成。
    // 这次更新后，共享 State 会变成最终状态：
    // {
    //   status: 'completed',
    //   packedItems: ['身份证', '充电器', '雨伞'],
    //   checklist: [第一步记录, 第二步记录, 第三步记录]
    // }
    await setState({
      status: 'completed',
      // 读取第二步已经保存的物品清单。
      packedItems: state.packedItems,
      checklist,
    });
    // return 的对象就是整个 Workflow 的最终输出。
    // Mastra 会根据 outputSchema 校验这份对象，
    // Studio 会把它显示为这次运行的最终结果。
    return {
      person: inputData.person,
      destination: inputData.destination,
      status: 'completed',
      packedItems: state.packedItems,
      checklist,
    };
  },
});

// 创建并导出整个整理行李 Workflow。
export const stateWorkflow = createWorkflow({
  // Workflow 的唯一 ID。
  id: 'state-workflow',
  // Workflow 接收的输入格式。
  inputSchema: packingInputSchema,
  // Workflow 最终输出的格式，复用最后一步的 outputSchema。
  outputSchema: finishPackingStep.outputSchema,
  // Workflow 使用的共享 State 格式。
  stateSchema: workflowStateSchema,
})
  // 按顺序注册三个步骤；每个 then 只执行对应步骤一次。
  //
  // 这里不是普通的函数调用，也不是循环：
  // .then(startPackingStep)  把第一步放入流程
  // .then(packItemsStep)    把第二步放入流程
  // .then(finishPackingStep)把第三步放入流程
  //
  // Mastra 运行时才会按照这个顺序执行每个步骤的 execute。
  .then(startPackingStep)
  .then(packItemsStep)
  .then(finishPackingStep)
  // commit 完成 Workflow 定义，使其可以被 Mastra 注册和运行。
  .commit();

/*
  ==================== 一次完整运行的执行记录 ====================

  假设 Studio 的 Input Data 是：

  {
    "person": "小明",
    "destination": "海边",
    "items": ["身份证", "充电器", "雨伞"]
  }

  第 0 步：Workflow 开始
  - Mastra 根据 inputSchema 检查 Input Data。
  - Mastra 根据 stateSchema 创建共享 State。
  - 因为没有填写 Initial State，使用默认值：

    state = {
      status: 'new',
      packedItems: [],
      checklist: []
    }

  第 1 步：执行 startPackingStep
  - inputData 来自 Studio。
  - setState 更新共享 State：

    state = {
      status: 'packing',
      packedItems: [],
      checklist: [{
        step: 'start-packing',
        message: '开始为小明准备去海边的物品'
      }]
    }

  - return inputData 交给下一步。

  第 2 步：执行 packItemsStep
  - inputData 来自上一步的 return：完整的 person、destination、items。
  - state 来自 Mastra 保存的共享 State：已经有第一步的 checklist。
  - [...state.checklist, 新记录] 复制旧记录，再追加第二步记录。
  - setState 更新共享 State：

    state = {
      status: 'checking',
      packedItems: ['身份证', '充电器', '雨伞'],
      checklist: [
        {
          step: 'start-packing',
          message: '开始为小明准备去海边的物品'
        },
        {
          step: 'pack-items',
          message: '已经装好 3 件物品'
        }
      ]
    }

  - return 摘要数据交给最后一步：

    {
      person: '小明',
      destination: '海边',
      itemCount: 3
    }

  第 3 步：执行 finishPackingStep
  - inputData 来自第二步的 return。
  - state 来自 Mastra 保存的共享 State：已经有物品和前两条记录。
  - 追加最后一条 checklist 记录。
  - setState 把 status 改成 completed。
  - return 最终输出给 Studio：

    {
      person: '小明',
      destination: '海边',
      status: 'completed',
      packedItems: ['身份证', '充电器', '雨伞'],
      checklist: [
        {
          step: 'start-packing',
          message: '开始为小明准备去海边的物品'
        },
        {
          step: 'pack-items',
          message: '已经装好 3 件物品'
        },
        {
          step: 'finish-packing',
          message: '检查完成，共 3 件物品'
        }
      ]
    }

  最重要的三条数据关系：

  1. Studio Input Data
     -> 第一步的 inputData

  2. 某一步 return 的结果
     -> 下一步的 inputData

  3. setState 保存的结果
     -> 下一步的 state

  当前示例没有 foreach，所以 packItemsStep 只执行一次。
  items 数组只是被一次性读取和保存，不会针对每个物品循环执行。
*/