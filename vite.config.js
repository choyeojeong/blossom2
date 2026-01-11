import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // 새 배포 시 자동 업데이트 체크
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "maskable-icon.png",
      ],
      manifest: {
        name: "산본블라썸",
        short_name: "산본블라썸",
        description: "학원 운영/출결/시간표 관리",
        theme_color: "#eaf2ff",
        background_color: "#f7f9fc",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          // (선택) 마스커블 아이콘이 있으면 추천
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },

      // 캐시 전략(기본 Workbox 프리캐시)
      workbox: {
        // SPA 라우팅 새로고침 대응 (서비스워커 측에서도 안전)
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },

      // 개발 중 SW 캐시 꼬임 방지용 (원하면 true로)
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
