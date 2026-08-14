import { createOpenAI } from '@ai-sdk/openai';

const azure = createOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_BASE_URL,
});

export const azureModel = azure(
  process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.6-luna',
);
