import { defineConfig } from 'mastra'

export default defineConfig({
  src: './src/main/index.ts',
  server: {
    port: Number(process.env.AURABRAIN_PORT || 49000),
    host: process.env.AURABRAIN_HOST || '127.0.0.1',
  },
})
