import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'copy-pdf-worker',
      writeBundle() {
        const pdfjsDistPath = resolve(__dirname, 'node_modules/pdfjs-dist/build')
        const targetPath = resolve(__dirname, 'public')
        try {
          copyFileSync(
            `${pdfjsDistPath}/pdf.worker.min.mjs`,
            `${targetPath}/pdf.worker.min.mjs`
          )
          console.log('✅ PDF.js worker copiado correctamente')
        } catch (error) {
          console.warn('⚠️ No se pudo copiar el worker:', error.message)
        }
      }
    }
  ],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  }
})