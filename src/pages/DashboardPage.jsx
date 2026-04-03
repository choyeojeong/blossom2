// src/pages/DashboardPage.jsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

const COLORS = {
  bgTop: "#eef4ff", // 연파랑
  bgBottom: "#f7f9fc", // 연회색
  text: "#1f2a44",
  sub: "#5d6b82",
  border: "#d9e3f7",
  btnBg: "#ffffff",
  btnHover: "rgba(47,111,237,0.10)",
};

export default function DashboardPage() {
  const nav = useNavigate();

  // ✅ 2열 배치/순서 + "구글시트 복붙용" 추가
  // 학생관리 | 일대일시간표
  // 성적관리 | 독해시간표
  // 강의관리 | 출결현황
  // 학부모연락양식 | 키오스크
  // 상담관리 | 구글시트 복붙용
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

      { label: "상담관리", to: "/counseling" },
      { label: "구글시트 복붙용", to: "/google-sheet-export" },
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
      <button onClick={logout} style={styles.logoutBtn}>
        로그아웃
      </button>

      <div style={styles.center}>
        <div style={styles.wrap}>
          <div style={styles.title}>Blossom2</div>
          <div style={styles.desc}>메뉴를 선택해주세요</div>

          <div style={styles.grid}>
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => nav(a.to)}
                style={styles.menuBtn}
                title={a.label}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = COLORS.btnHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = COLORS.btnBg;
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "scale(0.985)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
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
    padding:
      "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px)",
  },

  wrap: {
    width: "min(560px, 96vw)",
  },

  title: {
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: -0.2,
  },

  desc: {
    marginTop: 6,
    marginBottom: 14,
    color: COLORS.sub,
    fontSize: 13,
  },

  grid: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

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
    transition: "transform 0.06s ease, background 0.15s ease",
  },
};