import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const depositInputSchema = z.object({
  // 客户类型：普通客户或 VIP 客户
  customerType: z.enum(['normal', 'vip']),
  // 账户类型：活期或定期
  accountType: z.enum(['savings', 'fixed']),
  // 存款金额
  amount: z.number(),
  // 存款期限，单位是月
  termMonths: z.number(),
});

const validateDepositStep = createStep({
  id: 'validate-deposit',
  inputSchema: depositInputSchema,
  outputSchema: depositInputSchema,
  execute: async ({ inputData }) => {
    // 这里是业务流程的第一道门：先保证输入数据合理。
    if (inputData.amount <= 0) {
      throw new Error('存款金额必须大于 0');
    }

    if (!Number.isInteger(inputData.termMonths) || inputData.termMonths <= 0) {
      throw new Error('存款期限必须是大于 0 的整数月');
    }

    if (inputData.accountType === 'fixed' && inputData.termMonths < 3) {
      throw new Error('定期存款期限不能少于 3 个月');
    }

    return inputData;
  },
});

const calculateInterestStep = createStep({
  id: 'calculate-interest',
  inputSchema: depositInputSchema,
  outputSchema: z.object({
    customerType: z.enum(['normal', 'vip']),
    accountType: z.enum(['savings', 'fixed']),
    amount: z.number(),
    termMonths: z.number(),
    interestRate: z.number(),
    estimatedInterest: z.number(),
    attempts: z.number(),
  }),
  // 模拟调用第三方利率服务：失败后最多自动再尝试 3 次。
  retries: 3,
  execute: async ({ inputData, retryCount }) => {
    // 99999 代表第三方服务暂时不可用，前三次失败，第四次恢复。
    const currentRetryCount = retryCount ?? 0;
    const attempts = currentRetryCount + 1;
    console.log('[calculate-interest]', { retryCount, attempts });
    if (inputData.amount === 99999 && currentRetryCount < 3) {
      throw new Error(`第三方利率服务暂时不可用，这是第 ${attempts} 次尝试`);
    }

    // 根据账户类型先选择基础年利率。
    let interestRate = inputData.accountType === 'savings' ? 1.5 : 2.4;

    // 定期存款满 12 个月，使用更高的年利率。
    if (inputData.accountType === 'fixed' && inputData.termMonths >= 12) {
      interestRate = 3.2;
    }

    // VIP 客户额外增加 0.2 个百分点。
    if (inputData.customerType === 'vip') {
      interestRate += 0.2;
    }

    // 利息 = 本金 × 年利率 × 存款年数。
    const estimatedInterest =
      inputData.amount * (interestRate / 100) * (inputData.termMonths / 12);

    return {
      customerType: inputData.customerType,
      accountType: inputData.accountType,
      amount: inputData.amount,
      termMonths: inputData.termMonths,
      interestRate,
      estimatedInterest: Number(estimatedInterest.toFixed(2)),
      attempts,
    };
  },
});

const complianceCheckStep = createStep({
  id: 'compliance-check',
  inputSchema: depositInputSchema,
  outputSchema: z.object({
    approved: z.boolean(),
    reason: z.string(),
  }),
  // suspendSchema：暂停时展示给人工审核页面的数据格式
  suspendSchema: z.object({
    reason: z.string(),
    amount: z.number(),
  }),
  // resumeSchema：人工审核后恢复 Workflow 时传回的数据格式
  resumeSchema: z.object({
    approved: z.boolean(),
    reviewer: z.string(),
  }),
  execute: async ({ inputData, suspend, resumeData }) => {
    // 超过系统上限的申请直接拒绝，不进入人工审核。
    if (inputData.amount > 500_000) {
      return { approved: false, reason: '单笔存款金额不能超过 500000' };
    }

    // 大额存款不能自动通过，第一次运行时暂停等待人工审核。
    // resumeData 只有在 Workflow 被恢复后才会有值。
    if (inputData.amount > 100_000 && !resumeData) {
      await suspend(
        {
          reason: '大额存款需要人工审核',
          amount: inputData.amount,
        },
        { resumeLabel: 'manual-review' },
      );
    }

    // 如果是人工审核恢复后的运行，使用审核员传回的结果。
    if (resumeData) {
      return {
        approved: resumeData.approved,
        reason: `人工审核人：${resumeData.reviewer}`,
      };
    }

    // 下面是其他合规规则：不同账户类型有不同的最长期限。
    if (inputData.accountType === 'savings' && inputData.termMonths > 12) {
      return { approved: false, reason: '活期存款学习规则中期限不能超过 12 个月' };
    }

    if (inputData.accountType === 'fixed' && inputData.termMonths > 60) {
      return { approved: false, reason: '定期存款期限不能超过 60 个月' };
    }

    return { approved: true, reason: '申请通过合规检查' };
  },
});

const depositDecisionSchema = z.object({
  customerType: z.enum(['normal', 'vip']),
  accountType: z.enum(['savings', 'fixed']),
  amount: z.number(),
  termMonths: z.number(),
  interestRate: z.number(),
  estimatedInterest: z.number(),
  attempts: z.number(),
  approved: z.boolean(),
  reason: z.string(),
});

const createDepositStep = createStep({
  id: 'create-deposit',
  inputSchema: depositDecisionSchema,
  outputSchema: z.object({
    status: z.string(),
    message: z.string(),
    interestRate: z.number(),
    estimatedInterest: z.number(),
    attempts: z.number(),
  }),
  execute: async ({ inputData }) => ({
    // 这个步骤只负责创建账户，并返回最终给用户看的结果。
    status: 'approved',
    message: `存款申请成功，已创建${inputData.accountType === 'fixed' ? '定期' : '活期'}账户`,
    interestRate: inputData.interestRate,
    estimatedInterest: inputData.estimatedInterest,
    attempts: inputData.attempts,
  }),
});

const rejectDepositStep = createStep({
  id: 'reject-deposit',
  inputSchema: depositDecisionSchema,
  outputSchema: z.object({
    status: z.string(),
    message: z.string(),
    interestRate: z.number(),
    estimatedInterest: z.number(),
    attempts: z.number(),
  }),
  execute: async ({ inputData }) => ({
    // 拒绝时也保留利率和预计利息，便于解释申请结果。
    status: 'rejected',
    message: `存款申请未通过：${inputData.reason}`,
    interestRate: inputData.interestRate,
    estimatedInterest: inputData.estimatedInterest,
    attempts: inputData.attempts,
  }),
});

export const bankDepositWorkflow = createWorkflow({
  id: 'bank-deposit-workflow',
  inputSchema: depositInputSchema,
  outputSchema: z.object({
    status: z.string(),
    message: z.string(),
    interestRate: z.number(),
    estimatedInterest: z.number(),
  }),
  retryConfig: {
    delay: 2000,
  },
})
  // 第一步：检查申请数据
  .then(validateDepositStep)
  // 第二步：同时计算利息和检查合规性
  .parallel([calculateInterestStep, complianceCheckStep])
  // 第三步：把两个并行结果整理成一个对象
  .map(async ({ inputData }) => ({
    // calculate-interest 提供金额、利率和预计利息。
      // compliance-check 提供是否通过以及原因。
    customerType: inputData['calculate-interest'].customerType,
    accountType: inputData['calculate-interest'].accountType,
    amount: inputData['calculate-interest'].amount,
    termMonths: inputData['calculate-interest'].termMonths,
    interestRate: inputData['calculate-interest'].interestRate,
    estimatedInterest: inputData['calculate-interest'].estimatedInterest,
    attempts: inputData['calculate-interest'].attempts,
    approved: inputData['compliance-check'].approved,
    reason: inputData['compliance-check'].reason,
  }))
  // 第四步：合规通过就创建存款，否则拒绝申请
  .branch([
    // approved 为 true 时，进入创建存款分支。
    [async ({ inputData }) => inputData.approved, createDepositStep],
    // approved 为 false 时，进入拒绝申请分支。
    [async ({ inputData }) => !inputData.approved, rejectDepositStep],
  ])
  .commit();
