// ============================================================
//  AuraBrain Runtime · 任务执行器
//
//  把"一句话任务"交给默认 Agent 执行，并把执行过程（文本增量、
//  工具调用、工具结果、错误、完成）实时回调出来，供 SSE 推给前端。
//
//  MCP 工具在这里通过 toolsets 动态注入（热加载 + 故障隔离）：
//  每次执行前调用 getMcpToolsets()，只拿到"健康且启用"的 MCP 工具。
//  某个 MCP 挂了 → 它的工具不在 toolsets 里 → Agent 用通用能力降级，不崩溃。
// ============================================================
import { getDefaultAgent } from '../agent/default-agent.ts'
import { getMcpToolsets } from '../mcp/registry.ts'

/** 推给前端的事件（SSE data 帧的 JSON 体） */
export interface TaskEvent {
  type: 'start' | 'text' | 'tool-call' | 'tool-result' | 'error' | 'done'
  /** 文本增量（type=text）或最终文本（type=done） */
  text?: string
  /** 工具名（type=tool-call / tool-result） */
  tool?: string
  /** 工具入参（type=tool-call） */
  args?: unknown
  /** 工具是否成功（type=tool-result） */
  ok?: boolean
  /** 工具结果摘要（type=tool-result） */
  result?: string
  /** 错误信息（type=error） */
  error?: string
}

/** 把任意工具结果压成一段可读摘要（避免把巨大对象塞进 SSE） */
function summarizeResult(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result.slice(0, 2000)
  try {
    const json = JSON.stringify(result)
    return json.length > 2000 ? `${json.slice(0, 2000)}…（已截断）` : json
  } catch {
    return String(result).slice(0, 2000)
  }
}

/**
 * 执行一个任务。
 * @param task 用户的一句话任务
 * @param onEvent 每个执行事件回调（用于 SSE 推送）
 * @param signal 可选的中止信号
 * @returns 最终文本
 */
export async function runTask(
  task: string,
  onEvent: (ev: TaskEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  onEvent({ type: 'start', text: task })

  const agent = await getDefaultAgent()
  // 热加载 MCP 工具（只含健康且启用的服务器）
  const toolsets = await getMcpToolsets()

  const stream = await agent.stream(
    [{ role: 'user', content: task }],
    {
      toolsets,
      autoResumeSuspendedTools: true,
      ...(signal ? { abortSignal: signal } : {}),
    } as any,
  )

  let finalText = ''
  const reader = stream.fullStream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value as any
      switch (chunk?.type) {
        case 'text-delta':
          finalText += chunk.payload?.text ?? ''
          onEvent({ type: 'text', text: chunk.payload?.text ?? '' })
          break
        case 'tool-call':
          onEvent({
            type: 'tool-call',
            tool: chunk.payload?.toolName,
            args: chunk.payload?.args,
          })
          break
        case 'tool-result':
          onEvent({
            type: 'tool-result',
            tool: chunk.payload?.toolName,
            ok: !chunk.payload?.isError,
            result: summarizeResult(chunk.payload?.result),
          })
          break
        case 'error':
          onEvent({ type: 'error', error: String(chunk.payload?.error?.message ?? chunk.payload?.error ?? '未知错误') })
          break
        case 'finish':
          break
        default:
          break
      }
    }
  } finally {
    try { reader.releaseLock() } catch { /* ignore */ }
  }

  onEvent({ type: 'done', text: finalText })
  return finalText
}
