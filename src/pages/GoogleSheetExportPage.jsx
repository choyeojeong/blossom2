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
  lineSoft: "rgba(31,42,68,0.08)",
  white: "#ffffff",
  blue: "#2f6fed",
  blueSoft: "rgba(47,111,237,0.10)",
  greenSoft: "rgba(26,143,91,0.12)",
  border: "#d9e3f7",
};

function formatDateLabel(isoDate) {
  const d = dayjs(isoDate);
  return d.isValid() ? d.format("M/D") : isoDate || "";
}

function uniqStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const v = String(item || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function buildGroupedCell(date, texts) {
  const dateLabel = formatDateLabel(date);
  const lines = uniqStrings(texts);
  if (!dateLabel && !lines.length) return "";
  if (!lines.length) return dateLabel;
  return `${dateLabel}\n${lines.join("\n")}`;
}

function monthRange(yyyyMm) {
  const start = dayjs(`${yyyyMm}-01`).startOf("month");
  const end = start.endOf("month");
  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
  };
}

function sortByNameKo(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "ko");
}

function toDisplayModeLabel(mode) {
  return mode === "reading" ? "독해" : "일대일";
}

export default function GoogleSheetExportPage() {
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [teacher, setTeacher] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [mode, setMode] = useState("oto"); // oto | reading

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [copiedName, setCopiedName] = useState("");

  useEffect(() => {
    loadTeachers();
  }, []);

  useEffect(() => {
    setRows([]);
    setCopiedName("");
  }, [month, teacher, mode]);

  async function loadTeachers() {
    try {
      setErr("");
      const { data, error } = await supabase
        .from("students")
        .select("teacher_name, withdrawal_date");

      if (error) throw error;

      const uniq = Array.from(
        new Set(
          (data || [])
            .filter((x) => !x?.withdrawal_date)
            .map((x) => String(x.teacher_name || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "ko"));

      setTeachers(uniq);
      if (!teacher && uniq.length) setTeacher(uniq[0]);
    } catch (e) {
      setErr(e?.message || "선생님 목록 불러오기 실패");
    }
  }

  async function load() {
    try {
      setLoading(true);
      setErr("");
      setMsg("");
      setCopiedName("");

      const { start, end } = monthRange(month);

      let studentQuery = supabase
        .from("students")
        .select("id, name, teacher_name, withdrawal_date");

      if (mode === "oto") {
        if (!teacher) {
          setRows([]);
          setErr("일대일은 선생님을 선택해주세요.");
          setLoading(false);
          return;
        }
        studentQuery = studentQuery.eq("teacher_name", teacher);
      }

      const { data: students, error: studentsError } = await studentQuery;
      if (studentsError) throw studentsError;

      const aliveStudents = (students || [])
        .filter((s) => !s.withdrawal_date)
        .sort(sortByNameKo);

      if (!aliveStudents.length) {
        setRows([]);
        setMsg("해당 조건의 학생이 없어요.");
        return;
      }

      const studentIdSet = new Set(aliveStudents.map((s) => s.id));

      if (mode === "oto") {
        await loadOtoRows({ aliveStudents, studentIdSet, start, end });
      } else {
        await loadReadingRows({ aliveStudents, studentIdSet, start, end });
      }
    } catch (e) {
      setRows([]);
      setErr(e?.message || "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  async function loadOtoRows({ aliveStudents, studentIdSet, start, end }) {
    const { data: todos, error } = await supabase
      .from("student_todos")
      .select("id, student_id, todo_date, text, order_index, created_at")
      .gte("todo_date", start)
      .lte("todo_date", end)
      .order("todo_date", { ascending: true })
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const grouped = {};
    for (const row of todos || []) {
      if (!studentIdSet.has(row.student_id)) continue;
      const sid = row.student_id;
      const date = row.todo_date;
      if (!sid || !date) continue;

      if (!grouped[sid]) grouped[sid] = {};
      if (!grouped[sid][date]) grouped[sid][date] = [];
      grouped[sid][date].push(row.text || "");
    }

    const result = aliveStudents.map((student) => {
      const dateMap = grouped[student.id] || {};
      const dates = Object.keys(dateMap).sort((a, b) => a.localeCompare(b));

      const cells = dates
        .slice(0, 5)
        .map((date) => buildGroupedCell(date, dateMap[date]));

      return {
        studentId: student.id,
        name: student.name || "",
        cells,
      };
    });

    setRows(result);
  }

  async function loadReadingRows({ aliveStudents, studentIdSet, start, end }) {
    const { data: events, error } = await supabase
      .from("student_events")
      .select(
        "id, student_id, event_date, memo, kind, event_kind, schedule_kind, start_time"
      )
      .gte("event_date", start)
      .lte("event_date", end)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) throw error;

    const filtered = (events || []).filter((e) => {
      if (!studentIdSet.has(e.student_id)) return false;
      if (e.kind === "reading") return true;
      if (
        e.kind === "extra" &&
        e.event_kind === "makeup" &&
        e.schedule_kind === "reading"
      ) {
        return true;
      }
      return false;
    });

    const grouped = {};
    for (const row of filtered) {
      const sid = row.student_id;
      const date = row.event_date;
      const memo = String(row.memo || "").trim();
      if (!sid || !date) continue;

      if (!grouped[sid]) grouped[sid] = {};
      if (!grouped[sid][date]) grouped[sid][date] = [];

      if (memo) grouped[sid][date].push(memo);
    }

    const result = aliveStudents.map((student) => {
      const dateMap = grouped[student.id] || {};
      const dates = Object.keys(dateMap).sort((a, b) => a.localeCompare(b));

      const cells = dates
        .slice(0, 5)
        .map((date) => buildGroupedCell(date, dateMap[date]));

      return {
        studentId: student.id,
        name: student.name || "",
        cells,
      };
    });

    setRows(result);
  }

  function buildStudentCopyText(row) {
    const line = [
      row.name || "",
      ...Array.from({ length: 5 }, (_, i) => row.cells?.[i] || ""),
    ];
    return line.join("\t");
  }

  async function copyStudent(row) {
    try {
      const text = buildStudentCopyText(row);
      await navigator.clipboard.writeText(text);
      setCopiedName(row.name || "");
      setMsg("");
      setErr("");
      setTimeout(() => setCopiedName(""), 1800);
    } catch (e) {
      setErr(e?.message || "복사 실패");
    }
  }

  const pageTitle = useMemo(() => {
    const monthLabel = dayjs(`${month}-01`).isValid()
      ? dayjs(`${month}-01`).format("YYYY년 M월")
      : month;
    return `${monthLabel} ${toDisplayModeLabel(mode)} 구글시트 복붙용`;
  }, [month, mode]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>구글시트 복붙용</div>
            <div style={styles.desc}>
              같은 날짜의 여러 내용은 한 회차 칸 안에 함께 묶여서 나옵니다.
            </div>
          </div>
        </div>

        <div style={styles.toolbar}>
          <label style={styles.field}>
            <div style={styles.label}>월</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <div style={styles.label}>구분</div>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={styles.input}
            >
              <option value="oto">일대일</option>
              <option value="reading">독해</option>
            </select>
          </label>

          {mode === "oto" ? (
            <label style={styles.field}>
              <div style={styles.label}>선생님</div>
              <select
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                style={styles.input}
              >
                {teachers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div style={styles.field}>
              <div style={styles.label}>대상</div>
              <div style={styles.readOnlyBox}>전체 학생</div>
            </div>
          )}

          <div style={styles.buttonWrap}>
            <button type="button" onClick={load} style={styles.primaryBtn}>
              {loading ? "불러오는 중…" : "불러오기"}
            </button>
          </div>
        </div>

        {(err || msg || copiedName) && (
          <div
            style={{
              ...styles.notice,
              background: err ? "rgba(214,69,93,0.10)" : COLORS.blueSoft,
              borderColor: err ? "rgba(214,69,93,0.22)" : COLORS.border,
            }}
          >
            {err
              ? err
              : copiedName
              ? `${copiedName} 복사 완료!`
              : msg}
          </div>
        )}

        <div style={styles.sectionTitle}>{pageTitle}</div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thName}>이름</th>
                <th style={styles.th}>1회차</th>
                <th style={styles.th}>2회차</th>
                <th style={styles.th}>3회차</th>
                <th style={styles.th}>4회차</th>
                <th style={styles.th}>5회차</th>
                <th style={styles.thAction}>복사</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.studentId}>
                  <td style={styles.tdName}>{row.name}</td>
                  {Array.from({ length: 5 }, (_, idx) => (
                    <td key={idx} style={styles.tdCell}>
                      <div style={styles.cellText}>
                        {row.cells?.[idx] || ""}
                      </div>
                    </td>
                  ))}
                  <td style={styles.tdAction}>
                    <button
                      type="button"
                      onClick={() => copyStudent(row)}
                      style={styles.copyBtn}
                    >
                      복사
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={styles.emptyTd}>
                    불러오기 버튼을 눌러 데이터를 확인하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={styles.help}>
          구글시트에 붙여넣을 때는 각 학생 행의 <b>복사</b> 버튼을 눌러서
          원하는 줄에 붙여넣으면 됩니다.
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
    padding: "24px 16px 40px",
    color: COLORS.text,
  },
  wrap: {
    width: "min(1400px, 100%)",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 1000,
    letterSpacing: "-0.2px",
  },
  desc: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.sub,
  },
  toolbar: {
    display: "flex",
    alignItems: "end",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.72)",
    border: `1px solid ${COLORS.border}`,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  field: {
    display: "grid",
    gap: 6,
    minWidth: 180,
  },
  label: {
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 800,
  },
  input: {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
  },
  readOnlyBox: {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.72)",
    color: COLORS.text,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    fontWeight: 700,
  },
  buttonWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    height: 40,
    padding: "0 16px",
    borderRadius: 999,
    border: "none",
    background: COLORS.blue,
    color: "#fff",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
  },
  notice: {
    marginBottom: 14,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid transparent",
    fontSize: 13,
    fontWeight: 900,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 900,
    marginBottom: 10,
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 18,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.84)",
  },
  table: {
    width: "100%",
    minWidth: 1200,
    borderCollapse: "collapse",
  },
  thName: {
    padding: "12px 10px",
    textAlign: "left",
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 1000,
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    width: 120,
    whiteSpace: "nowrap",
  },
  th: {
    padding: "12px 10px",
    textAlign: "left",
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 1000,
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    width: 200,
    whiteSpace: "nowrap",
  },
  thAction: {
    padding: "12px 10px",
    textAlign: "left",
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 1000,
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    width: 90,
    whiteSpace: "nowrap",
  },
  tdName: {
    padding: "12px 10px",
    verticalAlign: "top",
    borderTop: `1px solid ${COLORS.lineSoft}`,
    fontWeight: 900,
    fontSize: 14,
    background: "rgba(255,255,255,0.4)",
    whiteSpace: "nowrap",
  },
  tdCell: {
    padding: "10px",
    verticalAlign: "top",
    borderTop: `1px solid ${COLORS.lineSoft}`,
  },
  tdAction: {
    padding: "10px",
    verticalAlign: "top",
    borderTop: `1px solid ${COLORS.lineSoft}`,
    whiteSpace: "nowrap",
  },
  cellText: {
    minHeight: 72,
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
    fontSize: 13,
    color: COLORS.text,
  },
  copyBtn: {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
  },
  emptyTd: {
    padding: "18px 12px",
    color: COLORS.sub,
    fontSize: 13,
  },
  help: {
    marginTop: 12,
    fontSize: 12,
    color: COLORS.sub,
  },
};