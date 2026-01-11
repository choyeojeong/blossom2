// src/pages/grades/GradesHomePage.jsx
import { useNavigate } from "react-router-dom";

const COLORS = {
  text: "#1f2a44",
  sub: "#5d6b82",
  blue: "#2f6fed",
  blueSoft: "#eef3ff",
};

export default function GradesHomePage() {
  const nav = useNavigate();

  return (
    <div style={{ maxWidth: 1200, margin: "40px auto", padding: 20 }}>
      <h1 style={{ marginBottom: 8 }}>성적관리</h1>
      <p style={{ color: COLORS.sub, marginBottom: 32 }}>
        학생 성적을 관리하거나 유형별로 데이터를 조회할 수 있습니다.
      </p>

      <div style={{ display: "flex", gap: 24 }}>
        <button
          onClick={() => nav("/grades/students")}
          style={btnStyle}
        >
          학생별 성적관리
        </button>

        <button
          onClick={() => nav("/grades/query")}
          style={btnStyle}
        >
          유형별 성적데이터 조회
        </button>
      </div>
    </div>
  );
}

const btnStyle = {
  flex: 1,
  height: 140,
  fontSize: 20,
  fontWeight: 700,
  borderRadius: 16,
  border: "none",
  cursor: "pointer",
  background: "#eef3ff",
  color: "#2f6fed",
};
