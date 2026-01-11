// src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// ✅ PWA 서비스워커 등록
import { registerSW } from "virtual:pwa-register";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ✅ 새 배포 자동 업데이트 체크 + 즉시 등록
registerSW({
  immediate: true,
});
