import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stylexVite from '@stylexjs/unplugin/vite';
export default defineConfig({
    plugins: [stylexVite(), react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
});
