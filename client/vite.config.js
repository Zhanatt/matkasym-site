import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Render ставит IS_PULL_REQUEST=true при сборке предпросмотра PR («Правки сайта»)
  define: { __IS_PREVIEW__: JSON.stringify(process.env.IS_PULL_REQUEST === 'true') },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
