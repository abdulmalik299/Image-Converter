import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages needs a "base" path like "/RepoName/" for project pages.
 * Our GitHub Actions workflow sets VITE_BASE automatically.
 */
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "robots.txt", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Image Converter",
        short_name: "Converter",
        description: "Private, offline-ready image converter + SVG tools. Runs fully in your browser.",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        display: "standalone",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"]
      }
    })
  ]
});
