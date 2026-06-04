import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // 加载环境变量
    const env = loadEnv(mode, '.', '');
    
    // 自动兼容：优先取获取到的 API_KEY，如果没有就取 GEMINI_API_KEY
    const finalApiKey = env.API_KEY || env.GEMINI_API_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      
      // 核心魔改：全面覆盖各种读取姿势，防患于未然
      define: {
        'process.env.API_KEY': JSON.stringify(finalApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(finalApiKey),
        'import.meta.env.VITE_API_KEY': JSON.stringify(finalApiKey),
        'import.meta.env.API_KEY': JSON.stringify(finalApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
