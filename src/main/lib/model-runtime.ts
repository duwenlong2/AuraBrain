import { resolveModelConfig, type OpenAICompatibleConfig } from '@mastra/core/llm'
import { generateText, streamText, type LanguageModel } from 'ai'
import { loadConfig } from './config-store.ts'
import { getSecret } from './secret-store.ts'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: unknown
}

export type ResolvedModel = {
  reference: string
  providerId: string
  modelId: string
  model: LanguageModel
}

async function resolveModelConfigForRuntime(reference?: string): Promise<{
  reference: string
  providerId: string
  modelId: string
  config: OpenAICompatibleConfig
}> {
  const config = loadConfig()
  const modelReference = reference || config.models?.default
  if (!modelReference) throw new Error('尚未配置默认模型')

  const { providerId, modelId } = splitModelReference(modelReference)
  const provider = config.models?.providers?.find(item => item.id === providerId)
  if (!provider) throw new Error(`找不到模型提供商：${providerId}`)
  if (provider.apiType !== 'chat-completions') {
    throw new Error(`当前只支持 Chat Completions 模型：${provider.apiType}`)
  }

  const apiKey = provider.apiKeyRef ? await getSecret(provider.apiKeyRef) : undefined
  return {
    reference: modelReference,
    providerId,
    modelId,
    config: {
      id: `${providerId}/${modelId}`,
      url: provider.baseUrl,
      apiKey: apiKey || undefined,
    },
  }
}

function splitModelReference(reference: string): { providerId: string; modelId: string } {
  const [providerId, ...modelParts] = reference.split('/')
  const modelId = modelParts.join('/')
  if (!providerId || !modelId) throw new Error('模型引用必须是 provider/model 格式')
  return { providerId, modelId }
}

export async function resolveModel(reference?: string): Promise<ResolvedModel> {
  const resolved = await resolveModelConfigForRuntime(reference)
  const model = await resolveModelConfig(resolved.config)

  return {
    reference: resolved.reference,
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    model: model as unknown as LanguageModel,
  }
}

export async function resolveMastraModel(reference?: string): Promise<OpenAICompatibleConfig> {
  return (await resolveModelConfigForRuntime(reference)).config
}

export async function generateModelText(input: {
  model?: string
  messages: ChatMessage[]
}) {
  const resolved = await resolveModel(input.model)
  return generateText({
    model: resolved.model,
    messages: input.messages as any,
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(120_000),
  })
}

export async function streamModelText(input: {
  model?: string
  messages: ChatMessage[]
}) {
  const resolved = await resolveModel(input.model)
  return streamText({
    model: resolved.model,
    messages: input.messages as any,
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(120_000),
  })
}

export function toOpenAIStream(textStream: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const iterator = textStream[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
          return
        }
        const payload = JSON.stringify({ choices: [{ delta: { content: next.value }, index: 0 }] })
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return?.()
    },
  })
}
