// src/pages/OneToOneScheduleSelectPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

const COLORS = {
  bg: "#f6f8fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "rgba(31,42,68,0.14)",
  pillBg: "rgba(120,160,255,0.18)",
  pillText: "#2b5bd7",
  danger: "#b42318",
};

export default function OneToOneScheduleSelectPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [teachers, setTeachers] = useState([]); // { teacher_name, count }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      // ✅ 퇴원 안한 학생 기준으로 선생님 목록 생성
      const { data, error } = await supabase
        .from("students")
        .select("teacher_name, withdrawal_date")
        .is("withdrawal_date", null);

      if (error) throw error;

      const map = new Map();
      (data || []).forEach((r) => {
        const t = (r.teacher_name || "").trim();
        if (!t) return;
        map.set(t, (map.get(t) || 0) + 1);
      });

      const list = Array.from(map.entries())
        .map(([teacher_name, count]) => ({ teacher_name, count }))
        .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, "ko"));

      setTeachers(list);
    } catch (e) {
      setErr(e?.message || "불러오기 실패");
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        padding: "28px 18px 40px",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: -0.3 }}>
            일대일 시간표
          </h1>

          <button
            type="button"
            onClick={load}
            style={{
              border: `1px solid ${COLORS.line}`,
              background: "transparent",
              color: COLORS.text,
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
            }}
            title="새로고침"
          >
            새로고침
          </button>
        </div>

        <p style={{ margin: "0 0 16px", color: COLORS.sub }}>
          등록된 학생이 있는 선생님만 표시돼요. (학생이 0명이 되면 자동으로 사라짐)
        </p>

        {err ? <div style={{ color: COLORS.danger, marginBottom: 12 }}>{err}</div> : null}

        <div style={{ borderTop: `1px solid ${COLORS.line}` }} />

        {loading ? (
          <div style={{ padding: "16px 0", color: COLORS.sub }}>불러오는 중…</div>
        ) : teachers.length === 0 ? (
          <div style={{ padding: "16px 0", color: COLORS.sub }}>
            표시할 선생님이 없어요. (퇴원하지 않은 학생이 아직 없음)
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, paddingTop: 14 }}>
            {teachers.map((t) => (
              <button
                key={t.teacher_name}
                type="button"
                onClick={() => nav(`/one-to-one/${encodeURIComponent(t.teacher_name)}`)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 14px",
                  borderRadius: 14,
                  border: `1px solid ${COLORS.line}`,
                  background: "rgba(255,255,255,0.70)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{t.teacher_name}</div>
                  <div style={{ color: COLORS.sub, fontSize: 13 }}>학생 {t.count}명</div>
                </div>

                <div
                  style={{
                    background: COLORS.pillBg,
                    color: COLORS.pillText,
                    padding: "8px 10px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 800,
                    whiteSpace: "nowrap",
                  }}
                >
                  들어가기 →
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
