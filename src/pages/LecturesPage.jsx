// src/pages/LecturesPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "#d9e3f7",
  white: "#ffffff",
};

function parseBulkInput(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const [title, ...rest] = line.split(" ");
      return {
        title,
        url: rest.join(" "),
        order_index: idx,
      };
    });
}

export default function LecturesPage() {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newCourse, setNewCourse] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [links, setLinks] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    setErr("");
    const { data, error } = await supabase.from("lecture_courses").select("*").order("created_at");
    if (error) setErr(error.message);
    setCourses(data || []);
  }

  async function selectCourse(course) {
    setSelected(course);
    setBulkText("");
    setErr("");
    const { data, error } = await supabase.from("lecture_links").select("*").eq("course_id", course.id).order("order_index");
    if (error) setErr(error.message);
    setLinks(data || []);
  }

  async function addCourse() {
    const name = newCourse.trim();
    if (!name) return;
    setErr("");
    const { error } = await supabase.from("lecture_courses").insert({ name });
    if (error) {
      setErr(error.message);
      return;
    }
    setNewCourse("");
    loadCourses();
  }

  async function applyBulk() {
    if (!selected) return;
    setErr("");
    const parsed = parseBulkInput(bulkText);

    const { error: delErr } = await supabase.from("lecture_links").delete().eq("course_id", selected.id);
    if (delErr) {
      setErr(delErr.message);
      return;
    }

    if (parsed.length) {
      const { error: insErr } = await supabase.from("lecture_links").insert(
        parsed.map((l) => ({
          ...l,
          course_id: selected.id,
        }))
      );
      if (insErr) {
        setErr(insErr.message);
        return;
      }
    }

    selectCourse(selected);
  }

  // ✅ 추가: 강의링크 1개 삭제
  async function deleteLink(linkId) {
    if (!selected) return;
    const ok = window.confirm("이 강의링크를 삭제할까요?");
    if (!ok) return;

    setErr("");
    // UI 먼저 반영
    const next = links.filter((x) => x.id !== linkId);
    setLinks(next);

    // DB 삭제
    const { error } = await supabase.from("lecture_links").delete().eq("id", linkId);
    if (error) {
      // 실패 시 다시 로드해서 복구
      setErr(error.message);
      selectCourse(selected);
      return;
    }

    // ✅ 삭제 후 order_index 재정렬(선택 사항이지만 깔끔하게 유지)
    // NOT NULL/제약 문제 피하려고 upsert 대신 update를 개별 호출
    try {
      await Promise.all(
        next.map((r, idx) => supabase.from("lecture_links").update({ order_index: idx }).eq("id", r.id))
      );
      // 최신 반영
      selectCourse(selected);
    } catch (e) {
      // 재정렬 실패해도 링크 삭제 자체는 성공이므로 에러만 표시
      setErr(e?.message || String(e));
    }
  }

  function TrashIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  const iconBtn = (danger = false) => ({
    width: 30,
    height: 30,
    borderRadius: 10,
    border: `1px solid ${COLORS.line}`,
    background: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    color: danger ? "#b00020" : COLORS.text,
    flex: "0 0 auto",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
        padding: 40,
        color: COLORS.text,
      }}
    >
      <h1 style={{ color: COLORS.text, marginBottom: 20 }}>강의관리</h1>

      {err ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,80,80,0.35)",
            background: "rgba(255,80,80,0.08)",
            color: "#b00020",
            fontWeight: 800,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      ) : null}

      {/* 과정 추가 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          placeholder="과정명 (예: pre구문)"
          value={newCourse}
          onChange={(e) => setNewCourse(e.target.value)}
          style={{ padding: 10, flex: 1, borderRadius: 10, border: `1px solid ${COLORS.line}` }}
        />
        <button
          onClick={addCourse}
          style={{
            padding: "0 14px",
            borderRadius: 999,
            border: `1px solid ${COLORS.line}`,
            background: COLORS.white,
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          과정 추가
        </button>
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        {/* 과정 목록 */}
        <div style={{ width: 240 }}>
          {courses.map((c) => (
            <div
              key={c.id}
              onClick={() => selectCourse(c)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                background: selected?.id === c.id ? COLORS.white : "transparent",
                borderRadius: 12,
                marginBottom: 6,
                border: selected?.id === c.id ? `1px solid ${COLORS.line}` : "1px solid transparent",
                fontWeight: selected?.id === c.id ? 900 : 700,
              }}
            >
              {c.name}
            </div>
          ))}
        </div>

        {/* 강의 입력 */}
        {selected && (
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>{selected.name}</h2>

            <textarea
              placeholder="OT https://...\n1강 https://...\n2강 https://..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                padding: 14,
                marginBottom: 12,
                fontFamily: "monospace",
                borderRadius: 14,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.white,
              }}
            />

            <button
              onClick={applyBulk}
              style={{
                marginBottom: 20,
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${COLORS.line}`,
                background: "rgba(90,167,255,0.12)",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              복붙 내용 적용
            </button>

            {/* 미리보기 */}
            {links.map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: `1px solid ${COLORS.line}`,
                  alignItems: "center",
                }}
              >
                <strong style={{ width: 70 }}>{l.title}</strong>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#1f6feb", textDecoration: "underline", overflowWrap: "anywhere", flex: 1 }}
                >
                  {l.url}
                </a>

                {/* ✅ 삭제 버튼 추가 */}
                <button type="button" title="삭제" aria-label="삭제" style={iconBtn(true)} onClick={() => deleteLink(l.id)}>
                  <TrashIcon />
                </button>
              </div>
            ))}

            {!links.length ? <div style={{ color: COLORS.sub, fontWeight: 800 }}>등록된 강의링크가 없어요.</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
