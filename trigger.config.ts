import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  // Find your project ref in the Trigger.dev dashboard → Project Settings
  project: 'proj_REPLACE_WITH_YOUR_PROJECT_REF',
  dirs: ['./src/trigger'],
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
