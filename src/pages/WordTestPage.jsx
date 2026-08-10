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
  orange: "#b45309",
  orangeSoft: "rgba(245,158,11,0.14)",
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

  const rangeMatch = parts[1].match(/^(.*?)\s*\(수정:\s*(.*?)\)\s*$/);
  const originalRange = String(rangeMatch?.[1] || parts[1]).trim();
  const currentRange = String(rangeMatch?.[2] || parts[1]).trim();

  if (!originalRange || !currentRange) return null;

  return {
    book: parts[0],
    range: currentRange,
    originalRange,
    currentRange,
    isRangeModified: originalRange !== currentRange,
    questionCount: Number(questionMatch[1]),
    cutoff: -Math.abs(Number(cutoffMatch[1])),
    kinds: kinds.join("/"),
  };
}

function buildWordTestText(wordTest, nextRange) {
  const originalRange = String(wordTest?.originalRange || wordTest?.range || "").trim();
  const currentRange = String(nextRange || originalRange).trim();
  const rangeText =
    currentRange && originalRange && currentRange !== originalRange
      ? `${originalRange} (수정: ${currentRange})`
      : originalRange;

  return `${wordTest.book}, ${rangeText}, ${wordTest.questionCount}문제, ${wordTest.cutoff}컷, ${wordTest.kinds}`;
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
  const [editingRangeId, setEditingRangeId] = useState("");
  const [rangeDraft, setRangeDraft] = useState("");

  const [studentQuery, setStudentQuery] = useState("");
  const [historyStart, setHistoryStart] = useState(dayjs().subtract(1, "month").format("YYYY-MM-DD"));
  const [historyEnd, setHistoryEnd] = useState(dayjs().format("YYYY-MM-DD"));
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearched, setHistorySearched] = useState(false);
  const [historyErr, setHistoryErr] = useState("");

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
        supabase.from("word_test_results").select("todo_id, result_status, wrong_count, postponed_date, rescheduled_todo_id, updated_at").in("todo_id", todoIds),
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
          postponedDate: row.result?.postponed_date || "",
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

  async function searchStudentHistory() {
    const query = studentQuery.trim();
    if (!query) {
      alert("학생 이름을 입력해주세요.");
      return;
    }
    if (!historyStart || !historyEnd) {
      alert("조회 시작일과 종료일을 모두 선택해주세요.");
      return;
    }
    if (dayjs(historyStart).isAfter(dayjs(historyEnd))) {
      alert("시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    setHistoryLoading(true);
    setHistoryErr("");
    setHistorySearched(true);

    try {
      const { data: students, error: studentError } = await supabase
        .from("students")
        .select("id, name, school, grade, teacher_name")
        .ilike("name", `%${query}%`)
        .order("name", { ascending: true });

      if (studentError) throw studentError;

      const studentIds = (students || []).map((student) => student.id);
      if (!studentIds.length) {
        setHistoryRows([]);
        return;
      }

      const { data: todoRows, error: todoError } = await supabase
        .from("student_todos")
        .select("id, student_id, todo_date, text, order_index, created_at")
        .in("student_id", studentIds)
        .gte("todo_date", historyStart)
        .lte("todo_date", historyEnd)
        .order("todo_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (todoError) throw todoError;

      const parsedTodos = (todoRows || [])
        .map((todo) => ({ ...todo, wordTest: parseWordTest(todo.text) }))
        .filter((todo) => todo.wordTest);

      if (!parsedTodos.length) {
        setHistoryRows([]);
        return;
      }

      const todoIds = parsedTodos.map((todo) => todo.id);
      const { data: results, error: resultError } = await supabase
        .from("word_test_results")
        .select("todo_id, result_status, wrong_count, postponed_date, rescheduled_todo_id, updated_at")
        .in("todo_id", todoIds);

      if (resultError) throw resultError;

      const studentMap = new Map((students || []).map((student) => [student.id, student]));
      const resultMap = new Map((results || []).map((result) => [result.todo_id, result]));

      const nextHistoryRows = parsedTodos.map((todo) => ({
        ...todo,
        student: studentMap.get(todo.student_id) || null,
        result: resultMap.get(todo.id) || null,
      }));

      setHistoryRows(nextHistoryRows);
      setDrafts((prev) => {
        const next = { ...prev };
        nextHistoryRows.forEach((row) => {
          next[row.id] = {
            status: row.result?.result_status || "",
            wrongCount: row.result?.wrong_count ?? "",
            postponedDate: row.result?.postponed_date || "",
          };
        });
        return next;
      });
    } catch (e) {
      setHistoryRows([]);
      setHistoryErr(e?.message || "학생 단어시험 기록을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function setDraft(todoId, patch) {
    setDrafts((prev) => ({
      ...prev,
      [todoId]: { ...(prev[todoId] || { status: "", wrongCount: "", postponedDate: "" }), ...patch },
    }));
  }

  function startRangeEdit(row) {
    setEditingRangeId(row.id);
    setRangeDraft(row.wordTest.currentRange || row.wordTest.range || "");
  }

  function cancelRangeEdit() {
    setEditingRangeId("");
    setRangeDraft("");
  }

  async function saveRangeEdit(row) {
    const nextRange = String(rangeDraft || "").trim();
    if (!nextRange) {
      alert("수정할 범위를 입력해주세요.");
      return;
    }

    const currentRange = String(row.wordTest.currentRange || row.wordTest.range || "").trim();
    if (nextRange === currentRange) {
      cancelRangeEdit();
      return;
    }

    setBusyId(row.id);
    setErr("");

    try {
      const nextText = buildWordTestText(row.wordTest, nextRange);

      const { data: updatedTodo, error: updateError } = await supabase
        .from("student_todos")
        .update({ text: nextText })
        .eq("id", row.id)
        .select("id, student_id, todo_date, text, order_index, created_at")
        .single();

      if (updateError) throw updateError;

      const nextWordTest = parseWordTest(updatedTodo.text);
      if (!nextWordTest) throw new Error("수정된 단어시험 범위를 읽지 못했습니다.");

      const rescheduledTodoId = row.result?.rescheduled_todo_id || null;
      if (rescheduledTodoId) {
        const { error: postponedUpdateError } = await supabase
          .from("student_todos")
          .update({ text: nextText })
          .eq("id", rescheduledTodoId);

        if (postponedUpdateError) throw postponedUpdateError;
      }

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, ...updatedTodo, wordTest: nextWordTest }
            : item
        )
      );

      setHistoryRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, ...updatedTodo, wordTest: nextWordTest }
            : item
        )
      );

      cancelRangeEdit();
    } catch (e) {
      setErr(e?.message || "단어시험 범위를 수정하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function saveResult(row) {
    const draft = drafts[row.id] || {};
    if (!draft.status) {
      alert("통과, 불통과, 미응시 중 하나를 선택해주세요.");
      return;
    }

    const isAbsent = draft.status === "absent";
    let wrongCount = null;
    let postponedDate = null;

    if (isAbsent) {
      postponedDate = String(draft.postponedDate || "").trim();
      if (!postponedDate) {
        alert("미응시한 단어시험을 다시 볼 날짜를 선택해주세요.");
        return;
      }
      if (!dayjs(postponedDate).isAfter(dayjs(row.todo_date), "day")) {
        alert("연기 날짜는 원래 시험일보다 늦은 날짜로 선택해주세요.");
        return;
      }
    } else {
      wrongCount = normalizeWrongCount(draft.wrongCount);
      if (wrongCount === null) {
        alert("틀린 개수를 입력해주세요. 예: -2 또는 2");
        return;
      }
    }

    setBusyId(row.id);
    setErr("");

    try {
      let rescheduledTodoId = row.result?.rescheduled_todo_id || null;

      if (isAbsent) {
        const todoPayload = {
          student_id: row.student_id,
          todo_date: postponedDate,
          text: row.text,
        };

        if (rescheduledTodoId) {
          const { data: updatedTodo, error: updateTodoError } = await supabase
            .from("student_todos")
            .update(todoPayload)
            .eq("id", rescheduledTodoId)
            .select("id")
            .maybeSingle();

          if (updateTodoError) throw updateTodoError;
          if (!updatedTodo) rescheduledTodoId = null;
        }

        if (!rescheduledTodoId) {
          const { data: targetTodos, error: targetTodoError } = await supabase
            .from("student_todos")
            .select("order_index")
            .eq("student_id", row.student_id)
            .eq("todo_date", postponedDate)
            .order("order_index", { ascending: false })
            .limit(1);

          if (targetTodoError) throw targetTodoError;
          const nextIndex = targetTodos?.length ? (targetTodos[0].order_index ?? 0) + 1 : 0;

          const { data: insertedTodo, error: insertTodoError } = await supabase
            .from("student_todos")
            .insert({ ...todoPayload, order_index: nextIndex })
            .select("id")
            .single();

          if (insertTodoError) throw insertTodoError;
          rescheduledTodoId = String(insertedTodo.id);
        }
      } else if (rescheduledTodoId) {
        const { error: deleteTodoError } = await supabase.from("student_todos").delete().eq("id", rescheduledTodoId);
        if (deleteTodoError) throw deleteTodoError;
        rescheduledTodoId = null;
      }

      const payload = {
        todo_id: row.id,
        student_id: row.student_id,
        test_date: row.todo_date,
        result_status: draft.status,
        wrong_count: isAbsent ? null : wrongCount,
        postponed_date: isAbsent ? postponedDate : null,
        rescheduled_todo_id: isAbsent ? rescheduledTodoId : null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("word_test_results")
        .upsert(payload, { onConflict: "todo_id" })
        .select("todo_id, result_status, wrong_count, postponed_date, rescheduled_todo_id, updated_at")
        .single();

      if (error) throw error;

      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, result: data } : item)));
      setHistoryRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, result: data } : item)));
      setDraft(row.id, {
        status: data.result_status,
        wrongCount: data.wrong_count ?? "",
        postponedDate: data.postponed_date || "",
      });
    } catch (e) {
      setErr(e?.message || "채점 결과 저장에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function undoResult(row) {
    if (!row?.result) return;

    const confirmed = window.confirm(
      row.result.result_status === "absent"
        ? "저장된 미응시 결과와 연기된 단어시험을 모두 되돌릴까요?"
        : "저장된 채점 결과를 되돌릴까요?"
    );
    if (!confirmed) return;

    setBusyId(row.id);
    setErr("");

    try {
      const rescheduledTodoId = row.result?.rescheduled_todo_id || null;

      if (rescheduledTodoId) {
        const { error: deleteTodoError } = await supabase
          .from("student_todos")
          .delete()
          .eq("id", rescheduledTodoId);

        if (deleteTodoError) throw deleteTodoError;
      }

      const { error: deleteResultError } = await supabase
        .from("word_test_results")
        .delete()
        .eq("todo_id", row.id);

      if (deleteResultError) throw deleteResultError;

      setRows((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, result: null } : item))
      );

      setHistoryRows((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, result: null } : item))
      );

      setDraft(row.id, {
        status: "",
        wrongCount: "",
        postponedDate: "",
      });
    } catch (e) {
      setErr(e?.message || "저장된 결과를 되돌리지 못했습니다.");
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

        <div style={styles.searchCard}>
          <div style={styles.searchTitle}>학생별 단어시험 기록 조회</div>
          <div style={styles.searchControls}>
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchStudentHistory();
              }}
              placeholder="학생 이름 검색"
              style={styles.nameInput}
            />
            <div style={styles.periodGroup}>
              <input type="date" value={historyStart} onChange={(e) => setHistoryStart(e.target.value)} style={styles.periodInput} />
              <span style={styles.periodDash}>~</span>
              <input type="date" value={historyEnd} onChange={(e) => setHistoryEnd(e.target.value)} style={styles.periodInput} />
            </div>
            <button type="button" onClick={searchStudentHistory} disabled={historyLoading} style={styles.searchButton(historyLoading)}>
              {historyLoading ? "조회 중…" : "기록 조회"}
            </button>
          </div>

          {historyErr ? <div style={styles.error}>{historyErr}</div> : null}

          {historySearched ? (
            <div style={styles.historyBox}>
              <div style={styles.historySummary}>
                검색 결과 <strong>{historyRows.length}</strong>건
              </div>
              <table style={styles.historyTable}>
                <colgroup>
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {['시험일', '학생이름', '학교/학년', '단어책', '범위', '문제수', '커트라인', '시험종류', '결과'].map((label) => (
                      <th key={label} style={styles.historyTh}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <tr><td colSpan="9" style={styles.emptyCell}>불러오는 중…</td></tr>
                  ) : historyRows.length === 0 ? (
                    <tr><td colSpan="9" style={styles.emptyCell}>설정한 기간에 해당 학생의 단어시험 기록이 없습니다.</td></tr>
                  ) : (
                    historyRows.map((row) => (
                      <tr key={`history-${row.id}`}>
                        <td style={styles.historyTdCenter}>{dayjs(row.todo_date).format("YYYY.MM.DD")}</td>
                        <td style={styles.historyTdStrong}>{row.student?.name || "-"}</td>
                        <td style={styles.historyTd}>{row.student ? `${row.student.school || "-"} / ${row.student.grade || "-"}` : "-"}</td>
                        <td style={styles.historyTd}>{row.wordTest.book}</td>
                        <td style={styles.historyTdCenter}>
                          {row.wordTest.isRangeModified ? (
                            <div style={styles.rangeHistoryWrap}>
                              <span style={styles.originalRangeText}>기존 {row.wordTest.originalRange}</span>
                              <span style={styles.changedRangeText}>수정 {row.wordTest.currentRange}</span>
                            </div>
                          ) : (
                            row.wordTest.currentRange
                          )}
                        </td>
                        <td style={styles.historyTdCenter}>{row.wordTest.questionCount}</td>
                        <td style={styles.historyTdCenter}>{row.wordTest.cutoff}컷</td>
                        <td style={styles.historyTdCenter}>{row.wordTest.kinds}</td>
                        <td style={styles.historyResultTd}>
                          {(() => {
                            const draft = drafts[row.id] || {
                              status: row.result?.result_status || "",
                              wrongCount: row.result?.wrong_count ?? "",
                              postponedDate: row.result?.postponed_date || "",
                            };
                            const isBusy = busyId === row.id;

                            return (
                              <>
                                <div style={styles.historyStatusRow}>
                                  <label style={draft.status === "pass" ? styles.historyPassChoiceActive : styles.historyChoice}>
                                    <input
                                      type="radio"
                                      name={`history-status-${row.id}`}
                                      checked={draft.status === "pass"}
                                      onChange={() => setDraft(row.id, { status: "pass" })}
                                    />
                                    통과
                                  </label>
                                  <label style={draft.status === "fail" ? styles.historyFailChoiceActive : styles.historyChoice}>
                                    <input
                                      type="radio"
                                      name={`history-status-${row.id}`}
                                      checked={draft.status === "fail"}
                                      onChange={() => setDraft(row.id, { status: "fail" })}
                                    />
                                    불통과
                                  </label>
                                  <label style={draft.status === "absent" ? styles.historyAbsentChoiceActive : styles.historyChoice}>
                                    <input
                                      type="radio"
                                      name={`history-status-${row.id}`}
                                      checked={draft.status === "absent"}
                                      onChange={() => setDraft(row.id, { status: "absent", wrongCount: "" })}
                                    />
                                    미응시
                                  </label>
                                </div>
                                <div style={styles.historySaveRow}>
                                  {draft.status === "absent" ? (
                                    <input
                                      type="date"
                                      min={dayjs(row.todo_date).add(1, "day").format("YYYY-MM-DD")}
                                      value={draft.postponedDate || ""}
                                      onChange={(e) => setDraft(row.id, { postponedDate: e.target.value })}
                                      style={styles.historyPostponedDateInput}
                                      aria-label="연기 날짜"
                                    />
                                  ) : (
                                    <div style={styles.historyMinusInputWrap}>
                                      <span style={styles.minus}>-</span>
                                      <input
                                        inputMode="numeric"
                                        value={draft.wrongCount}
                                        onChange={(e) => setDraft(row.id, { wrongCount: e.target.value.replace(/[^0-9]/g, "") })}
                                        placeholder="2"
                                        style={styles.historyWrongInput}
                                      />
                                    </div>
                                  )}
                                  <button type="button" disabled={isBusy} onClick={() => saveResult(row)} style={styles.historySaveButton(isBusy)}>
                                    저장
                                  </button>
                                </div>
                                {row.result ? (
                                  <div style={styles.historySavedLine}>
                                    <span style={styles.savedText}>
                                      저장됨: {row.result.result_status === "pass"
                                        ? `통과 -${row.result.wrong_count}`
                                        : row.result.result_status === "absent"
                                          ? `미응시 · ${dayjs(row.result.postponed_date).format("YYYY.MM.DD")}로 연기`
                                          : `불통과 -${row.result.wrong_count}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => undoResult(row)}
                                      disabled={isBusy}
                                      style={styles.undoButton(isBusy)}
                                    >
                                      되돌리기
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
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
          <div style={styles.tableArea}>
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["학생이름", "학교/학년", "담당선생님", "단어책", "범위", "시험개수", "커트라인", "뜻/스펠링/파포", "통과/불통과/미응시"].map((label) => (
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
                    const draft = drafts[row.id] || { status: "", wrongCount: "", postponedDate: "" };
                    const isBusy = busyId === row.id;
                    return (
                      <tr key={row.id}>
                        <td style={styles.tdStrong}>{row.student?.name || "-"}</td>
                        <td style={styles.td}>{row.student ? `${row.student.school || "-"} / ${row.student.grade || "-"}` : "-"}</td>
                        <td style={styles.td}>{row.student?.teacher_name || "-"}</td>
                        <td style={styles.td}>{row.wordTest.book}</td>
                        <td style={styles.rangeTd}>
                          {editingRangeId === row.id ? (
                            <div style={styles.rangeEditBox}>
                              <input
                                value={rangeDraft}
                                onChange={(e) => setRangeDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveRangeEdit(row);
                                  if (e.key === "Escape") cancelRangeEdit();
                                }}
                                placeholder="수정 범위"
                                style={styles.rangeInput}
                                autoFocus
                              />
                              <div style={styles.rangeEditActions}>
                                <button
                                  type="button"
                                  onClick={() => saveRangeEdit(row)}
                                  disabled={isBusy}
                                  style={styles.rangeSaveButton(isBusy)}
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelRangeEdit}
                                  disabled={isBusy}
                                  style={styles.rangeCancelButton(isBusy)}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={styles.rangeDisplay}>
                              {row.wordTest.isRangeModified ? (
                                <>
                                  <span style={styles.originalRangeText}>기존 {row.wordTest.originalRange}</span>
                                  <span style={styles.changedRangeText}>수정 {row.wordTest.currentRange}</span>
                                </>
                              ) : (
                                <span style={styles.currentRangeText}>{row.wordTest.currentRange}</span>
                              )}
                              <button
                                type="button"
                                onClick={() => startRangeEdit(row)}
                                disabled={isBusy}
                                style={styles.rangeEditButton(isBusy)}
                              >
                                수정
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={styles.tdCenter}>{row.wordTest.questionCount}문제</td>
                        <td style={styles.tdCenter}>{row.wordTest.cutoff}컷</td>
                        <td style={styles.tdCenter}>{row.wordTest.kinds}</td>
                        <td style={styles.resultTd}>
                          <div style={styles.compactResultRow}>
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
                              <label style={draft.status === "absent" ? styles.absentChoiceActive : styles.choice}>
                                <input
                                  type="radio"
                                  name={`status-${row.id}`}
                                  checked={draft.status === "absent"}
                                  onChange={() => setDraft(row.id, { status: "absent", wrongCount: "" })}
                                />
                                미응시
                              </label>
                            </div>
                            <div style={styles.saveRow}>
                              {draft.status === "absent" ? (
                                <input
                                  type="date"
                                  min={dayjs(row.todo_date).add(1, "day").format("YYYY-MM-DD")}
                                  value={draft.postponedDate || ""}
                                  onChange={(e) => setDraft(row.id, { postponedDate: e.target.value })}
                                  style={styles.postponedDateInput}
                                  aria-label="연기 날짜"
                                />
                              ) : (
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
                              )}
                              <button type="button" disabled={isBusy} onClick={() => saveResult(row)} style={styles.saveButton(isBusy)}>
                                저장
                              </button>
                            </div>
                          </div>
                          {row.result ? (
                            <div style={styles.savedLine}>
                              <span style={styles.savedText}>
                                저장됨: {row.result.result_status === "pass"
                                  ? `통과 -${row.result.wrong_count}`
                                  : row.result.result_status === "absent"
                                    ? `미응시 · ${dayjs(row.result.postponed_date).format("YYYY.MM.DD")}로 연기`
                                    : `불통과 -${row.result.wrong_count}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => undoResult(row)}
                                disabled={isBusy}
                                style={styles.undoButton(isBusy)}
                              >
                                되돌리기
                              </button>
                            </div>
                          ) : null}
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
  page: { minHeight: "100vh", background: `linear-gradient(180deg, ${COLORS.bgTop}, ${COLORS.bgBottom})`, color: COLORS.text, padding: "calc(env(safe-area-inset-top, 0px) + 58px) 12px 24px", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR"' },
  wrap: { width: "min(1700px, 100%)", margin: "0 auto" },
  header: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: 1000 },
  desc: { marginTop: 6, color: COLORS.sub, fontSize: 13 },
  refreshButton: { height: 36, padding: "0 13px", borderRadius: 999, border: `1px solid ${COLORS.line}`, background: "#fff", fontWeight: 900, cursor: "pointer" },
  searchCard: { marginBottom: 12, padding: "12px 14px", borderRadius: 16, border: `1px solid ${COLORS.lineSoft}`, background: "rgba(255,255,255,0.78)" },
  searchTitle: { marginBottom: 9, fontSize: 14, fontWeight: 1000 },
  searchControls: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  nameInput: { flex: "1 1 220px", minWidth: 180, height: 38, padding: "0 11px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", outline: 0, fontWeight: 800 },
  periodGroup: { display: "flex", alignItems: "center", gap: 6, flex: "0 1 auto" },
  periodInput: { height: 38, padding: "0 8px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", fontWeight: 800 },
  periodDash: { color: COLORS.sub, fontWeight: 900 },
  searchButton: (disabled) => ({ height: 38, padding: "0 15px", borderRadius: 10, border: 0, background: COLORS.blue, color: "#fff", fontWeight: 1000, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }),
  historyBox: { marginTop: 12, borderRadius: 12, border: `1px solid ${COLORS.lineSoft}`, overflow: "hidden", background: "#fff" },
  historySummary: { padding: "9px 10px", fontSize: 12, color: COLORS.sub, borderBottom: `1px solid ${COLORS.lineSoft}` },
  historyTable: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  historyTh: { padding: "8px 5px", background: "rgba(31,42,68,0.045)", borderBottom: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 10.5, fontWeight: 1000, textAlign: "center", lineHeight: 1.25, wordBreak: "keep-all" },
  historyTd: { padding: "7px 5px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 11, textAlign: "left", lineHeight: 1.35, wordBreak: "break-word" },
  historyTdStrong: { padding: "7px 5px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 11.5, fontWeight: 1000, textAlign: "center", wordBreak: "break-word" },
  historyTdCenter: { padding: "7px 4px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 11, fontWeight: 800, textAlign: "center", wordBreak: "break-word" },
  passBadge: { display: "inline-block", padding: "3px 6px", borderRadius: 999, background: COLORS.greenSoft, color: COLORS.green, fontSize: 10.5, fontWeight: 1000 },
  failBadge: { display: "inline-block", padding: "3px 6px", borderRadius: 999, background: COLORS.redSoft, color: COLORS.red, fontSize: 10.5, fontWeight: 1000 },
  absentBadge: { display: "inline-block", padding: "3px 6px", borderRadius: 999, background: COLORS.orangeSoft, color: COLORS.orange, fontSize: 10.5, fontWeight: 1000 },
  pendingBadge: { display: "inline-block", padding: "3px 6px", borderRadius: 999, background: "rgba(93,107,130,0.10)", color: COLORS.sub, fontSize: 10.5, fontWeight: 900 },
  historyResultTd: { padding: "6px 5px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, verticalAlign: "middle" },
  historyStatusRow: { display: "flex", alignItems: "center", gap: 3, minWidth: 0 },
  historyChoice: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 0, height: 26, padding: "0 2px", borderRadius: 7, border: `1px solid ${COLORS.line}`, background: "#fff", fontSize: 9.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  historyPassChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 0, height: 26, padding: "0 2px", borderRadius: 7, border: `1px solid rgba(19,115,51,0.35)`, background: COLORS.greenSoft, color: COLORS.green, fontSize: 9.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  historyFailChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 0, height: 26, padding: "0 2px", borderRadius: 7, border: `1px solid rgba(180,35,24,0.35)`, background: COLORS.redSoft, color: COLORS.red, fontSize: 9.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  historyAbsentChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 1, minWidth: 0, height: 26, padding: "0 2px", borderRadius: 7, border: `1px solid rgba(180,83,9,0.35)`, background: COLORS.orangeSoft, color: COLORS.orange, fontSize: 9.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  historySaveRow: { marginTop: 4, display: "flex", alignItems: "center", gap: 3, minWidth: 0 },
  historyMinusInputWrap: { flex: 1, minWidth: 38, height: 26, display: "flex", alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 7, background: "#fff", overflow: "hidden" },
  historyWrongInput: { width: "100%", minWidth: 0, height: "100%", border: 0, outline: 0, padding: "0 3px 0 1px", fontWeight: 900, fontSize: 10 },
  historyPostponedDateInput: { flex: 1, minWidth: 0, height: 26, padding: "0 2px", border: `1px solid ${COLORS.line}`, borderRadius: 7, background: "#fff", fontWeight: 900, fontSize: 9 },
  historySaveButton: (disabled) => ({ height: 26, padding: "0 6px", borderRadius: 7, border: `1px solid ${COLORS.line}`, background: COLORS.blueSoft, color: COLORS.text, fontSize: 9.5, fontWeight: 1000, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }),
  historySavedLine: { marginTop: 3, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, minHeight: 16 },
  dateBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", padding: "11px 13px", borderRadius: 16, border: `1px solid ${COLORS.lineSoft}`, background: "rgba(255,255,255,0.70)" },
  dateTitle: { fontSize: 16, fontWeight: 1000 },
  dateSub: { marginTop: 4, fontSize: 12, color: COLORS.sub },
  dateControls: { display: "flex", alignItems: "center", gap: 8 },
  dateInput: { height: 38, padding: "0 9px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "#fff", fontWeight: 900 },
  todayButton: { height: 38, padding: "0 11px", borderRadius: 10, border: `1px solid ${COLORS.line}`, background: "transparent", fontWeight: 900, cursor: "pointer" },
  error: { marginTop: 10, color: COLORS.red, fontWeight: 800, fontSize: 12 },
  tableCard: { marginTop: 12, borderRadius: 16, border: `1px solid ${COLORS.lineSoft}`, background: "rgba(255,255,255,0.82)", overflow: "hidden" },
  tableArea: { width: "100%", overflowX: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  th: { padding: "9px 4px", background: "rgba(47,111,237,0.08)", borderBottom: `1px solid ${COLORS.line}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 10.5, fontWeight: 1000, textAlign: "center", lineHeight: 1.25, whiteSpace: "normal", wordBreak: "keep-all" },
  td: { padding: "8px 5px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 11, textAlign: "left", lineHeight: 1.35, wordBreak: "break-word" },
  tdStrong: { padding: "8px 4px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 12, fontWeight: 1000, textAlign: "center", wordBreak: "break-word" },
  tdCenter: { padding: "8px 3px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, fontSize: 10.8, textAlign: "center", fontWeight: 800, lineHeight: 1.3, wordBreak: "break-word" },
  rangeTd: { padding: "6px 4px", borderBottom: `1px solid ${COLORS.lineSoft}`, borderRight: `1px solid ${COLORS.lineSoft}`, textAlign: "center" },
  rangeDisplay: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 },
  rangeHistoryWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  currentRangeText: { fontSize: 10.8, fontWeight: 900 },
  originalRangeText: { fontSize: 9.5, color: COLORS.sub, fontWeight: 800, textDecoration: "line-through", textDecorationThickness: "1px" },
  changedRangeText: { fontSize: 10.8, color: COLORS.blue, fontWeight: 1000 },
  rangeEditButton: (disabled) => ({ padding: 0, border: 0, background: "transparent", color: COLORS.sub, fontSize: 9.5, fontWeight: 900, textDecoration: "underline", textUnderlineOffset: 2, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 0.82 }),
  rangeEditBox: { display: "grid", gap: 4 },
  rangeInput: { width: "100%", minWidth: 0, height: 28, padding: "0 5px", borderRadius: 7, border: `1px solid ${COLORS.line}`, outline: 0, textAlign: "center", fontSize: 10.5, fontWeight: 900 },
  rangeEditActions: { display: "flex", justifyContent: "center", gap: 4 },
  rangeSaveButton: (disabled) => ({ height: 24, padding: "0 6px", borderRadius: 6, border: `1px solid rgba(47,111,237,0.24)`, background: COLORS.blueSoft, color: COLORS.text, fontSize: 9.5, fontWeight: 1000, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }),
  rangeCancelButton: (disabled) => ({ height: 24, padding: "0 6px", borderRadius: 6, border: `1px solid ${COLORS.line}`, background: "#fff", color: COLORS.sub, fontSize: 9.5, fontWeight: 900, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }),
  resultTd: { padding: "7px 6px", borderBottom: `1px solid ${COLORS.lineSoft}` },
  emptyCell: { padding: 30, textAlign: "center", color: COLORS.sub, fontWeight: 800, fontSize: 12 },
  compactResultRow: { display: "flex", alignItems: "center", gap: 6 },
  statusRow: { flex: "1 1 54%", display: "flex", gap: 4, alignItems: "center", minWidth: 0 },
  choice: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0, height: 30, padding: "0 3px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: "#fff", fontSize: 10.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  passChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0, height: 30, padding: "0 3px", borderRadius: 8, border: `1px solid rgba(19,115,51,0.35)`, background: COLORS.greenSoft, color: COLORS.green, fontSize: 10.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  failChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0, height: 30, padding: "0 3px", borderRadius: 8, border: `1px solid rgba(180,35,24,0.35)`, background: COLORS.redSoft, color: COLORS.red, fontSize: 10.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  absentChoiceActive: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2, minWidth: 0, height: 30, padding: "0 3px", borderRadius: 8, border: `1px solid rgba(180,83,9,0.35)`, background: COLORS.orangeSoft, color: COLORS.orange, fontSize: 10.5, fontWeight: 1000, cursor: "pointer", whiteSpace: "nowrap" },
  saveRow: { flex: "1 1 46%", display: "flex", gap: 4, minWidth: 0 },
  minusInputWrap: { flex: 1, minWidth: 44, height: 30, display: "flex", alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#fff", overflow: "hidden" },
  minus: { paddingLeft: 7, fontWeight: 1000, fontSize: 11 },
  wrongInput: { width: "100%", minWidth: 0, height: "100%", border: 0, outline: 0, padding: "0 4px 0 2px", fontWeight: 900, fontSize: 11 },
  postponedDateInput: { flex: 1, minWidth: 112, height: 30, padding: "0 4px", border: `1px solid ${COLORS.line}`, borderRadius: 8, background: "#fff", fontWeight: 900, fontSize: 10.5 },
  saveButton: (disabled) => ({ height: 30, padding: "0 8px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.blueSoft, color: COLORS.text, fontSize: 10.5, fontWeight: 1000, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1 }),
  savedLine: { marginTop: 4, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, minHeight: 18 },
  savedText: { fontSize: 9.5, color: COLORS.sub, fontWeight: 800, textAlign: "right" },
  undoButton: (disabled) => ({
    padding: 0,
    border: 0,
    background: "transparent",
    color: COLORS.sub,
    fontSize: 9.5,
    fontWeight: 900,
    textDecoration: "underline",
    textUnderlineOffset: 2,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 0.78,
    whiteSpace: "nowrap",
  }),
};