// Azure OpenAI 的兼容接口通过 AI SDK 的 OpenAI provider 创建。
import { createOpenAI } from '@ai-sdk/openai';

// apiKey、baseURL 和 deployment 从 .env 读取，不把密钥写进源码。
const azure = createOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_BASE_URL,
});

// Azure deployment name 是 provider 的 model id。
export const azureModel = azure(
  process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.6-luna',
);
