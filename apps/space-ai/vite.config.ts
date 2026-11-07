import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import agents from "agents/vite";

const clientCodeSplitting = {
  output: {
    codeSplitting: {
      // Split browser bundles only; the Worker runtime must keep its dependency graph intact.
      minSize: 32 * 1024,
      maxSize: 300 * 1024,
      groups: [
        {
          name: "react-vendor",
          test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
          priority: 30
        },
        {
          name: "ai-vendor",
          test: /node_modules[\\/](?:ai|@ai-sdk|@cloudflare[\\/]ai-chat)[\\/]/,
          priority: 20
        },
        {
          name: "codemirror-vendor",
          test: /node_modules[\\/]@codemirror[\\/]/,
          priority: 15
        },
        {
          name: "vendor",
          test: /node_modules[\\/]/,
          priority: 1
        }
      ]
    }
  }
};

export default defineConfig({
  plugins: [agents(), react(), cloudflare()],
  // Cloudflare's Worker environment is named "space_ai". Configure splitting
  // only for the browser "client" environment, never for the Worker bundle.
  environments: {
    client: {
      build: {
        rolldownOptions: clientCodeSplitting
      }
    }
  }
});
