import { defineConfig } from '@trigger.dev/sdk'

export default defineConfig({
  project: 'proj_vmvlnmsgweifpocgjqve',
  dirs: ['./src/trigger'],
  maxDuration: 300, // 5 minutes — enough for LLM + image/video generation
  enableConsoleLogging: true,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
})
