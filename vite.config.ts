import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `BASE_PATH` lets forks deploy under a project sub-path (GitHub/GitLab Pages)
// without touching the source. Defaults to root for local dev and custom domains.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022' },
})
