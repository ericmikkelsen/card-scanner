import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: {
      // Add the library page as a separate HTML entry so it is emitted to dist/
      input: {
        main: resolve(__dirname, 'index.html'),
        library: resolve(__dirname, 'library/index.html'),
      },
    },
  },
});
