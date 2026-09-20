import { useLocation, useNavigate } from "react-router-dom";

export default function GlobalBackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  // 로그인 화면, 대시보드 자체, 학생용 표시 화면에서는 숨긴다.
  const HIDE_PATHS = ["/", "/dashboard", "/word-battle/display"];
  if (HIDE_PATHS.includes(pathname)) return null;

  function goBack() {
    if (window.history.length > 1) nav(-1);
    else nav("/dashboard", { replace: true });
  }

  return (
    <div
      aria-label="페이지 이동 버튼"
      style={{
        position: "fixed",
        zIndex: 999999,
        left: 12,
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="뒤로가기"
        title="뒤로가기"
        style={buttonStyle}
      >
        ←
      </button>

      <button
        type="button"
        onClick={() => nav("/dashboard")}
        aria-label="대시보드로 이동"
        title="대시보드로 이동"
        style={{ ...buttonStyle, padding: "0 14px" }}
      >
        ⌂ 대시보드
      </button>
    </div>
  );
}

const buttonStyle = {
  height: 38,
  minWidth: 38,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid rgba(31,42,68,0.16)",
  background: "rgba(255,255,255,0.94)",
  color: "#1f2a44",
  fontSize: 13,
  fontWeight: 900,
  whiteSpace: "nowrap",
  cursor: "pointer",
  boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};
