import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      include: ['src/**/*.test.ts', 'tests/**/*.ts'],
    },
  },
])
