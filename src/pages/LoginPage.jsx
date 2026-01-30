// src/pages/LoginPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAuthed, loginWithSimpleIdPw } from "../utils/auth";
import { supabase } from "../utils/supabaseClient"; // ✅ 추가: Supabase Auth 로그인용

const COLORS = {
  bgTop: "#eef5ff", // 연파랑
  bgBottom: "#f6f8fc", // 연회색
  text: "#1f2a44",
  sub: "#6b7a90",
  border: "#dbe3f1",
  inputBg: "rgba(255,255,255,0.75)", // 입력칸만 살짝 밝게
  blue: "#5b8cff",
  danger: "#d11",
};

// ✅ 보안용 Supabase Auth 계정(원장 1계정) - 여기만 너 계정으로 바꿔줘
//    - 값은 코드에 직접 박아도 되지만, 더 안전하게 하려면 .env로 빼는 걸 추천(아래 설명 참고)
const ADMIN_AUTH_EMAIL = import.meta.env.VITE_ADMIN_AUTH_EMAIL || "";
const ADMIN_AUTH_PASSWORD = import.meta.env.VITE_ADMIN_AUTH_PASSWORD || "";

export default function LoginPage() {
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false); // ✅ 추가: 중복 클릭 방지

  useEffect(() => {
    if (isAuthed()) nav("/dashboard", { replace: true });
  }, [nav]);

  async function ensureSupabaseAuthSession() {
    // 1) 이미 세션이 있으면 그대로 OK
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) return true;

    // 2) 세션이 없으면(처음 접속/쿠키 삭제 등) 보안용 계정으로 로그인
    if (!ADMIN_AUTH_EMAIL || !ADMIN_AUTH_PASSWORD) {
      // 여기서 막히면 “RLS 켠 상태에서 DB가 전부 막힘” → 반드시 설정 필요
      setErr(
        "보안 로그인 설정이 필요합니다. (VITE_ADMIN_AUTH_EMAIL / VITE_ADMIN_AUTH_PASSWORD)"
      );
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: ADMIN_AUTH_EMAIL,
      password: ADMIN_AUTH_PASSWORD,
    });

    if (error) {
      setErr(`보안 로그인 실패: ${error.message}`);
      return false;
    }
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setErr("");
    setLoading(true);

    try {
      // ✅ 1) 기존 커스텀 로그인(산본/471466 등) 그대로 유지
      const ok = loginWithSimpleIdPw(id.trim(), pw.trim());
      if (!ok) {
        setErr("아이디 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // ✅ 2) 커스텀 로그인 성공 시, Supabase Auth 세션도 확보
      const authed = await ensureSupabaseAuthSession();
      if (!authed) return;

      // ✅ 3) 대시보드 이동
      nav("/dashboard", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    height: 46,
    padding: "0 14px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.inputBg,
    outline: "none",
    fontSize: 15,
    color: COLORS.text,
    backdropFilter: "blur(6px)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 70%)`,
      }}
    >
      {/* ✅ 흰색 네모 카드 박스 없음: 그냥 중앙 컨테이너만 */}
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              color: COLORS.text,
              letterSpacing: "-0.2px",
            }}
          >
            블라썸에듀 산본 로그인
          </h1>
          <p style={{ margin: "8px 0 0", color: COLORS.sub, fontSize: 14 }}>
            아이디와 비밀번호를 입력해주세요.
          </p>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: COLORS.sub }}>아이디</div>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디"
              autoComplete="username"
              style={inputStyle}
              disabled={loading}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: COLORS.sub }}>비밀번호</div>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              style={inputStyle}
              disabled={loading}
            />
          </label>

          {err ? (
            <div
              style={{
                marginTop: 2,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(255,242,242,0.9)",
                border: "1px solid #ffd2d2",
                color: COLORS.danger,
                fontSize: 14,
              }}
            >
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 48,
              borderRadius: 12,
              border: `1px solid ${COLORS.blue}`,
              background: COLORS.blue,
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 6,
              boxShadow: "0 10px 20px rgba(91,140,255,0.25)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <div
            style={{
              textAlign: "center",
              color: COLORS.sub,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            © BlossomEdu Sanbon
          </div>
        </form>
      </div>
    </div>
  );
}
