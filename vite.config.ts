import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const finalApiKey = env.API_KEY || env.GEMINI_API_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // 核心劫持：直接替换代码里的 process.env 和占位符字符串
        'process.env.API_KEY': JSON.stringify(finalApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(finalApiKey),
        '"__VITE_API_KEY_PLACEHOLDER__"': JSON.stringify(finalApiKey) 
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
