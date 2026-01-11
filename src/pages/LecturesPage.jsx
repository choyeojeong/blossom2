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

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    const { data } = await supabase
      .from("lecture_courses")
      .select("*")
      .order("created_at");
    setCourses(data || []);
  }

  async function selectCourse(course) {
    setSelected(course);
    setBulkText("");
    const { data } = await supabase
      .from("lecture_links")
      .select("*")
      .eq("course_id", course.id)
      .order("order_index");
    setLinks(data || []);
  }

  async function addCourse() {
    if (!newCourse.trim()) return;
    await supabase.from("lecture_courses").insert({ name: newCourse.trim() });
    setNewCourse("");
    loadCourses();
  }

  async function applyBulk() {
    if (!selected) return;
    const parsed = parseBulkInput(bulkText);

    await supabase.from("lecture_links").delete().eq("course_id", selected.id);

    await supabase.from("lecture_links").insert(
      parsed.map((l) => ({
        ...l,
        course_id: selected.id,
      }))
    );

    selectCourse(selected);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
        padding: 40,
      }}
    >
      <h1 style={{ color: COLORS.text, marginBottom: 20 }}>강의관리</h1>

      {/* 과정 추가 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          placeholder="과정명 (예: pre구문)"
          value={newCourse}
          onChange={(e) => setNewCourse(e.target.value)}
          style={{ padding: 10, flex: 1 }}
        />
        <button onClick={addCourse}>과정 추가</button>
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
                background:
                  selected?.id === c.id ? COLORS.white : "transparent",
                borderRadius: 8,
                marginBottom: 6,
              }}
            >
              {c.name}
            </div>
          ))}
        </div>

        {/* 강의 입력 */}
        {selected && (
          <div style={{ flex: 1 }}>
            <h2>{selected.name}</h2>

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
              }}
            />

            <button onClick={applyBulk} style={{ marginBottom: 20 }}>
              복붙 내용 적용
            </button>

            {/* 미리보기 */}
            {links.map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "6px 0",
                  borderBottom: `1px solid ${COLORS.line}`,
                }}
              >
                <strong style={{ width: 60 }}>{l.title}</strong>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.url}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
