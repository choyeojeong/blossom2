// src/pages/OneToOneTodosPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { supabase } from "../utils/supabaseClient";

dayjs.locale("ko");

const TABLE = "student_todos";

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
  danger: "#b42318",
  dangerSoft: "rgba(180,35,24,0.10)",
};

export default function OneToOneTodosPage() {
  const nav = useNavigate();
  const { teacherName } = useParams();

  const [dateStr, setDateStr] = useState(dayjs().format("YYYY-MM-DD"));
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(""); // task id or add:{studentId}
  const [err, setErr] = useState("");

  const [students, setStudents] = useState([]); // {id,name,school,grade,teacher_name}
  const [todos, setTodos] = useState([]); // rows from student_todos for selected date

  // editing state
  const [editMap, setEditMap] = useState({}); // { [todoId]: text }
  const [addMap, setAddMap] = useState({}); // { [studentId]: text }

  const safeTeacher = teacherName || "";
  const studentIdsRef = useRef(new Set()); // realtime filter용

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTeacher]);

  useEffect(() => {
    if (!students.length) {
      setTodos([]);
      setEditMap({});
      studentIdsRef.current = new Set();
      return;
    }
    studentIdsRef.current = new Set(students.map((s) => s.id));
    loadTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, students]);

  async function loadStudents() {
    try {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("students")
        .select("id, name, school, grade, teacher_name, withdrawal_date")
        .eq("teacher_name", safeTeacher)
        .is("withdrawal_date", null)
        .order("name", { ascending: true });

      if (error) throw error;

      setStudents(data || []);
    } catch (e) {
      setStudents([]);
      setErr(e?.message || "학생 목록 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  async function loadTodos() {
    try {
      setLoading(true);
      setErr("");

      const studentIds = students.map((s) => s.id);
      if (studentIds.length === 0) {
        setTodos([]);
        setEditMap({});
        return;
      }

      const { data, error } = await supabase
        .from(TABLE)
        .select("id, student_id, todo_date, text, order_index, created_at")
        .eq("todo_date", dateStr)
        .in("student_id", studentIds)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = data || [];
      setTodos(rows);

      const next = {};
      rows.forEach((r) => {
        next[r.id] = (r.text ?? "").toString();
      });
      setEditMap(next);
    } catch (e) {
      setTodos([]);
      setEditMap({});
      setErr(e?.message || "할일 불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Realtime: StudentDetailPage에서 수정/삭제/추가/이동/순서변경한 것도 즉시 반영
  useEffect(() => {
    if (!safeTeacher) return;

    const channel = supabase
      .channel(`rt-oto-todos-${safeTeacher}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload) => {
        const type = payload.eventType;
        const nextRow = payload.new;
        const oldRow = payload.old;

        const ids = studentIdsRef.current;
        const isMineStudent = (sid) => !!sid && ids && ids.has(sid);

        // 현재 페이지에서 보여주는 "날짜"만 반영
        const isCurrentDate = (d) => String(d || "") === String(dateStr || "");

        // 1) INSERT
        if (type === "INSERT") {
          if (!isMineStudent(nextRow?.student_id)) return;
          if (!isCurrentDate(nextRow?.todo_date)) return;

          setTodos((arr) => {
            const exists = arr.some((x) => x.id === nextRow.id);
            if (exists) return arr;
            const merged = [...arr, nextRow];
            merged.sort((a, b) => {
              const ao = a.order_index ?? 0;
              const bo = b.order_index ?? 0;
              if (ao !== bo) return ao - bo;
              const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
              return ac - bc;
            });
            return merged;
          });

          setEditMap((m) => ({ ...m, [nextRow.id]: (nextRow.text ?? "").toString() }));
          return;
        }

        // 2) UPDATE
        if (type === "UPDATE") {
          const oldSid = oldRow?.student_id;
          const newSid = nextRow?.student_id;

          const wasMine = isMineStudent(oldSid);
          const isMine = isMineStudent(newSid);

          const oldDate = oldRow?.todo_date;
          const newDate = nextRow?.todo_date;

          const shouldRemove =
            (wasMine && isCurrentDate(oldDate) && (!isMine || !isCurrentDate(newDate))) ||
            (isMineStudent(oldSid) && isCurrentDate(oldDate) && !isCurrentDate(newDate));

          if (shouldRemove) {
            setTodos((arr) => arr.filter((x) => x.id !== oldRow.id));
            setEditMap((m) => {
              const next = { ...m };
              delete next[oldRow.id];
              return next;
            });
          }

          const shouldUpsert = isMine && isCurrentDate(newDate);

          if (shouldUpsert) {
            setTodos((arr) => {
              const idx = arr.findIndex((x) => x.id === nextRow.id);
              let merged;
              if (idx >= 0) {
                merged = [...arr];
                merged[idx] = { ...merged[idx], ...nextRow };
              } else {
                merged = [...arr, nextRow];
              }
              merged.sort((a, b) => {
                const ao = a.order_index ?? 0;
                const bo = b.order_index ?? 0;
                if (ao !== bo) return ao - bo;
                const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
                return ac - bc;
              });
              return merged;
            });

            setEditMap((m) => ({ ...m, [nextRow.id]: (nextRow.text ?? "").toString() }));
          }

          return;
        }

        // 3) DELETE
        if (type === "DELETE") {
          if (!isMineStudent(oldRow?.student_id)) return;
          if (!isCurrentDate(oldRow?.todo_date)) return;

          setTodos((arr) => arr.filter((x) => x.id !== oldRow.id));
          setEditMap((m) => {
            const next = { ...m };
            delete next[oldRow.id];
            return next;
          });
          return;
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [safeTeacher, dateStr]);

  const todosByStudent = useMemo(() => {
    const map = new Map(); // student_id -> todos[]
    (todos || []).forEach((t) => {
      if (!map.has(t.student_id)) map.set(t.student_id, []);
      map.get(t.student_id).push(t);
    });
    return map;
  }, [todos]);

  // ✅ 이 날짜에 할일이 있는 학생만 노출
  const visibleStudents = useMemo(() => {
    return (students || []).filter((s) => (todosByStudent.get(s.id) || []).length > 0);
  }, [students, todosByStudent]);

  const titleDateLabel = useMemo(() => {
    const d = dayjs(dateStr);
    const today = dayjs().format("YYYY-MM-DD");
    const label = d.format("YYYY년 M월 D일 (ddd)");
    return dateStr === today ? `${label} · 오늘` : label;
  }, [dateStr]);

  function setEdit(todoId, val) {
    setEditMap((m) => ({ ...m, [todoId]: val }));
  }
  function setAdd(studentId, val) {
    setAddMap((m) => ({ ...m, [studentId]: val }));
  }

  async function saveTodo(todo) {
    const text = (editMap[todo.id] ?? "").trim();
    if (!text) {
      alert("할일 내용이 비어있어요.");
      return;
    }

    try {
      setBusyKey(todo.id);
      setErr("");

      const { error } = await supabase.from(TABLE).update({ text }).eq("id", todo.id);
      if (error) throw error;

      setTodos((arr) => arr.map((r) => (r.id === todo.id ? { ...r, text } : r)));
    } catch (e) {
      setErr(e?.message || "저장 실패");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteTodo(todo) {
    if (!window.confirm("이 할일을 삭제할까요?")) return;

    try {
      setBusyKey(todo.id);
      setErr("");

      const { error } = await supabase.from(TABLE).delete().eq("id", todo.id);
      if (error) throw error;

      setTodos((arr) => arr.filter((r) => r.id !== todo.id));
      setEditMap((m) => {
        const next = { ...m };
        delete next[todo.id];
        return next;
      });
    } catch (e) {
      setErr(e?.message || "삭제 실패");
    } finally {
      setBusyKey("");
    }
  }

  // ✅ (현재 UI에서는 “할일 없는 학생은 안 보임”이므로, 카드 내부에서만 "추가" 제공하지 않게 처리)
  // 필요하면 상단에 “할일 추가” 전용 섹션을 따로 만들면 됨.
  async function addTodo(studentId) {
    const text = (addMap[studentId] ?? "").trim();
    if (!text) return;

    try {
      setBusyKey(`add:${studentId}`);
      setErr("");

      const current = todosByStudent.get(studentId) || [];
      const nextOrder = current.length ? Math.max(...current.map((x) => x.order_index ?? 0)) + 1 : 0;

      const payload = { student_id: studentId, todo_date: dateStr, text, order_index: nextOrder };

      const { data, error } = await supabase
        .from(TABLE)
        .insert(payload)
        .select("id, student_id, todo_date, text, order_index, created_at")
        .single();

      if (error) throw error;

      setTodos((arr) => {
        const merged = [...arr, data];
        merged.sort((a, b) => {
          const ao = a.order_index ?? 0;
          const bo = b.order_index ?? 0;
          if (ao !== bo) return ao - bo;
          const ac = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bc = b.created_at ? new Date(b.created_at).getTime() : 0;
          return ac - bc;
        });
        return merged;
      });
      setEditMap((m) => ({ ...m, [data.id]: data.text }));
      setAddMap((m) => ({ ...m, [studentId]: "" }));
    } catch (e) {
      setErr(e?.message || "추가 실패");
    } finally {
      setBusyKey("");
    }
  }

  // ✅ 카드 그리드(가로 3~4개 가시성 좋게)
  const cardsGridStyle = {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
        color: COLORS.text,
        padding: `calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px)`,
      }}
    >
      <div style={{ width: "min(1400px, 100%)", margin: "0 auto" }}>
        {/* 헤더 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>날짜별 할일보기</div>
            <div style={{ marginTop: 6, fontSize: 13, color: COLORS.sub }}>
              {safeTeacher ? `${safeTeacher} 선생님 학생들의 할일을 날짜별로 모아봅니다.` : "선생님 학생들의 할일을 날짜별로 모아봅니다."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              loadStudents();
            }}
            style={{
              border: `1px solid ${COLORS.line}`,
              background: "rgba(255,255,255,0.6)",
              borderRadius: 999,
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 800,
              color: COLORS.text,
            }}
            title="새로고침"
          >
            새로고침
          </button>
        </div>

        {/* 날짜 선택 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 12px",
            border: `1px solid ${COLORS.lineSoft}`,
            borderRadius: 14,
            background: "rgba(255,255,255,0.55)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{titleDateLabel}</div>
            <div style={{ fontSize: 12, color: COLORS.sub }}>날짜를 바꾸면 해당 날짜의 할일만 표시돼요. (할 일이 없는 학생은 숨김)</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{
                height: 38,
                padding: "0 10px",
                borderRadius: 10,
                border: `1px solid ${COLORS.line}`,
                background: "rgba(255,255,255,0.92)",
                color: COLORS.text,
                fontWeight: 800,
                cursor: "pointer",
              }}
            />
            <button
              type="button"
              onClick={() => setDateStr(dayjs().format("YYYY-MM-DD"))}
              style={{
                height: 38,
                padding: "0 10px",
                borderRadius: 10,
                border: `1px solid ${COLORS.line}`,
                background: "transparent",
                color: COLORS.text,
                fontWeight: 800,
                cursor: "pointer",
              }}
              title="오늘로"
            >
              오늘
            </button>
          </div>
        </div>

        {/* 에러 */}
        {err ? <div style={{ marginTop: 10, color: COLORS.danger, fontWeight: 700 }}>{err}</div> : null}

        {/* 본문 */}
        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={{ padding: "14px 0", color: COLORS.sub }}>불러오는 중…</div>
          ) : students.length === 0 ? (
            <div style={{ padding: "14px 0", color: COLORS.sub }}>표시할 학생이 없어요. (해당 선생님 + 퇴원하지 않은 학생 없음)</div>
          ) : visibleStudents.length === 0 ? (
            <div style={{ padding: "14px 0", color: COLORS.sub }}>
              이 날짜에 할 일이 있는 학생이 없어요. (날짜를 바꿔보세요)
            </div>
          ) : (
            <>
              {/* ✅ 반응형: 모바일 1, 태블릿 2, 데스크탑 3, 큰 화면 4 */}
              <div
                style={{
                  ...cardsGridStyle,
                  gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
                }}
              >
                <style>{`
                  @media (min-width: 700px) {
                    .oto-todo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                  }
                  @media (min-width: 1024px) {
                    .oto-todo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
                  }
                  @media (min-width: 1320px) {
                    .oto-todo-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
                  }
                `}</style>

                <div className="oto-todo-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(1, minmax(0, 1fr))" }}>
                  {visibleStudents.map((s) => {
                    const list = todosByStudent.get(s.id) || [];
                    if (!list.length) return null; // ✅ 이 날짜 할일 없는 학생 숨김(안전)

                    return (
                      <div
                        key={s.id}
                        style={{
                          border: `1px solid ${COLORS.lineSoft}`,
                          background: "rgba(255,255,255,0.60)",
                          borderRadius: 16,
                          padding: 12,
                          minWidth: 0,
                        }}
                      >
                        {/* 학생 헤더 */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 10,
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                            <Link
                              to={`/students/${s.id}`}
                              style={{
                                color: COLORS.blue,
                                textDecoration: "underline",
                                fontWeight: 900,
                                fontSize: 17,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title="학생 상세로 이동"
                            >
                              {s.name}
                            </Link>
                            <div style={{ fontSize: 12, color: COLORS.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {s.school || "-"} · {s.grade || "-"}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => nav(`/students/${s.id}`)}
                            style={{
                              border: `1px solid ${COLORS.line}`,
                              background: "transparent",
                              borderRadius: 10,
                              padding: "8px 10px",
                              cursor: "pointer",
                              fontWeight: 800,
                              color: COLORS.text,
                              whiteSpace: "nowrap",
                              flex: "0 0 auto",
                            }}
                          >
                            상세 →
                          </button>
                        </div>

                        {/* 할일 목록 */}
                        <div style={{ display: "grid", gap: 8 }}>
                          {list.map((t) => {
                            const isBusy = busyKey === t.id;
                            const val = editMap[t.id] ?? t.text ?? "";

                            return (
                              <div
                                key={t.id}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr",
                                  gap: 8,
                                  padding: 10,
                                  borderRadius: 12,
                                  border: `1px solid ${COLORS.lineSoft}`,
                                  background: "rgba(255,255,255,0.55)",
                                }}
                              >
                                <input
                                  value={val}
                                  onChange={(e) => setEdit(t.id, e.target.value)}
                                  placeholder="할일"
                                  style={{
                                    width: "100%",
                                    height: 40,
                                    padding: "0 10px",
                                    borderRadius: 10,
                                    border: `1px solid ${COLORS.line}`,
                                    background: "rgba(255,255,255,0.92)",
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: COLORS.text,
                                  }}
                                />

                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => saveTodo(t)}
                                    style={{
                                      height: 40,
                                      padding: "0 10px",
                                      borderRadius: 10,
                                      border: `1px solid ${COLORS.line}`,
                                      background: COLORS.blueSoft,
                                      color: COLORS.text,
                                      fontWeight: 900,
                                      cursor: isBusy ? "not-allowed" : "pointer",
                                      opacity: isBusy ? 0.6 : 1,
                                      flex: 1,
                                    }}
                                    title="저장"
                                  >
                                    저장
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => deleteTodo(t)}
                                    style={{
                                      height: 40,
                                      padding: "0 10px",
                                      borderRadius: 10,
                                      border: `1px solid ${COLORS.line}`,
                                      background: COLORS.dangerSoft,
                                      color: COLORS.danger,
                                      fontWeight: 900,
                                      cursor: isBusy ? "not-allowed" : "pointer",
                                      opacity: isBusy ? 0.6 : 1,
                                      flex: 1,
                                    }}
                                    title="삭제"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* ✅ (선택) 카드에서 바로 할일 추가는 유지 */}
                        <div
                          style={{
                            marginTop: 10,
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                          }}
                        >
                          <input
                            value={addMap[s.id] ?? ""}
                            onChange={(e) => setAdd(s.id, e.target.value)}
                            placeholder="할일 추가…"
                            style={{
                              width: "100%",
                              height: 42,
                              padding: "0 10px",
                              borderRadius: 12,
                              border: `1px solid ${COLORS.line}`,
                              background: "rgba(255,255,255,0.92)",
                              fontSize: 14,
                              fontWeight: 700,
                              color: COLORS.text,
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addTodo(s.id);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => addTodo(s.id)}
                            disabled={busyKey === `add:${s.id}`}
                            style={{
                              height: 42,
                              padding: "0 12px",
                              borderRadius: 12,
                              border: `1px solid ${COLORS.line}`,
                              background: "rgba(47,111,237,0.12)",
                              color: COLORS.text,
                              fontWeight: 900,
                              cursor: busyKey === `add:${s.id}` ? "not-allowed" : "pointer",
                              opacity: busyKey === `add:${s.id}` ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            추가 +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: COLORS.sub }}>
          * 여기서 수정/삭제/추가한 할일은 <b>student_todos</b>에 저장됩니다. 학생상세페이지도 같은 테이블을 보면 그대로 반영돼요.
        </div>
      </div>
    </div>
  );
}
