import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://theme.codexguide.ai",
  output: "static",
  integrations: [sitemap()],
  vite: {
    ssr: {
      noExternal: ["lucide-astro"],
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
    },
  },
});
