/**
 * ============================================================
 * src/mastra/tools/unit-convert-tool.ts —— 单位换算工具（第二个工具）
 * ============================================================
 *
 * 第二个工具：单位换算（长度/重量/温度）。
 *
 * 目的：让 Agent 拥有两个工具后，能"判断"该用哪个。
 *   - "128*1111"            → 用 calculator（计算器）
 *   - "5 公里等于多少米"     → 用 unit_convert（单位换算）
 *
 * 注意：这个工具的实现逻辑比计算器复杂一点，
 * 因为它要"查表 + 换算"，而不是简单的四则运算。
 * 这正好展示：工具 execute 里的逻辑，是根据需求自己写的。
 */
import { createTool } from '@mastra/core/tools';   // Mastra 工具工厂函数
import { z } from 'zod';                            // 数据校验库

// 单位换算工具
export const unitConvertTool = createTool({
  id: 'unit_convert',
  // 描述：告诉 Agent 这个工具是"换算单位"用的，以及支持哪些单位
  description:
    'Convert a value between units (length: km/m/cm/mm, weight: kg/g, temperature: c/f). Use this when the user asks about unit conversion.',

  // 输入结构：一个数值 + 从哪个单位 + 到哪个单位
  inputSchema: z.object({
    value: z.number(),               // 要换算的数值
    from: z.string().describe('Source unit, e.g. km, m, cm, mm, kg, g, c, f'),
    to: z.string().describe('Target unit, e.g. km, m, cm, mm, kg, g, c, f'),
  }),

  // 真正干活的函数
  execute: async ({ value, from, to }) => {
    // ---- ① 长度换算：先把所有单位统一转成"米"，再转到目标单位 ----
    const lengthToMeter = { km: 1000, m: 1, cm: 0.01, mm: 0.001 };
    if (lengthToMeter[from as keyof typeof lengthToMeter] !== undefined &&
        lengthToMeter[to as keyof typeof lengthToMeter] !== undefined) {
      const inMeter = value * lengthToMeter[from as keyof typeof lengthToMeter]; // 先转成米
      const result = inMeter / lengthToMeter[to as keyof typeof lengthToMeter]; // 再转到目标单位
      return { result, unit: to };
    }

    // ---- ② 重量换算：统一转成"千克" ----
    const weightToKg = { kg: 1, g: 0.001 };
    if (weightToKg[from as keyof typeof weightToKg] !== undefined &&
        weightToKg[to as keyof typeof weightToKg] !== undefined) {
      const inKg = value * weightToKg[from as keyof typeof weightToKg];  // 先转成千克
      const result = inKg / weightToKg[to as keyof typeof weightToKg];   // 再转到目标单位
      return { result, unit: to };
    }

    // ---- ③ 温度换算：公式转换（摄氏 ↔ 华氏） ----
    if (from === 'c' && to === 'f') return { result: (value * 9) / 5 + 32, unit: 'f' }; // C→F
    if (from === 'f' && to === 'c') return { result: ((value - 32) * 5) / 9, unit: 'c' }; // F→C

    // 都不认识的单位：返回原值 + 提示
    return { result: value, unit: to, note: 'unsupported conversion' };
  },
});
