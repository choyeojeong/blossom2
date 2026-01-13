// src/pages/LecturesPage.jsx
import { useEffect, useMemo, useState } from "react";
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

  // ✅ 과정명 수정 상태
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    setErr("");
    const { data, error } = await supabase
      .from("lecture_courses")
      .select("*")
      .order("created_at");
    if (error) setErr(error.message);
    setCourses(data || []);

    // 선택된 과정이 삭제되었거나 목록 갱신 중 이름이 바뀐 경우 동기화
    if (selected) {
      const fresh = (data || []).find((x) => x.id === selected.id) || null;
      if (!fresh) {
        setSelected(null);
        setLinks([]);
        setBulkText("");
      } else {
        setSelected(fresh);
      }
    }
  }

  async function selectCourse(course) {
    setSelected(course);
    setBulkText("");
    setErr("");
    setEditingCourseId(null);
    setEditingName("");

    const { data, error } = await supabase
      .from("lecture_links")
      .select("*")
      .eq("course_id", course.id)
      .order("order_index");
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

    const { error: delErr } = await supabase
      .from("lecture_links")
      .delete()
      .eq("course_id", selected.id);
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

  // ✅ 강의링크 1개 삭제
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
      setErr(error.message);
      selectCourse(selected);
      return;
    }

    // ✅ 삭제 후 order_index 재정렬
    try {
      await Promise.all(
        next.map((r, idx) =>
          supabase.from("lecture_links").update({ order_index: idx }).eq("id", r.id)
        )
      );
      selectCourse(selected);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  // ✅ 과정명 편집 시작
  function startEditCourse(course) {
    setEditingCourseId(course.id);
    setEditingName(course.name || "");
    // 편집 중에도 클릭으로 selected 바뀌는건 싫으면 여기서 막아도 되지만,
    // 지금은 "선택된 과정"일 때만 편집 UI가 나오도록 해서 충분히 안전합니다.
  }

  function cancelEditCourse() {
    setEditingCourseId(null);
    setEditingName("");
  }

  // ✅ 과정명 저장
  async function saveCourseName() {
    if (!editingCourseId) return;
    const name = (editingName || "").trim();
    if (!name) {
      setErr("과정명은 비워둘 수 없어요.");
      return;
    }

    setErr("");
    const { data, error } = await supabase
      .from("lecture_courses")
      .update({ name })
      .eq("id", editingCourseId)
      .select("*")
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    // 로컬 목록 반영
    setCourses((prev) => prev.map((c) => (c.id === editingCourseId ? { ...c, name: data.name } : c)));

    // selected도 반영
    if (selected?.id === editingCourseId) {
      setSelected((prev) => (prev ? { ...prev, name: data.name } : prev));
    }

    cancelEditCourse();
  }

  // ✅ 과정 삭제 (Supabase에서도 삭제)
  async function deleteCourse(course) {
    const ok = window.confirm(
      `과정 "${course.name}" 를 삭제할까요?\n(해당 과정의 강의링크도 함께 삭제됩니다)`
    );
    if (!ok) return;

    setErr("");

    // UI 선반영
    const willClearSelected = selected?.id === course.id;
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
    if (willClearSelected) {
      setSelected(null);
      setLinks([]);
      setBulkText("");
    }
    if (editingCourseId === course.id) cancelEditCourse();

    // 1) 링크 삭제(안전장치)
    const { error: delLinksErr } = await supabase
      .from("lecture_links")
      .delete()
      .eq("course_id", course.id);

    if (delLinksErr) {
      setErr(delLinksErr.message);
      // 복구는 loadCourses로
      await loadCourses();
      return;
    }

    // 2) 과정 삭제
    const { error: delCourseErr } = await supabase
      .from("lecture_courses")
      .delete()
      .eq("id", course.id);

    if (delCourseErr) {
      setErr(delCourseErr.message);
      await loadCourses();
      return;
    }

    // 최종 동기화
    await loadCourses();
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

  function PencilIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 20h9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function CheckIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function XIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M18 6 6 18M6 6l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
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

  const selectedCourse = useMemo(
    () => (selected ? courses.find((c) => c.id === selected.id) || selected : null),
    [courses, selected]
  );

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
        <div style={{ width: 260 }}>
          {courses.map((c) => {
            const isSelected = selectedCourse?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => selectCourse(c)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: isSelected ? COLORS.white : "transparent",
                  borderRadius: 12,
                  marginBottom: 6,
                  border: isSelected ? `1px solid ${COLORS.line}` : "1px solid transparent",
                  fontWeight: isSelected ? 900 : 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </div>

                {/* ✅ 선택된 과정에서만 수정/삭제 버튼 노출 */}
                {isSelected ? (
                  <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="과정명 수정"
                      aria-label="과정명 수정"
                      style={iconBtn(false)}
                      onClick={() => startEditCourse(c)}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      title="과정 삭제"
                      aria-label="과정 삭제"
                      style={iconBtn(true)}
                      onClick={() => deleteCourse(c)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* 강의 입력 */}
        {selectedCourse && (
          <div style={{ flex: 1 }}>
            {/* ✅ 제목 + 과정명 수정 UI */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              {editingCourseId === selectedCourse.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="과정명"
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      border: `1px solid ${COLORS.line}`,
                      width: "min(420px, 100%)",
                      fontWeight: 900,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCourseName();
                      if (e.key === "Escape") cancelEditCourse();
                    }}
                  />
                  <button
                    type="button"
                    title="저장"
                    aria-label="저장"
                    style={iconBtn(false)}
                    onClick={saveCourseName}
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    title="취소"
                    aria-label="취소"
                    style={iconBtn(false)}
                    onClick={cancelEditCourse}
                  >
                    <XIcon />
                  </button>
                </>
              ) : (
                <h2 style={{ margin: 0 }}>{selectedCourse.name}</h2>
              )}
            </div>

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
                  style={{
                    color: "#1f6feb",
                    textDecoration: "underline",
                    overflowWrap: "anywhere",
                    flex: 1,
                  }}
                >
                  {l.url}
                </a>

                <button
                  type="button"
                  title="삭제"
                  aria-label="삭제"
                  style={iconBtn(true)}
                  onClick={() => deleteLink(l.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}

            {!links.length ? (
              <div style={{ color: COLORS.sub, fontWeight: 800 }}>
                등록된 강의링크가 없어요.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
