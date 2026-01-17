// src/pages/TeacherOneToOneHubPage.jsx
import { useNavigate, useParams } from "react-router-dom";

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "rgba(31,42,68,0.14)",
  white: "#ffffff",
  blue: "#2f6fed",
};

export default function TeacherOneToOneHubPage() {
  const nav = useNavigate();
  const { teacherName } = useParams();

  const safeTeacher = teacherName || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
        color: COLORS.text,
        padding: `calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "min(720px, 100%)" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>
            {safeTeacher ? `${safeTeacher} 선생님` : "선생님"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: COLORS.sub }}>
            아래에서 원하는 화면을 선택하세요.
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <button
            type="button"
            onClick={() =>
              nav(`/one-to-one/${encodeURIComponent(safeTeacher)}/schedule`)
            }
            style={{
              width: "100%",
              height: 54,
              borderRadius: 14,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.white,
              color: COLORS.text,
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            시간표보기
          </button>

          <button
            type="button"
            onClick={() =>
              nav(`/one-to-one/${encodeURIComponent(safeTeacher)}/todos`)
            }
            style={{
              width: "100%",
              height: 54,
              borderRadius: 14,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.white,
              color: COLORS.text,
              fontSize: 16,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            날짜별할일보기
          </button>
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: COLORS.sub }}>
          * “날짜별할일보기”는 새 페이지로 만들 예정
        </div>
      </div>
    </div>
  );
}
