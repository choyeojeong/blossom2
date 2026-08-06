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
  blue: "#2f6fed",
  blueSoft: "rgba(47,111,237,0.10)",
  red: "#b42318",
  redSoft: "rgba(180,35,24,0.10)",
  green: "#137333",
  greenSoft: "rgba(19,115,51,0.10)",
};

function parseWordTest(text) {
  const parts = String(text || "")
    .split(",")
    .map((part) => part.trim());

  if (parts.length !== 5) return null;

  const questionMatch = parts[2].match(/^(\d+)\s*문제$/);
  const cutoffMatch = parts[3].match(/^-?(\d+)\s*컷$/);
  const allowedKinds = new Set(["뜻", "스펠링", "파포"]);
  const kinds = parts[4]
    .split("/")
    .map((kind) => kind.trim())
    .filter(Boolean);

  if (!parts[0] || !parts[1] || !questionMatch || !cutoffMatch || !kinds.length) return null;
  if (kinds.some((kind) => !allowedKinds.has(kind))) return null;

  return {
    book: parts[0],
    range: parts[1],
    questionCount: Number(questionMatch[1]),
    cutoff: -Math.abs(Number(cutoffMatch[1])),
    kinds: kinds.join("/"),
  };
}

function normalizeWrongCount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(number) ? Math.abs(number) : null;
}

export default function WordTestPage() {
  const [dateStr, setDateStr] = useState(dayjs().format("YYYY-MM-DD"));
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    loadWordTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  async function loadWordTests() {
    setLoading(true);
    setErr("");

    try {
      const { data: todoRows, error: todoError } = await supabase
        .from("student_todos")
        .select("id, student_id, todo_date, text, order_index, created_at")
        .eq("todo_date", dateStr)
        .order("created_at", { ascending: true });

      if (todoError) throw todoError;

      const parsedTodos = (todoRows || [])
        .map((todo) => ({ ...todo, wordTest: parseWordTest(todo.text) }))
        .filter((todo) => todo.wordTest);

      if (!parsedTodos.length) {
        setRows([]);
        setDrafts({});
        return;
      }

      const studentIds = Array.from(new Set(parsedTodos.map((todo) => todo.student_id).filter(Boolean)));
      const todoIds = parsedTodos.map((todo) => todo.id);

      const [{ data: students, error: studentError }, { data: results, error: resultError }] = await Promise.all([
        supabase.from("students").select("id, name, school, grade, teacher_name").in("id", studentIds),
        supabase.from("word_test_results").select("todo_id, result_status, wrong_count, updated_at").in("todo_id", todoIds),
      ]);

      if (studentError) throw studentError;
      if (resultError) throw resultError;

      const studentMap = new Map((students || []).map((student) => [student.id, student]));
      const resultMap = new Map((results || []).map((result) => [result.todo_id, result]));

      const nextRows = parsedTodos
        .map((todo) => ({
          ...todo,
          student: studentMap.get(todo.student_id) || null,
          result: resultMap.get(todo.id) || null,
        }))
        .sort((a, b) => {
          const teacherCompare = String(a.student?.teacher_name || "").localeCompare(String(b.student?.teacher_name || ""), "ko");
          if (teacherCompare !== 0) return teacherCompare;
          return String(a.student?.name || "").localeCompare(String(b.student?.name || ""), "ko");
        });

      const nextDrafts = {};
      nextRows.forEach((row) => {
        nextDrafts[row.id] = {
          status: row.result?.result_status || "",
          wrongCount: row.result?.wrong_count ?? "",
        };
      });

      setRows(nextRows);
      setDrafts(nextDrafts);
    } catch (e) {
      setRows([]);
      setDrafts({});
      setErr(e?.message || "단어시험 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function setDraft(todoId, patch) {
    setDrafts((prev) => ({
      ...prev,
      [todoId]: { ...(prev[todoId] || { status: "", wrongCount: "" }), ...patch },
    }));
  }

  async function saveResult(row) {
    const draft = drafts[row.id] || {};
    if (!draft.status) {
      alert("통과 또는 불통과를 선택해주세요.");
      return;
    }

    const wrongCount = normalizeWrongCount(draft.wrongCount);
    if (wrongCount === null) {
      alert("틀린 개수를 입력해주세요. 예: -2 또는 2");
      return;
    }

    setBusyId(row.id);
    setErr("");

    try {
      const payload = {
        todo_id: row.id,
        student_id: row.student_id,
        test_date: row.todo_date,
        result_status: draft.status,
        wrong_count: wrongCount,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("word_test_results")
        .upsert(payload, { onConflict: "todo_id" })
        .select("todo_id, result_status, wrong_count, updated_at")
        .single();

      if (error) throw error;

      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, result: data } : item)));
      setDraft(row.id, { status: data.result_status, wrongCount: data.wrong_count });
    } catch (e) {
      setErr(e?.message || "채점 결과 저장에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  const dateLabel = useMemo(() => dayjs(dateStr).format("YYYY년 M월 D일 (ddd)"), [dateStr]);

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>단어시험 채점</div>
            <div style={styles.desc}>선택한 날짜에 단어시험이 등록된 학생을 확인하고 채점 결과를 저장합니다.</div>
          </div>
          <button type="button" onClick={loadWordTests} style={styles.refreshButton}>
            새로고침
          </button>
        </div>

        <div style={styles.dateBar}>
          <div>
            <div style={styles.dateTitle}>{dateLabel}</div>
            <div style={styles.dateSub}>총 {rows.length}명의 단어시험이 등록되어 있습니다.</div>
          </div>
          <div style={styles.dateControls}>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={styles.dateInput} />
            <button type="button" onClick={() => setDateStr(dayjs().format("YYYY-MM-DD"))} style={styles.todayButton}>
              오늘
            </button>
          </div>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.tableCard}>
          <div style={styles.scrollArea}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["학생이름", "학교/학년", "담당선생님", "단어책", "범위", "시험개수", "커트라인", "뜻/스펠링/파포", "통과/불통과"].map((label) => (
                    <th key={label} style={styles.th}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={styles.emptyCell}>불러오는 중…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan="9" style={styles.emptyCell}>이 날짜에 등록된 단어시험이 없습니다.</td></tr>
                ) : (
                  rows.map((row) => {
                    const draft = drafts[row.id] || { status: "", wrongCount: "" };
                    const isBusy = busyId === row.id;
                    return (
                      <tr key={row.id}>
                        <td style={styles.tdStrong}>{row.student?.name || "-"}</td>
                        <td style={styles.td}>{row.student ? `${row.student.school || "-"} / ${row.student.grade || "-"}` : "-"}</td>
                        <td style={styles.td}>{row.student?.teacher_name || "-"}</td>
                        <td style={styles.td}>{row.wordTest.book}</td>
                        <td style={styles.td}>{row.wordTest.range}</td>
                        <td style={styles.tdCenter}>{row.wordTest.questionCount}문제</td>
                        <td style={styles.tdCenter}>{row.wordTest.cutoff}컷</td>
                        <td style={styles.tdCenter}>{row.wordTest.kinds}</td>
                        <td style={styles.resultTd}>
                          <div style={styles.statusRow}>
                            <label style={draft.status === "pass" ? styles.passChoiceActive : styles.choice}>
                              <input
                                type="radio"
                                name={`status-${row.id}`}
                                checked={draft.status === "pass"}
                                onChange={() => setDraft(row.id, { status: "pass" })}
                              />
                              통과
                            </label>
                            <label style={draft.status === "fail" ? styles.failChoiceActive : styles.choice}>
                              <input
                                type="radio"
                                name={`status-${row.id}`}
                                checked={draft.status === "fail"}
                                onChange={() => setDraft(row.id, { status: "fail" })}
                              />
                              불통과
                            </label>
                          </div>
                          <div style={styles.saveRow}>
                            <div style={styles.minusInputWrap}>
                              <span style={styles.minus}>-</span>
                              <input
                                inputMode="numeric"
                                value={draft.wrongCount}
                                onChange={(e) => setDraft(row.id, { wrongCount: e.target.value.replace(/[^0-9]/g, "") })}
                                placeholder="2"
                                style={styles.wrongInput}
                              />
                            </div>
                            <button type="button" disabled={isBusy} onClick={() => saveResult(row)} style={styles.saveButton(isBusy)}>
                              저장
                            </button>
                          </div>
                          {row.result ? <div style={styles.savedText}>저장됨: {row.result.result_status === "pass" ? "통과" : "불통과"} -{row.result.wrong_count}</div> : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: `linear-gradient(180deg, ${COLORS.bgTop}, ${COLORS.bgBottom})`, color: COLORS.text, padding: "calc(env(safe-area-inset-top, 0px) + 58px) 16px 24px", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR"' },
  wrap: { width: "min(1700px, 100%)", margin: "0 auto" },
  header: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: 1000 },
  desc: { marginTop: 6, color: COLORS.sub, fontSize: 13 },
  refreshButton: { height: 38, padding: "0 14px", borderRadius: 999, border: `1px solid ${COLORS.line}`, background: "#fff", fontWeight: 900, cursor: "pointer" },
  dateBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "12px 14px", borderRadius: 16, border: `1px solid ${COLORS.lineSoft}`, background: "rgba(255,255,255,0.70)" },
  dateTitle: { fontSize: 16, fontWeight: 1000 },
  dateSub: { marginTop: 4, fontSize: 12, color: COLORS.sub },
  dateControls: { display: "flex", alignItems: "center", gap: 8 },
  dateInput: { height: 40, padding: "0 10px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", fontWeight: 900 },
  todayButton: { height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "transparent", fontWeight: 900, cursor: "pointer" },
  error: { marginTop: 10, color: COLORS.red, fontWeight: 800 },
  tableCard: { marginTop: 14, borderRadius: 16, border: `1px solid ${COLORS.lineSoft}`, background: "rgba(255,255,255,0.82)", overflow: "hidden" },
  scrollArea: { overflowX: "auto" },
  table: { width: "100%", minWidth: 1380, borderCollapse: "collapse", tableLayout: "fixed" },
  th: { padding: "12px 10px", background: "rgba(47,111,237,0.08)", borderBottom: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 12, fontWeight: 1000, textAlign: "center", whiteSpace: "nowrap" },
  td: { padding: "12px 10px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 13, textAlign: "left", wordBreak: "break-word" },
  tdStrong: { padding: "12px 10px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 14, fontWeight: 1000, textAlign: "center" },
  tdCenter: { padding: "12px 10px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 13, textAlign: "center", fontWeight: 800 },
  resultTd: { padding: 10, width: 280, borderBottom: `1px solid ${COLORS.lineSoft}` },
  emptyCell: { padding: 36, textAlign: "center", color: COLORS.sub, fontWeight: 800 },
  statusRow: { display: "flex", gap: 7, alignItems: "center" },
  choice: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 9, border: `1px solid ${COLORS.line}`, background: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  passChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 9, border: `1px solid rgba(19,115,51,0.35)`, background: COLORS.greenSoft, color: COLORS.green, fontSize: 12, fontWeight: 1000, cursor: "pointer" },
  failChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 9, border: `1px solid rgba(180,35,24,0.35)`, background: COLORS.redSoft, color: COLORS.red, fontSize: 12, fontWeight: 1000, cursor: "pointer" },
  saveRow: { display: "flex", gap: 7, marginTop: 7 },
  minusInputWrap: { flex: 1, height: 34, display: "flex", alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 9, background: "#fff", overflow: "hidden" },
  minus: { paddingLeft: 10, fontWeight: 1000 },
  wrongInput: { width: "100%", height: "100%", border: 0, outline: 0, padding: "0 8px 0 3px", fontWeight: 900, fontSize: 13 },
  saveButton: (disabled) => ({ height: 34, padding: "0 13px", borderRadius: 9, border: `1px solid ${COLORS.line}`, background: COLORS.blueSoft, color: COLORS.text, fontWeight: 1000, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }),
  savedText: { marginTop: 6, fontSize: 11, color: COLORS.sub, fontWeight: 800, textAlign: "right" },
};
