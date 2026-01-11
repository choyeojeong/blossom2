import { useLocation, useNavigate } from "react-router-dom";

export default function GlobalBackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  // ✅ 뒤로가기 버튼 숨길 경로
  const HIDE_PATHS = ["/", "/dashboard"];
  if (HIDE_PATHS.includes(pathname)) return null;

  function goBack() {
    if (window.history.length > 1) nav(-1);
    else nav("/dashboard", { replace: true });
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="뒤로가기"
      title="뒤로가기"
      style={{
        position: "fixed",
        zIndex: 999999,
        left: 12,

        /**
         * ✅ iPhone Safe Area 완전 대응
         * - safe-area-inset-top : 노치 + 상태바
         * - + 12px : 버튼과 상태바 사이 여유
         * 👉 결과적으로 아이폰에서 "확실히 내려온 위치"
         */
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",

        height: 36,
        minWidth: 36,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.92)",
        color: "#1f2a44",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      ←
    </button>
  );
}
