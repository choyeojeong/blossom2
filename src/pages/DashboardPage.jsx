// src/pages/DashboardPage.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

const COLORS = {
  bgTop: "#eef4ff", // 연파랑
  bgBottom: "#f7f9fc", // 연회색
  text: "#1f2a44",
  border: "#d9e3f7",
  btnBg: "#ffffff",
};

export default function DashboardPage() {
  const nav = useNavigate();

  // ✅ 요청한 2열 배치/순서 그대로:
  // 학생관리 | 일대일시간표
  // 성적관리 | 독해시간표
  // 강의관리 | 출결현황
  // 학부모연락양식 | 키오스크
  const actions = useMemo(
    () => [
      { label: "학생관리", to: "/students" },
      { label: "일대일시간표", to: "/one-to-one" },

      { label: "성적관리", to: "/grades" },
      { label: "독해시간표", to: "/reading" },

      { label: "강의관리", to: "/lectures" },
      { label: "출결현황", to: "/attendance" },

      { label: "학부모연락양식", to: "/contact-forms" },
      { label: "키오스크", to: "/kiosk" },
    ],
    []
  );

  function logout() {
    sessionStorage.clear();
    localStorage.clear();
    nav("/", { replace: true });
  }

  return (
    <div style={styles.page}>
      {/* 로그아웃 */}
      <button onClick={logout} style={styles.logoutBtn}>
        로그아웃
      </button>

      {/* 중앙 버튼 영역 */}
      <div style={styles.center}>
        <div style={styles.grid}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => nav(a.to)}
              style={styles.menuBtn}
              title={a.label}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
    position: "relative",
    color: COLORS.text,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR"',
  },

  logoutBtn: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 14px)",
    right: 14,
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    zIndex: 10,
  },

  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  // ✅ 2열 그리드
  grid: {
    width: "min(560px, 96vw)",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  // ✅ 버튼 (카드 느낌 없이 깔끔한 버튼)
  menuBtn: {
    height: 54,
    borderRadius: 14,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.btnBg,
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 12px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};
