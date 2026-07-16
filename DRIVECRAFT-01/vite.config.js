import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  assetsInclude: ['**/*.glb'],
  server: {
    https: true,
    host: true, // expõe na rede local (0.0.0.0) pra conseguir abrir pelo Quest
  },
})