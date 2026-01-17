// src/pages/StudentDetailPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  greenSoft: "rgba(116, 214, 151, 0.22)",
  blueSoft: "rgba(90,167,255,0.18)",
  redSoft: "rgba(255, 99, 99, 0.16)",
  yellowSoft: "rgba(255, 210, 77, 0.22)",

  todayRing: "rgba(90,167,255,0.7)",
  blue: "#1f6feb",
};

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAYS_MON_SAT = [1, 2, 3, 4, 5, 6];

function iso(d) {
  return dayjs(d).format("YYYY-MM-DD");
}
function mmdd(d) {
  return dayjs(d).format("MM/DD");
}
function dowKo(isoDate) {
  const d = dayjs(isoDate);
  return WEEKDAYS_KO[d.day()];
}
function clampMonday(isoDate) {
  const d = dayjs(isoDate);
  const dow = d.day();
  const delta = dow === 0 ? -6 : 1 - dow;
  return iso(d.add(delta, "day"));
}
function addDays(isoDate, n) {
  return iso(dayjs(isoDate).add(n, "day"));
}
function weeksBetween(startMondayIso, endMondayIso) {
  const out = [];
  let cur = dayjs(startMondayIso);
  const end = dayjs(endMondayIso);
  while (cur.isSame(end) || cur.isBefore(end)) {
    out.push(iso(cur));
    cur = cur.add(7, "day");
  }
  return out;
}

/** "OT, 1-2, 7" 같은 입력을 ["OT",1,2,7] 형태로 풀기 */
function parseLectureInput(s) {
  const raw = String(s || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

  const out = [];
  for (const token of raw) {
    if (!token) continue;

    if (/^ot$/i.test(token)) {
      out.push("OT");
      continue;
    }

    const m = token.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const from = Math.min(a, b);
        const to = Math.max(a, b);
        for (let i = from; i <= to; i++) out.push(i);
      }
      continue;
    }

    if (/^\d{1,3}$/.test(token)) {
      out.push(parseInt(token, 10));
      continue;
    }

    out.push(token);
  }

  const seen = new Set();
  const uniq = [];
  for (const x of out) {
    const key = typeof x === "number" ? `n:${x}` : `s:${String(x)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(x);
  }
  return uniq;
}

function buildWordTestBlock() {
  return [
    "[단어시험]",
    "▶단어시험 보는 날 전까지 다 외워오기!",
    "60문제, -3컷",
    "",
    "▼공부방법▼",
    "① 단어는 매일 조금씩 공부하는 게 가장 효율적입니다.",
    "② 강의수강 시 필기는 3색볼펜+형광펜 활용",
    "③ 강의 듣는 건 기본 + 필기한 부분 다시 공부하는 시간 필수!",
  ].join("\n");
}

function IconButton({ title, onClick, children, danger = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 9,
        border: `1px solid rgba(31,42,68,0.12)`,
        background: "rgba(255,255,255,0.75)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: danger ? "#b00020" : "#1f2a44",
        flex: "0 0 auto",
      }}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function StudentDetailPage() {
  const nav = useNavigate();
  const { studentId } = useParams();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [student, setStudent] = useState(null);

  const [topMemo, setTopMemo] = useState("");
  const memoSaveTimer = useRef(null);
  const [memoSaving, setMemoSaving] = useState(false);

  const todayIso = iso(new Date());
  const defaultStart = clampMonday(todayIso);
  const defaultEnd = addDays(defaultStart, 7);
  const [startWeek, setStartWeek] = useState(defaultStart);
  const [endWeek, setEndWeek] = useState(clampMonday(defaultEnd));

  const [todosByDate, setTodosByDate] = useState({});
  const [todoDraftByDate, setTodoDraftByDate] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const dragRef = useRef(null);

  const [eventsByDate, setEventsByDate] = useState({});

  // ===== 강의 선택 =====
  const [courseOptions, setCourseOptions] = useState([]); // [{id,name}]
  const [coursesLoading, setCoursesLoading] = useState(false);

  const [courseId, setCourseId] = useState("");
  const [courseKey, setCourseKey] = useState(""); // name 저장
  const [lectureInput, setLectureInput] = useState("");
  const [selectedLectureGroups, setSelectedLectureGroups] = useState([]);
  const [lastAddedText, setLastAddedText] = useState("");
  const lastAddedTimerRef = useRef(null);

  const [messageText, setMessageText] = useState("");
  const [copied, setCopied] = useState(false);

  const weekMondays = useMemo(() => weeksBetween(startWeek, endWeek), [startWeek, endWeek]);

  const calendarDates = useMemo(() => {
    const out = [];
    for (const mon of weekMondays) {
      for (let i = 0; i < 6; i++) out.push(addDays(mon, i));
    }
    return out;
  }, [weekMondays]);

  const rangeMin = useMemo(() => (calendarDates.length ? calendarDates[0] : startWeek), [calendarDates, startWeek]);
  const rangeMax = useMemo(
    () => (calendarDates.length ? calendarDates[calendarDates.length - 1] : addDays(endWeek, 5)),
    [calendarDates, endWeek]
  );

  const greenWeekdaySet = useMemo(() => {
    const s = new Set();

    const w1 = student?.term_oto_weekday;
    const w2 = student?.term_read_weekday;
    const w3 = student?.winter_oto_weekday;
    const w4 = student?.winter_read_weekday;

    [w1, w2, w3, w4].forEach((v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 6) s.add(n);
    });

    const extra = student?.__extraWeekdays || [];
    for (const n of extra) {
      if (n >= 1 && n <= 6) s.add(n);
    }

    return s;
  }, [student]);

  function isGreenDay(isoDate) {
    const d = dayjs(isoDate);
    const dow = d.day();
    return greenWeekdaySet.has(dow);
  }
  function isToday(isoDate) {
    return isoDate === todayIso;
  }

  function kindLabel(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "oto" || k === "oto_class" || k === "one_to_one") return "일대일";
    if (k === "reading") return "독해";
    if (k === "extra" || k === "extra_attendance" || k === "extra_class") return "추가";

    // ✅ 보강 세부 표시
    if (k === "makeup_oto") return "일대일보강";
    if (k === "makeup_reading") return "독해보강";
    if (k === "makeup") return "보강";

    return null;
  }

  function normalizeKind(row) {
    const raw = row?.event_kind ?? row?.kind ?? "";
    const k = String(raw).toLowerCase();
    if (k === "oto" || k === "oto_class" || k === "one_to_one") return "oto_class";
    if (k === "reading") return "reading";
    if (k === "extra") return "extra";
    if (k === "makeup") return "makeup";
    return k || "unknown";
  }

  function normalizeStatus(row) {
    const s = row?.attendance_status;
    if (s === null || s === undefined) return null;
    const t = String(s).toLowerCase();
    if (t.includes("attend")) return "attended";
    if (t.includes("absent")) return "absent";
    if (t === "present" || t === "late") return "attended";
    return null;
  }

  // ✅ 보강이 "일대일보강/독해보강"인지 추론
  function normalizeMakeupType(row, originalKindById) {
    const ek = String(row?.event_kind || "").toLowerCase();

    // 1) event_kind 힌트 우선
    if (ek.includes("oto") || ek.includes("one") || ek.includes("1:1") || ek.includes("one_to_one")) return "oto";
    if (ek.includes("read")) return "reading";

    // 2) original_event_id로 원본 kind 조회
    const oid = row?.original_event_id;
    if (oid && originalKindById && originalKindById[oid]) {
      const ok = String(originalKindById[oid] || "").toLowerCase();
      if (ok === "reading") return "reading";
      if (ok === "oto" || ok === "oto_class" || ok === "one_to_one") return "oto";
    }

    return null;
  }

  function buildDayMeta(dateIso) {
    const meta = eventsByDate[dateIso];
    const kinds = meta?.kinds ? Array.from(meta.kinds) : [];
    const labels = kinds.map((k) => kindLabel(k)).filter(Boolean);

    const status = meta?.status || null;

    let bg = "rgba(31,42,68,0.04)";
    if (status === "makeup_pending") bg = COLORS.yellowSoft;
    else if (status === "attended") bg = COLORS.blueSoft;
    else if (status === "absent") bg = COLORS.redSoft;
    else if (isGreenDay(dateIso)) bg = COLORS.greenSoft;

    return { labels, status, bg };
  }

  async function loadCourses() {
    setCoursesLoading(true);
    try {
      const { data, error } = await supabase.from("lecture_courses").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      setCourseOptions((data || []).filter((r) => r?.id && r?.name));
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setCoursesLoading(false);
    }
  }

  async function load() {
    if (!studentId) return;
    setLoading(true);
    setErr("");
    try {
      const { data: stu, error: stuErr } = await supabase
        .from("students")
        .select(
          `
          id,
          name,
          school,
          grade,
          teacher_name,
          term_oto_weekday,
          term_read_weekday,
          winter_oto_weekday,
          winter_read_weekday
        `
        )
        .eq("id", studentId)
        .single();
      if (stuErr) throw stuErr;

      // ✅ FIX: student_extra_rules는 (season, weekday, class_time) 구조여서 kind 필터링하면 빈 배열이 될 수 있음
      //         -> weekday만 가져와서 전부 "추가등원 요일"로 합산
      const { data: extra, error: extraErr } = await supabase.from("student_extra_rules").select("weekday").eq("student_id", studentId);
      if (extraErr) throw extraErr;

      // ✅ weekday 0-based(0~5) 저장 방어 + 1~6 정상값 허용 + 중복 제거
      const set = new Set();
      for (const r of extra || []) {
        let n = Number(r?.weekday);
        if (!Number.isFinite(n)) continue;
        if (n >= 1 && n <= 6) set.add(n);
        else if (n >= 0 && n <= 5) set.add(n + 1);
      }
      const extraWeekdays = Array.from(set);

      setStudent({ ...stu, __extraWeekdays: extraWeekdays });

      const { data: memoRow, error: memoErr } = await supabase.from("student_memos").select("memo").eq("student_id", studentId).maybeSingle();
      if (memoErr) throw memoErr;
      setTopMemo(memoRow?.memo || "");

      await Promise.all([loadTodosInRange(rangeMin, rangeMax), loadEventsInRange(rangeMin, rangeMax)]);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadTodosInRange(fromIso, toIso) {
    if (!studentId) return;
    const { data, error } = await supabase
      .from("student_todos")
      .select("id, todo_date, text, order_index")
      .eq("student_id", studentId)
      .gte("todo_date", fromIso)
      .lte("todo_date", toIso)
      .order("todo_date", { ascending: true })
      .order("order_index", { ascending: true });

    if (error) throw error;

    const map = {};
    for (const r of data || []) {
      const d = r.todo_date;
      if (!map[d]) map[d] = [];
      map[d].push({ id: r.id, text: r.text || "", order_index: r.order_index ?? 0 });
    }
    setTodosByDate(map);
  }

  async function loadEventsInRange(fromIso, toIso) {
    if (!studentId) return;

    const { data, error } = await supabase
      .from("student_events")
      .select("id, event_date, kind, event_kind, attendance_status, original_event_id")
      .eq("student_id", studentId)
      .gte("event_date", fromIso)
      .lte("event_date", toIso);

    if (error) return;

    const originalIds = Array.from(
      new Set(
        (data || [])
          .filter((r) => String(r?.kind || "").toLowerCase() === "makeup" || String(r?.event_kind || "").toLowerCase() === "makeup")
          .map((r) => r?.original_event_id)
          .filter(Boolean)
      )
    );

    let originalKindById = {};
    if (originalIds.length) {
      const { data: origRows, error: origErr } = await supabase.from("student_events").select("id, kind").in("id", originalIds);
      if (!origErr) {
        originalKindById = {};
        for (const r of origRows || []) {
          if (r?.id) originalKindById[r.id] = r.kind;
        }
      }
    }

    const map = {};
    for (const r of data || []) {
      const d = r.event_date;
      if (!d) continue;

      if (!map[d]) map[d] = { normalKinds: new Set(), makeupTypes: new Set(), makeup: [], normal: [] };

      const k = normalizeKind(r);

      if (k === "makeup") {
        map[d].makeup.push(r);

        const mt = normalizeMakeupType(r, originalKindById);
        if (mt === "oto") map[d].makeupTypes.add("makeup_oto");
        else if (mt === "reading") map[d].makeupTypes.add("makeup_reading");
        else map[d].makeupTypes.add("makeup");
      } else {
        map[d].normal.push(r);
        map[d].normalKinds.add(k);
      }
    }

    const out = {};
    for (const d of Object.keys(map)) {
      const bucket = map[d];
      let status = null;

      const makeupStatuses = (bucket.makeup || []).map(normalizeStatus).filter(Boolean);
      if ((bucket.makeup || []).length) {
        if (makeupStatuses.includes("absent")) status = "absent";
        else if (makeupStatuses.includes("attended")) status = "attended";
        else status = "makeup_pending";
      } else {
        const normalStatuses = (bucket.normal || []).map(normalizeStatus).filter(Boolean);
        if (normalStatuses.includes("absent")) status = "absent";
        else if (normalStatuses.includes("attended")) status = "attended";
      }

      const kinds = new Set();
      for (const nk of bucket.normalKinds || []) kinds.add(nk);
      for (const mk of bucket.makeupTypes || []) kinds.add(mk);

      out[d] = { kinds, status };
    }

    setEventsByDate(out);
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([loadTodosInRange(rangeMin, rangeMax), loadEventsInRange(rangeMin, rangeMax)]).catch((e) => setErr(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, rangeMin, rangeMax]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;

    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    memoSaveTimer.current = setTimeout(async () => {
      setMemoSaving(true);
      setErr("");
      try {
        const memo = String(topMemo || "");
        const { error } = await supabase
          .from("student_memos")
          .upsert({ student_id: studentId, memo, updated_at: new Date().toISOString() }, { onConflict: "student_id" });
        if (error) throw error;
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setMemoSaving(false);
      }
    }, 500);

    return () => {
      if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    };
  }, [topMemo, studentId]);

  async function addTodo(dateIso) {
    const raw = todoDraftByDate[dateIso] ?? "";
    const text = String(raw).trim();
    if (!text) return;

    setErr("");
    try {
      const current = todosByDate[dateIso] || [];
      const nextIndex = current.length ? Math.max(...current.map((x) => x.order_index ?? 0)) + 1 : 0;

      const { data, error } = await supabase
        .from("student_todos")
        .insert({ student_id: studentId, todo_date: dateIso, text, order_index: nextIndex })
        .select("id, todo_date, text, order_index")
        .single();

      if (error) throw error;

      setTodosByDate((prev) => ({
        ...prev,
        [dateIso]: [...(prev[dateIso] || []), { id: data.id, text: data.text, order_index: data.order_index }],
      }));
      setTodoDraftByDate((prev) => ({ ...prev, [dateIso]: "" }));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function startEdit(todo) {
    setEditingId(todo.id);
    setEditingText(todo.text || "");
  }

  async function saveEdit(dateIso, todoId) {
    const text = String(editingText || "").trim();
    if (!text) return;

    setErr("");
    try {
      const { error } = await supabase.from("student_todos").update({ text }).eq("id", todoId);
      if (error) throw error;

      setTodosByDate((prev) => {
        const arr = [...(prev[dateIso] || [])];
        const i = arr.findIndex((x) => x.id === todoId);
        if (i >= 0) arr[i] = { ...arr[i], text };
        return { ...prev, [dateIso]: arr };
      });

      setEditingId(null);
      setEditingText("");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function deleteTodo(dateIso, todoId) {
    setErr("");
    try {
      const { error } = await supabase.from("student_todos").delete().eq("id", todoId);
      if (error) throw error;

      setTodosByDate((prev) => {
        const arr = (prev[dateIso] || []).filter((x) => x.id !== todoId);
        return { ...prev, [dateIso]: arr };
      });

      if (editingId === todoId) {
        setEditingId(null);
        setEditingText("");
      }
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function persistOrderIndexUpdates(patched) {
    const jobs = (patched || [])
      .filter((x) => x?.id)
      .map((x) => supabase.from("student_todos").update({ order_index: x.order_index }).eq("id", x.id));

    const results = await Promise.all(jobs);
    const firstErr = results.find((r) => r?.error)?.error;
    if (firstErr) throw firstErr;
  }

  async function reorderWithinDate(dateIso, movingId, beforeId) {
    const arr = [...(todosByDate[dateIso] || [])];
    const fromIdx = arr.findIndex((x) => x.id === movingId);
    if (fromIdx < 0) return;

    const item = arr[fromIdx];
    arr.splice(fromIdx, 1);

    let toIdx = arr.findIndex((x) => x.id === beforeId);
    if (toIdx < 0) toIdx = arr.length;
    arr.splice(toIdx, 0, item);

    const patched = arr.map((x, i) => ({ ...x, order_index: i }));
    setTodosByDate((prev) => ({ ...prev, [dateIso]: patched }));

    setErr("");
    try {
      await persistOrderIndexUpdates(patched.map((x) => ({ id: x.id, order_index: x.order_index })));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function moveToOtherDate(fromDate, toDate, todoId) {
    if (fromDate === toDate) return;

    const fromArr = [...(todosByDate[fromDate] || [])];
    const idx = fromArr.findIndex((x) => x.id === todoId);
    if (idx < 0) return;

    const item = fromArr[idx];
    fromArr.splice(idx, 1);

    const toArr = [...(todosByDate[toDate] || [])];
    const nextIndex = toArr.length ? Math.max(...toArr.map((x) => x.order_index ?? 0)) + 1 : 0;
    const moved = { ...item, order_index: nextIndex };

    setTodosByDate((prev) => ({
      ...prev,
      [fromDate]: fromArr.map((x, i) => ({ ...x, order_index: i })),
      [toDate]: [...toArr, moved],
    }));

    setErr("");
    try {
      const fromPatched = fromArr.map((x, i) => ({ id: x.id, order_index: i }));

      if (fromPatched.length) {
        await persistOrderIndexUpdates(fromPatched);
      }

      const { error: up2 } = await supabase.from("student_todos").update({ todo_date: toDate, order_index: nextIndex }).eq("id", todoId);
      if (up2) throw up2;
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function onDragStart(todoId, fromDate) {
    dragRef.current = { id: todoId, fromDate };
  }
  function onDragEnd() {
    dragRef.current = null;
  }

  // ===== 강의 선택 =====
  function normalizeTitle(s) {
    return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function pickLectureLinks(links, tokens) {
    if (!tokens.length) return [];

    const byNorm = new Map();
    for (const r of links || []) {
      const t = normalizeTitle(r.title);
      if (!t) continue;
      if (!byNorm.has(t)) byNorm.set(t, r);

      const onlyNum = t.replace(/[^\d]/g, "");
      if (onlyNum) {
        if (!byNorm.has(onlyNum)) byNorm.set(onlyNum, r);
        if (!byNorm.has(`${onlyNum}강`)) byNorm.set(`${onlyNum}강`, r);
      }
    }

    const picked = [];
    for (const t of tokens) {
      if (t === "OT") {
        const r = byNorm.get("OT") || byNorm.get("OT강");
        if (r) picked.push(r);
        continue;
      }

      if (typeof t === "number") {
        const key1 = normalizeTitle(`${t}강`);
        const key2 = normalizeTitle(String(t));
        const r = byNorm.get(key1) || byNorm.get(key2) || byNorm.get(String(t).padStart(2, "0"));
        if (r) picked.push(r);
        continue;
      }

      const needle = normalizeTitle(String(t));
      const hit = (links || []).find((r) => normalizeTitle(r.title).includes(needle));
      if (hit) picked.push(hit);
    }

    const seen = new Set();
    const uniq = [];
    for (const r of picked) {
      if (!r?.id) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      uniq.push(r);
    }
    return uniq;
  }

  function flashAdded(text) {
    setLastAddedText(text);
    if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
    lastAddedTimerRef.current = setTimeout(() => setLastAddedText(""), 2200);
  }

  async function addSelectedLectures() {
    const ck = String(courseKey || "").trim();
    const li = String(lectureInput || "").trim();
    if (!ck || !li) return;

    setErr("");
    try {
      let course = null;

      if (courseId) {
        course = { id: courseId, name: ck };
      } else {
        const { data: c1, error: c1err } = await supabase.from("lecture_courses").select("id, name").eq("name", ck).maybeSingle();
        if (c1err) throw c1err;
        course = c1 || null;

        if (!course) {
          const { data: c2, error: c2err } = await supabase.from("lecture_courses").select("id, name").ilike("name", ck).maybeSingle();
          if (c2err) throw c2err;
          course = c2 || null;
        }
      }

      if (!course?.id) {
        flashAdded(`추가 실패: "${ck}" 과정이 강의관리(lecture_courses)에 없어요`);
        return;
      }

      const { data: links, error: lErr } = await supabase
        .from("lecture_links")
        .select("id, title, url, order_index, course_id")
        .eq("course_id", course.id)
        .order("order_index");

      if (lErr) throw lErr;

      const tokens = parseLectureInput(li);
      const pickedRaw = pickLectureLinks(links || [], tokens);

      if (!pickedRaw.length) {
        flashAdded(`추가 실패: "${course.name}"에서 "${li}"에 해당하는 강의를 못 찾았어요`);
        return;
      }

      const picked = pickedRaw.map((r) => ({
        id: r.id,
        course_key: course.name,
        title: r.title,
        url: r.url,
        order_index: r.order_index ?? 0,
      }));

      setSelectedLectureGroups((prev) => {
        const next = [...prev];
        const i = next.findIndex((g) => g.course_key === course.name);
        if (i >= 0) {
          const existing = new Set((next[i].items || []).map((x) => x.id));
          const merged = [...(next[i].items || [])];
          for (const p of picked) {
            if (!p?.id) continue;
            if (existing.has(p.id)) continue;
            merged.push(p);
            existing.add(p.id);
          }
          next[i] = { ...next[i], items: merged };
        } else {
          next.push({ course_key: course.name, items: picked });
        }
        return next;
      });

      flashAdded(`추가됨: [${course.name}] ${picked.map((r) => r.title).join(", ")}`);
      setLectureInput("");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function removeSelectedLecture(course_key, lectureId) {
    setSelectedLectureGroups((prev) =>
      prev
        .map((g) => {
          if (g.course_key !== course_key) return g;
          return { ...g, items: (g.items || []).filter((x) => x.id !== lectureId) };
        })
        .filter((g) => (g.items || []).length)
    );
  }

  function clearSelectedLectures() {
    setSelectedLectureGroups([]);
  }

  function buildMessage() {
    const name = (student?.name || "학생").trim();

    const dates = [...calendarDates].sort();
    const blocks = [];

    for (const d of dates) {
      const list = (todosByDate[d] || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      if (!list.length) continue;

      const weekday = dowKo(d);
      blocks.push(`${weekday} (${mmdd(d)})`);
      for (const t of list) blocks.push(`- ${String(t.text || "").trim()}`);
      blocks.push("");
    }

    const flat = [];
    for (const g of selectedLectureGroups) {
      for (const it of g.items || []) flat.push(it);
    }

    const lectureLines = [];
    if (flat.length) {
      lectureLines.push("[강의목록]");

      const groups = {};
      for (const it of flat) {
        const ck = String(it.course_key || "").trim() || "과정";
        if (!groups[ck]) groups[ck] = [];
        groups[ck].push(it);
      }

      for (const ck of Object.keys(groups)) {
        const arr = groups[ck].slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        for (const r of arr) {
          lectureLines.push(`[${ck}] ${String(r.title || "").trim()} ${r.url}`);
        }
      }

      lectureLines.push("");
    }

    const header = `[${name}학생 다음 한주간 할 일🔥]`;
    const main = blocks.length ? blocks.join("\n").trimEnd() : "(할 일이 아직 없어요)\n";

    const msg = [header, "", main, "", ...lectureLines, buildWordTestBlock()].join("\n").trim();
    setMessageText(msg);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(messageText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      setErr("복사에 실패했어요. 브라우저 권한을 확인해주세요.");
    }
  }

  // ===== 스타일 =====
  const page = {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 60%)`,
    color: COLORS.text,
  };
  const wrap = { maxWidth: 1280, margin: "0 auto", padding: "18px 16px 46px" };

  const topBar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" };
  const title = { fontSize: 22, fontWeight: 1000, letterSpacing: -0.3 };
  const sub = { marginTop: 6, color: COLORS.sub, fontSize: 13, fontWeight: 900 };

  const btn = {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 1000,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnPrimary = { ...btn, background: "rgba(90,167,255,0.12)", border: "1px solid rgba(90,167,255,0.55)" };
  const btnGhost = { ...btn, background: "rgba(255,255,255,0.65)" };
  const btnDanger = { ...btn, background: "rgba(255,99,99,0.08)", border: "1px solid rgba(255,99,99,0.35)", color: "#b00020" };

  const sectionTitle = { fontSize: 14, fontWeight: 1000, color: COLORS.sub, marginTop: 16, marginBottom: 8 };

  const textarea = {
    width: "100%",
    minHeight: 96,
    resize: "vertical",
    padding: "12px 12px",
    borderRadius: 14,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 800,
    lineHeight: 1.5,
    outline: "none",
  };

  const grid = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 };

  const dayCell = (isoDate) => ({
    border: `1px solid ${COLORS.lineSoft}`,
    borderRadius: 16,
    background: COLORS.white,
    padding: 10,
    minHeight: 150,
    boxShadow: "0 8px 18px rgba(0,0,0,0.04)",
    position: "relative",
    outline: isToday(isoDate) ? `2px solid ${COLORS.todayRing}` : "none",
  });

  const dayHeader = (isoDate) => {
    const meta = buildDayMeta(isoDate);
    return {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 14,
      background: meta.bg,
      fontWeight: 1000,
    };
  };

  const chip = {
    fontSize: 11,
    fontWeight: 1000,
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid rgba(31,42,68,0.12)`,
    background: "rgba(255,255,255,0.72)",
    color: COLORS.sub,
    whiteSpace: "nowrap",
  };

  const todoItem = {
    display: "flex",
    alignItems: "flex-start", // ✅ 여러 줄일 때 자연스럽게
    gap: 8,
    padding: "8px 9px",
    borderRadius: 12,
    border: `1px solid ${COLORS.lineSoft}`,
    background: "rgba(255,255,255,0.9)",
    cursor: "grab",
    userSelect: "none",
  };

  // ✅ FIX: 2줄 제한 제거 → 길어져도 계속 자동 줄바꿈
  const todoTextWrap = {
    fontWeight: 700,
    fontSize: 12.5,
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  const inputWeight = 700;

  const tinyInput = {
    width: "100%",
    height: 34,
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    padding: "0 10px",
    fontWeight: inputWeight,
    outline: "none",
  };

  const editInput = {
    width: "100%",
    height: 32,
    borderRadius: 10,
    border: `1px solid ${COLORS.line}`,
    padding: "0 10px",
    fontWeight: inputWeight,
    outline: "none",
  };

  const msgBox = {
    width: "100%",
    minHeight: 240,
    resize: "vertical",
    padding: "12px 12px",
    borderRadius: 14,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 800,
    lineHeight: 1.5,
    outline: "none",
    whiteSpace: "pre-wrap",
  };

  const nameLine = useMemo(() => {
    const n = (student?.name || "").trim();
    const sc = (student?.school || "").trim();
    const gr = (student?.grade || "").trim();
    const tn = (student?.teacher_name || "").trim();
    return [n && `${n}`, sc && sc, gr && gr, tn && `${tn}`].filter(Boolean).join(" · ");
  }, [student]);

  function onChangeStartWeek(v) {
    const next = clampMonday(v);
    setStartWeek(next);
    if (dayjs(next).isAfter(dayjs(endWeek))) setEndWeek(next);
  }
  function onChangeEndWeek(v) {
    const next = clampMonday(v);
    if (dayjs(next).isBefore(dayjs(startWeek))) {
      setStartWeek(next);
      setEndWeek(next);
    } else {
      setEndWeek(next);
    }
  }

  const selectedLectureCount = useMemo(() => {
    let c = 0;
    for (const g of selectedLectureGroups) c += (g.items || []).length;
    return c;
  }, [selectedLectureGroups]);

  return (
    <div style={page}>
      <div style={wrap}>
        {/* 상단 바 */}
        <div style={topBar}>
          <div>
            <div style={title}>학생 상세 페이지</div>
            <div style={sub}>
              {nameLine || "-"}
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 1000, color: COLORS.sub }}>(라우트: /students/{studentId})</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" style={btnGhost} onClick={() => nav(-1)}>
              뒤로
            </button>
            <button type="button" style={btn} onClick={() => load()} disabled={loading}>
              새로고침
            </button>
          </div>
        </div>

        {err ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,80,80,0.35)",
              background: "rgba(255,80,80,0.08)",
              color: "#b00020",
              fontWeight: 900,
              whiteSpace: "pre-wrap",
            }}
          >
            {err}
          </div>
        ) : null}

        {/* 상단 메모 */}
        <div style={sectionTitle}>
          상단 메모 {memoSaving ? <span style={{ marginLeft: 8, fontWeight: 900, color: COLORS.sub }}>(저장중…)</span> : null}
        </div>
        <textarea value={topMemo} onChange={(e) => setTopMemo(e.target.value)} placeholder="자유롭게 메모하세요. 자동 저장됩니다." style={textarea} />

        {/* 달력 설정 */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 1000 }}>시작주(월요일 기준)</div>
            <input type="date" value={startWeek} onChange={(e) => onChangeStartWeek(e.target.value)} style={{ ...tinyInput, width: 170 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 1000 }}>끝주(월요일 기준)</div>
            <input type="date" value={endWeek} onChange={(e) => onChangeEndWeek(e.target.value)} style={{ ...tinyInput, width: 170 }} />
          </div>
        </div>

        {/* 달력 */}
        <div style={sectionTitle}>할 일 달력</div>

        {loading ? <div style={{ color: COLORS.sub, fontWeight: 900, padding: "10px 0" }}>불러오는 중…</div> : null}

        {/* 헤더(월~토) */}
        <div style={{ ...grid, marginBottom: 8 }}>
          {["월", "화", "수", "목", "금", "토"].map((w) => (
            <div key={w} style={{ textAlign: "center", fontWeight: 1000, color: COLORS.sub }}>
              {w}
            </div>
          ))}
        </div>

        {/* 주 단위 렌더 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {weekMondays.map((mon) => {
            const days = WEEKDAYS_MON_SAT.map((offset) => addDays(mon, offset - 1));
            return (
              <div key={mon} style={grid}>
                {days.map((dIso) => {
                  const list = (todosByDate[dIso] || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
                  const meta = buildDayMeta(dIso);

                  return (
                    <div
                      key={dIso}
                      style={dayCell(dIso)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const drag = dragRef.current;
                        if (!drag?.id || !drag?.fromDate) return;
                        moveToOtherDate(drag.fromDate, dIso, drag.id);
                        dragRef.current = null;
                      }}
                    >
                      <div style={dayHeader(dIso)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{ fontSize: 13, flex: "0 0 auto" }}>{dowKo(dIso)}</div>
                          <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 1000, flex: "0 0 auto" }}>{mmdd(dIso)}</div>

                          {meta.labels.length ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              {meta.labels.map((lb) => (
                                <span key={lb} style={chip}>
                                  {lb}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {isToday(dIso) ? <div style={{ fontSize: 11, fontWeight: 1000, color: COLORS.blue }}>오늘</div> : null}
                      </div>

                      {/* 할일 목록 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                        {list.map((t) => {
                          const isEditing = editingId === t.id;

                          return (
                            <div
                              key={t.id}
                              style={todoItem}
                              draggable
                              onDragStart={() => onDragStart(t.id, dIso)}
                              onDragEnd={onDragEnd}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const drag = dragRef.current;
                                if (!drag?.id || !drag?.fromDate) return;

                                if (drag.fromDate === dIso) {
                                  reorderWithinDate(dIso, drag.id, t.id);
                                  dragRef.current = null;
                                  return;
                                }

                                moveToOtherDate(drag.fromDate, dIso, drag.id);
                                dragRef.current = null;
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {isEditing ? (
                                  <input
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    style={editInput}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit(dIso, t.id);
                                      if (e.key === "Escape") {
                                        setEditingId(null);
                                        setEditingText("");
                                      }
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <div style={todoTextWrap}>{t.text}</div>
                                )}
                              </div>

                              {isEditing ? (
                                <button type="button" style={{ ...btnPrimary, height: 30, padding: "0 10px" }} onClick={() => saveEdit(dIso, t.id)}>
                                  저장
                                </button>
                              ) : (
                                <IconButton title="수정" onClick={() => startEdit(t)}>
                                  <PencilIcon />
                                </IconButton>
                              )}

                              <IconButton title="삭제" danger onClick={() => deleteTodo(dIso, t.id)}>
                                <TrashIcon />
                              </IconButton>
                            </div>
                          );
                        })}

                        {/* 추가 입력 */}
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            value={todoDraftByDate[dIso] ?? ""}
                            onChange={(e) => setTodoDraftByDate((prev) => ({ ...prev, [dIso]: e.target.value }))}
                            placeholder="할 일 추가"
                            style={tinyInput}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") addTodo(dIso);
                            }}
                          />
                          <button type="button" style={{ ...btnPrimary, height: 34 }} onClick={() => addTodo(dIso)}>
                            추가
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 강의 링크 */}
        <div style={sectionTitle}>강의 링크 선택</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* 과정: 드롭다운 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 1000 }}>과정</div>

            <select
              value={courseId || ""}
              onChange={(e) => {
                const id = e.target.value || "";
                setCourseId(id);
                const found = courseOptions.find((c) => c.id === id);
                setCourseKey(found?.name || "");
              }}
              style={{ ...tinyInput, width: 300, appearance: "none" }}
              disabled={coursesLoading}
            >
              <option value="">{coursesLoading ? "불러오는 중…" : "과정 선택"}</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div style={{ fontSize: 11, color: COLORS.sub, fontWeight: 900, marginTop: 2 }}>
              {courseId ? `선택됨: ${courseKey}` : courseOptions.length ? "과정을 먼저 선택하세요" : "강의관리(lecture_courses)에 과정이 없어요"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 1000 }}>강의 입력</div>
            <input value={lectureInput} onChange={(e) => setLectureInput(e.target.value)} placeholder="예: OT, 1-2, 7" style={tinyInput} />
          </div>

          <button
            type="button"
            style={btnPrimary}
            onClick={addSelectedLectures}
            disabled={!String(courseKey || "").trim() || !String(lectureInput || "").trim()}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <PlusIcon /> 강의 추가
            </span>
          </button>

          <button type="button" style={btnDanger} onClick={clearSelectedLectures} disabled={!selectedLectureCount}>
            강의선택 초기화
          </button>
        </div>

        {lastAddedText ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(31,42,68,0.12)",
              background: "rgba(255,255,255,0.75)",
              color: COLORS.sub,
              fontWeight: 1000,
              whiteSpace: "pre-wrap",
            }}
          >
            {lastAddedText}
          </div>
        ) : null}

        {selectedLectureCount ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ color: COLORS.sub, fontSize: 12, fontWeight: 1000, marginBottom: 6 }}>
              선택된 강의: <b>{selectedLectureCount}</b>개 (버튼 클릭하면 제거)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedLectureGroups.map((g) => (
                <div
                  key={g.course_key}
                  style={{
                    border: `1px solid ${COLORS.lineSoft}`,
                    background: "rgba(255,255,255,0.65)",
                    borderRadius: 14,
                    padding: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 1000 }}>
                      과정: <span style={{ color: COLORS.blue }}>{g.course_key}</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>{(g.items || []).length}개</div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {(g.items || [])
                      .slice()
                      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                      .map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          title="클릭하면 선택에서 제거"
                          onClick={() => removeSelectedLecture(g.course_key, it.id)}
                          style={{
                            borderRadius: 999,
                            border: `1px solid rgba(31,42,68,0.14)`,
                            background: "rgba(90,167,255,0.12)",
                            padding: "6px 10px",
                            fontWeight: 1000,
                            cursor: "pointer",
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ color: COLORS.blue }}>[{g.course_key}]</span>
                          <span>{String(it.title || "").trim()}</span>
                          <span style={{ color: COLORS.sub, fontWeight: 900 }}>×</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* 자동 메시지 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={sectionTitle}>자동 메시지</div>

          <button type="button" style={btnPrimary} onClick={buildMessage}>
            메시지 생성
          </button>
        </div>

        <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} style={msgBox} placeholder="메시지 생성 버튼을 누르면 자동 생성됩니다." />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button type="button" style={btnPrimary} onClick={copyMessage} disabled={!messageText}>
            복사하기
          </button>
          {copied ? <div style={{ fontWeight: 1000, color: COLORS.blue }}>복사완료</div> : null}
        </div>
      </div>
    </div>
  );
}
