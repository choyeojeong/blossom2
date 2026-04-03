// src/pages/GoogleSheetExportPage.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { supabase } from "../utils/supabaseClient";

dayjs.locale("ko");

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "rgba(31,42,68,0.14)",
  blue: "#2f6fed",
};

function formatCell(date, text) {
  if (!date) return "";
  const d = dayjs(date);
  const label = `${d.format("M/D")}`;
  return `${label} ${text || ""}`.trim();
}

export default function GoogleSheetExportPage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [teacher, setTeacher] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [mode, setMode] = useState("oto"); // oto | reading

  const [rows, setRows] = useState([]);

  // 선생님 목록
  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    const { data } = await supabase
      .from("students")
      .select("teacher_name");

    const uniq = Array.from(
      new Set((data || []).map((x) => x.teacher_name).filter(Boolean))
    );

    setTeachers(uniq);
    if (uniq.length) setTeacher(uniq[0]);
  }

  async function load() {
    const start = dayjs(month + "-01").format("YYYY-MM-DD");
    const end = dayjs(start).endOf("month").format("YYYY-MM-DD");

    // 학생 목록
    let studentQuery = supabase
      .from("students")
      .select("id, name, teacher_name, withdrawal_date");

    if (mode === "oto") {
      studentQuery = studentQuery.eq("teacher_name", teacher);
    }

    const { data: students } = await studentQuery;

    const aliveStudents = (students || []).filter(
      (s) => !s.withdrawal_date
    );

    if (mode === "oto") {
      // 일대일: todos 기준
      const { data: todos } = await supabase
        .from("student_todos")
        .select("student_id, todo_date, text")
        .gte("todo_date", start)
        .lte("todo_date", end);

      const map = {};

      for (const t of todos || []) {
        if (!map[t.student_id]) map[t.student_id] = [];
        map[t.student_id].push(t);
      }

      const result = aliveStudents.map((s) => {
        const list = (map[s.id] || [])
          .sort((a, b) =>
            dayjs(a.todo_date).isAfter(dayjs(b.todo_date)) ? 1 : -1
          )
          .slice(0, 5);

        const cells = list.map((x) =>
          formatCell(x.todo_date, x.text)
        );

        return {
          name: s.name,
          cells,
        };
      });

      setRows(result);
    } else {
      // 독해: student_events.memo
      const { data: events } = await supabase
        .from("student_events")
        .select(
          "student_id, event_date, memo, kind, event_kind, schedule_kind"
        )
        .gte("event_date", start)
        .lte("event_date", end);

      const filtered = (events || []).filter((e) => {
        if (e.kind === "reading") return true;
        if (
          e.kind === "extra" &&
          e.event_kind === "makeup" &&
          e.schedule_kind === "reading"
        )
          return true;
        return false;
      });

      const map = {};

      for (const e of filtered) {
        if (!map[e.student_id]) map[e.student_id] = [];
        map[e.student_id].push(e);
      }

      const result = aliveStudents.map((s) => {
        const list = (map[s.id] || [])
          .sort((a, b) =>
            dayjs(a.event_date).isAfter(dayjs(b.event_date)) ? 1 : -1
          )
          .slice(0, 5);

        const cells = list.map((x) =>
          formatCell(x.event_date, x.memo)
        );

        return {
          name: s.name,
          cells,
        };
      });

      setRows(result);
    }
  }

  function buildCopyText() {
    const lines = [];

    for (const r of rows) {
      const row = [r.name, ...Array(5).fill("").map((_, i) => r.cells[i] || "")];
      lines.push(row.join("\t"));
    }

    return lines.join("\n");
  }

  async function copy() {
    const text = buildCopyText();
    await navigator.clipboard.writeText(text);
    alert("복사 완료!");
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.title}>구글시트 복붙용</div>

        <div style={styles.controls}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />

          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="oto">일대일</option>
            <option value="reading">독해</option>
          </select>

          {mode === "oto" && (
            <select
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            >
              {teachers.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}

          <button onClick={load}>불러오기</button>
          <button onClick={copy}>복사</button>
        </div>

        <div style={styles.table}>
          {rows.map((r, i) => (
            <div key={i} style={styles.row}>
              <div style={styles.name}>{r.name}</div>
              {[0, 1, 2, 3, 4].map((idx) => (
                <div key={idx} style={styles.cell}>
                  {r.cells[idx] || ""}
                </div>
              ))}
            </div>
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
    padding: 20,
  },
  wrap: {
    maxWidth: 900,
    margin: "0 auto",
  },
  title: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 12,
  },
  controls: {
    display: "flex",
    gap: 8,
    marginBottom: 16,
  },
  table: {
    display: "grid",
    gap: 6,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "120px repeat(5, 1fr)",
    gap: 6,
  },
  name: {
    fontWeight: 900,
  },
  cell: {
    border: "1px solid rgba(0,0,0,0.1)",
    padding: 6,
    fontSize: 12,
  },
};