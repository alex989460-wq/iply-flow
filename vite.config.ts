import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      maxParallelFileOps: 2,
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("pdfjs-dist")) return "vendor-pdf";
          if (id.includes("html2canvas") || id.includes("jspdf") || id.includes("dompurify")) return "vendor-pdf-export";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("reactflow") || id.includes("@reactflow")) return "vendor-flow";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("xlsx") || id.includes("papaparse")) return "vendor-sheets";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
}));
