import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './' // Relative asset paths: the built dist/ works from any folder or static server
});
