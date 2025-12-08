import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import fs from "fs";

// Plugin to copy .well-known folder (Vite doesn't copy dotfiles by default)
const copyWellKnown = () => ({
  name: 'copy-well-known',
  closeBundle() {
    const src = path.resolve(__dirname, 'public/.well-known');
    const dest = path.resolve(__dirname, 'dist/.well-known');
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
      console.log('✅ Copied .well-known folder to dist');
    }
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      'Content-Security-Policy': mode === 'development' 
        ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://localhost:* https: wss: ws:;"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
    },
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    copyWellKnown()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
}));
