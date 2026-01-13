// src/pages/OneToOneSchedulePage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

const COLORS = {
  bg: "#f6f9ff",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "rgba(31,42,68,0.14)",
  lineSoft: "rgba(31,42,68,0.08)",
  white: "#ffffff",
  blueSoft: "#dcecff",
  redSoft: "#ffe3e3",
  yellowSoft: "#fff2c9",
};

const CLASS_MINUTES = 40;

// ✅ 겨울방학 고정 슬롯 적용 기간
const WINTER_FROM = "2026-01-12";
const WINTER_TO = "2026-02-28";

// ✅ 학기중 고정 슬롯
const TERM_SLOTS = ["15:20", "16:00", "16:40", "17:20", "18:00", "18:40", "19:20", "20:00", "20:40", "21:20"];

// ✅ 겨울방학 고정 슬롯
const WINTER_SLOTS = ["12:20", "13:00", "13:40", "14:20", "15:00", "15:40", "16:20", "17:00", "17:40", "18:20"];

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseISODate(iso) {
  const [y, m, d] = (iso || "").split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return new Date();
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function isoInRange(iso, fromIso, toIso) {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}
function toHHMM(timeStr) {
  const s = String(timeStr || "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return s;
}
function normalizeHHMM(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${pad2(parseInt(h, 10) || 0)}:${pad2(parseInt(m, 10) || 0)}`;
  }
  return s;
}
function parseHHMMToDate(isoDate, hhmm) {
  const [H, M] = (hhmm || "00:00").split(":").map((x) => parseInt(x, 10));
  const d = parseISODate(isoDate);
  d.setHours(Number.isFinite(H) ? H : 0);
  d.setMinutes(Number.isFinite(M) ? M : 0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}
function addMinutes(hhmm, mins) {
  const d = parseHHMMToDate("2000-01-01", hhmm);
  d.setMinutes(d.getMinutes() + mins);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function minutesDiff(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}
function hhmmFromISO(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function seasonForDate(iso) {
  const isWinter = isoInRange(iso, WINTER_FROM, WINTER_TO);
  return isWinter ? "winter" : "term";
}

function rowBg(r) {
  if (r?.attendance_status === "present") return COLORS.blueSoft;
  if (r?.attendance_status === "absent") return COLORS.redSoft;
  if (r?.event_kind === "makeup") return COLORS.yellowSoft;
  return "transparent";
}

function buildSummary(r, linkedMakeupClassTime) {
  if (!r) return null;

  if (r.attendance_status === "present") {
    const lateRaw = r.late_minutes;
    const hasLate = lateRaw !== null && lateRaw !== undefined;

    const late = hasLate ? Number(lateRaw) : null;
    const label =
      !hasLate || !Number.isFinite(late)
        ? "출석(지각분 미기록)"
        : late <= 0
          ? "정시 출석"
          : `${late}분 지각`;

    const at = r.attended_at ? hhmmFromISO(r.attended_at) : "";
    return { title: "출석", detail: `${label}${at ? ` · 체크 ${at}` : ""}` };
  }

  if (r.attendance_status === "absent") {
    const parts = [];
    if (r.absent_reason) parts.push(`사유: ${r.absent_reason}`);

    const md = r.makeup_date || null;
    const mt = (r.makeup_time || "").trim(); // 보강 테스트시간
    const mc = (r.makeup_class_time || linkedMakeupClassTime || "").trim(); // 보강 수업시간
    if (md && (mt || mc)) {
      const t = mt ? `테스트 ${mt}` : "";
      const c = mc ? `수업 ${mc}` : "";
      const mix = [t, c].filter(Boolean).join(" / ");
      parts.push(`보강: ${md}${mix ? ` (${mix})` : ""}`);
    }

    return { title: "결석", detail: parts.length ? parts.join(" · ") : "결석(상세 없음)" };
  }

  return null;
}

export default function OneToOneSchedulePage() {
  const nav = useNavigate();
  const { teacherName: teacherNameParam } = useParams();
  const teacherName = (teacherNameParam || "").trim() || "default";

  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [events, setEvents] = useState([]);

  const [openAbsent, setOpenAbsent] = useState({});
  const [absentDrafts, setAbsentDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  // ✅ 메모(drafts)
  const [memoDraftByEventId, setMemoDraftByEventId] = useState({});
  const [memoDraftBySlotStart, setMemoDraftBySlotStart] = useState({});
  const [memoSavingKey, setMemoSavingKey] = useState(null); // "e:<id>" | "s:<slot>"

  // ✅ 수동 보강 폼
  const [studentsList, setStudentsList] = useState([]);
  const [manualMakeup, setManualMakeup] = useState({
    studentName: "",
    studentId: "",
    makeupDate: "",
    makeupTestTime: "",
    makeupClassTime: "",
  });

  const fixedSlots = useMemo(() => {
    const isWinter = isoInRange(selectedDate, WINTER_FROM, WINTER_TO);
    return isWinter ? WINTER_SLOTS : TERM_SLOTS;
  }, [selectedDate]);

  const isWinter = isoInRange(selectedDate, WINTER_FROM, WINTER_TO);
  const season = isWinter ? "winter" : "term";

  // ✅ 학생 상세로 이동
  function goStudentDetail(studentId) {
    const id = String(studentId || "").trim();
    if (!id) return;
    nav(`/students/${id}`);
  }

  async function loadStudents() {
    setErr("");
    try {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, school, grade, teacher_name")
        .eq("teacher_name", teacherName)
        .order("name", { ascending: true });

      if (error) throw error;
      setStudentsList(data || []);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function load() {
    setLoading(true);
    setErr("");
    try {
      // ✅ 선생님별 필터 + ✅ 일대일 화면에서는 oto + oto_test + (makeup extra 중 schedule_kind='oto')만 보여야 함
      const { data, error } = await supabase
        .from("student_events")
        .select(
          `
          id,
          student_id,
          event_date,
          kind,
          start_time,
          season,
          schedule_kind,
          attendance_status,
          attended_at,
          late_minutes,
          absent_reason,
          makeup_date,
          makeup_time,
          makeup_class_time,
          original_event_id,
          makeup_event_id,
          event_kind,
          memo,
          students:students!inner (
            id,
            name,
            school,
            grade,
            teacher_name
          )
        `
        )
        .eq("event_date", selectedDate)
        .eq("students.teacher_name", teacherName)
        .or(
          [
            "kind.eq.oto_class",
            "kind.eq.oto_test",
            // ✅ 보강은 schedule_kind='oto'만 (섞임 방지)
            "and(kind.eq.extra,event_kind.eq.makeup,schedule_kind.eq.oto)",
          ].join(",")
        )
        .order("start_time", { ascending: true });

      if (error) throw error;
      setEvents(data || []);

      // 빈 슬롯 메모 로드
      const { data: sm, error: smErr } = await supabase
        .from("oto_slot_memos")
        .select("slot_start_time, memo")
        .eq("memo_date", selectedDate)
        .eq("season", season)
        .eq("teacher_name", teacherName);

      if (smErr) throw smErr;

      const slotMap = {};
      for (const row of sm || []) {
        const k = toHHMM(row.slot_start_time);
        if (!k) continue;
        slotMap[k] = row.memo || "";
      }

      setMemoDraftByEventId((prev) => {
        const next = { ...prev };
        for (const e of data || []) {
          if (next[e.id] === undefined) next[e.id] = e.memo || "";
        }
        return next;
      });

      setMemoDraftBySlotStart(() => slotMap);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherName]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, teacherName]);

  const testTimeByStudentId = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.kind === "oto_test") m.set(e.student_id, toHHMM(e.start_time));
    }
    return m;
  }, [events]);

  const classEvents = useMemo(() => {
    return (events || []).filter((e) => e.kind === "oto_class" || (e.kind === "extra" && e.event_kind === "makeup"));
  }, [events]);

  const classBySlot = useMemo(() => {
    const map = new Map();
    for (const e of classEvents) {
      const classHHMM = toHHMM(e.start_time);
      if (!classHHMM) continue;
      const arr = map.get(classHHMM) || [];
      arr.push(e);
      map.set(classHHMM, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.students?.name || "").localeCompare(b.students?.name || ""));
      map.set(k, arr);
    }
    return map;
  }, [classEvents]);

  const makeupClassTimeById = useMemo(() => {
    const m = new Map();
    for (const e of events) {
      if (e.kind === "extra" && e.event_kind === "makeup") m.set(e.id, toHHMM(e.start_time));
    }
    return m;
  }, [events]);

  function getAttendanceBaseHHMM(e) {
    // ✅ oto_class는 테스트시간 우선(없으면 수업시간)
    if (e.kind === "oto_class") return testTimeByStudentId.get(e.student_id) || toHHMM(e.start_time);

    // ✅ 보강은 makeup_time(테스트시간) 우선(없으면 수업시간)
    if (e.kind === "extra" && e.event_kind === "makeup") return (e.makeup_time || "").trim() || toHHMM(e.start_time);

    return toHHMM(e.start_time);
  }

  function ensureDraft(eventId, baseRow) {
    setAbsentDrafts((prev) => {
      if (prev[eventId]) return prev;
      return {
        ...prev,
        [eventId]: {
          reason: baseRow?.absent_reason || "",
          makeupDate: baseRow?.makeup_date || "",
          makeupTestTime: baseRow?.makeup_time || "",
          makeupClassTime: baseRow?.makeup_class_time || "",
        },
      };
    });
  }

  function setDraft(eventId, patch) {
    setAbsentDrafts((prev) => ({
      ...prev,
      [eventId]: { ...(prev[eventId] || {}), ...patch },
    }));
  }

  // ✅✅✅ FIX: 보강 출석처리 시 makeup_time/makeup_class_time 절대 지우지 않음
  async function markPresent(e) {
    setSavingId(e.id);
    setErr("");
    try {
      const now = new Date();
      const base = getAttendanceBaseHHMM(e);
      const scheduled = parseHHMMToDate(selectedDate, base || "00:00");
      const late = Math.max(0, minutesDiff(now, scheduled));

      const isMakeup = e.kind === "extra" && e.event_kind === "makeup";

      const payload = isMakeup
        ? {
            attendance_status: "present",
            attended_at: now.toISOString(),
            late_minutes: late,
            absent_reason: null,
            // ✅ 보강은 makeup_time/makeup_class_time 유지 (중요)
          }
        : {
            attendance_status: "present",
            attended_at: now.toISOString(),
            late_minutes: late,
            absent_reason: null,
            makeup_date: null,
            makeup_time: null,
            makeup_class_time: null,
          };

      const { error } = await supabase.from("student_events").update(payload).eq("id", e.id);

      if (error) throw error;
      await load();
    } catch (er) {
      setErr(er?.message || String(er));
    } finally {
      setSavingId(null);
    }
  }

  async function saveAbsent(e) {
    setSavingId(e.id);
    setErr("");
    try {
      const d = absentDrafts[e.id] || {};
      const reason = String(d.reason || "").trim();

      const makeupDate = String(d.makeupDate || "").trim();
      const makeupTestTime = normalizeHHMM(d.makeupTestTime);
      const makeupClassTime = normalizeHHMM(d.makeupClassTime);

      const wantsMakeup = !!(makeupDate && makeupTestTime && makeupClassTime);

      const { error: upErr } = await supabase
        .from("student_events")
        .update({
          attendance_status: "absent",
          attended_at: null,
          late_minutes: null,
          absent_reason: reason || null,
          makeup_date: makeupDate || null,
          makeup_time: makeupTestTime || null,
          makeup_class_time: makeupClassTime || null,
        })
        .eq("id", e.id);

      if (upErr) throw upErr;

      let existingMakeupId = e.makeup_event_id || null;

      if (!existingMakeupId) {
        const { data: ex, error: exErr } = await supabase
          .from("student_events")
          .select("id")
          .eq("original_event_id", e.id)
          .eq("kind", "extra")
          .eq("event_kind", "makeup")
          .maybeSingle();
        if (exErr) throw exErr;
        existingMakeupId = ex?.id || null;
      }

      if (wantsMakeup) {
        const payload = {
          student_id: e.student_id,
          event_date: makeupDate,
          kind: "extra",
          start_time: `${makeupClassTime}:00`,
          season: e.season,
          event_kind: "makeup",
          schedule_kind: "oto", // ✅ 강제
          original_event_id: e.id,
          makeup_time: makeupTestTime,
          attendance_status: null,
          attended_at: null,
          late_minutes: null,
          absent_reason: null,
          makeup_date: null,
          makeup_class_time: null,
        };

        if (existingMakeupId) {
          const { error: muErr } = await supabase.from("student_events").update(payload).eq("id", existingMakeupId);
          if (muErr) throw muErr;

          await supabase.from("student_events").update({ makeup_event_id: existingMakeupId }).eq("id", e.id);
        } else {
          const { data: inserted, error: insErr } = await supabase.from("student_events").insert(payload).select("id").single();
          if (insErr) throw insErr;

          const { error: linkErr } = await supabase.from("student_events").update({ makeup_event_id: inserted.id }).eq("id", e.id);
          if (linkErr) throw linkErr;
        }
      } else {
        if (existingMakeupId) {
          const { error: delErr } = await supabase.from("student_events").delete().eq("id", existingMakeupId);
          if (delErr) throw delErr;

          await supabase.from("student_events").update({ makeup_event_id: null }).eq("id", e.id);
        }
      }

      setOpenAbsent((prev) => ({ ...prev, [e.id]: false }));
      await load();
    } catch (er) {
      setErr(er?.message || String(er));
    } finally {
      setSavingId(null);
    }
  }

  async function resetAttendance(e) {
    setSavingId(e.id);
    setErr("");
    try {
      if (e.kind === "extra" && e.event_kind === "makeup") {
        if (e.original_event_id) {
          const { error: unlinkErr } = await supabase.from("student_events").update({ makeup_event_id: null }).eq("id", e.original_event_id);
          if (unlinkErr) throw unlinkErr;
        }

        const { error: delErr } = await supabase.from("student_events").delete().eq("id", e.id);
        if (delErr) throw delErr;

        await load();
        return;
      }

      const makeupId = e.makeup_event_id || null;
      if (makeupId) {
        const { error: delErr } = await supabase.from("student_events").delete().eq("id", makeupId);
        if (delErr) throw delErr;

        const { error: unlinkErr } = await supabase.from("student_events").update({ makeup_event_id: null }).eq("id", e.id);
        if (unlinkErr) throw unlinkErr;
      }

      const { error } = await supabase
        .from("student_events")
        .update({
          attendance_status: null,
          attended_at: null,
          late_minutes: null,
          absent_reason: null,
          makeup_date: null,
          makeup_time: null,
          makeup_class_time: null,
        })
        .eq("id", e.id);

      if (error) throw error;

      setOpenAbsent((prev) => ({ ...prev, [e.id]: false }));
      await load();
    } catch (er) {
      setErr(er?.message || String(er));
    } finally {
      setSavingId(null);
    }
  }

  // ✅ (그 날의 그 수업만) 삭제
  async function deleteOnlyThisEvent(e) {
    const label = `${selectedDate} ${toHHMM(e.start_time) || ""} ${e.students?.name || ""}`.trim();
    const ok = window.confirm(`이 수업을 삭제할까요?\n\n${label}\n\n※ 이 날짜 1회만 삭제됩니다.`);
    if (!ok) return;

    setSavingId(`del:${e.id}`);
    setErr("");
    try {
      // 1) 연결된 링크 정리
      if (e.kind === "oto_class") {
        const makeupId = e.makeup_event_id || null;
        if (makeupId) {
          // 연결된 보강이 있으면 보강 삭제 + 링크 해제
          const { error: delMuErr } = await supabase.from("student_events").delete().eq("id", makeupId);
          if (delMuErr) throw delMuErr;
        }
      }

      if (e.kind === "extra" && e.event_kind === "makeup") {
        // 보강(자체) 삭제라면 원수업 링크 해제
        if (e.original_event_id) {
          const { error: unlinkErr } = await supabase.from("student_events").update({ makeup_event_id: null }).eq("id", e.original_event_id);
          if (unlinkErr) throw unlinkErr;
        }
      }

      // 2) 본 이벤트 삭제
      const { error } = await supabase.from("student_events").delete().eq("id", e.id);
      if (error) throw error;

      // 3) UI draft 정리(선택)
      setOpenAbsent((prev) => {
        const n = { ...prev };
        delete n[e.id];
        return n;
      });
      setAbsentDrafts((prev) => {
        const n = { ...prev };
        delete n[e.id];
        return n;
      });
      setMemoDraftByEventId((prev) => {
        const n = { ...prev };
        delete n[e.id];
        return n;
      });

      await load();
    } catch (er) {
      setErr(er?.message || String(er));
    } finally {
      setSavingId(null);
    }
  }

  async function saveEventMemo(eventId) {
    const key = `e:${eventId}`;
    setMemoSavingKey(key);
    setErr("");
    try {
      const raw = memoDraftByEventId[eventId] ?? "";
      const memo = String(raw).trim();

      const { error } = await supabase.from("student_events").update({ memo: memo ? memo : null }).eq("id", eventId);
      if (error) throw error;
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setMemoSavingKey(null);
    }
  }

  async function saveSlotMemo(slotStart) {
    const key = `s:${slotStart}`;
    setMemoSavingKey(key);
    setErr("");
    try {
      const raw = memoDraftBySlotStart[slotStart] ?? "";
      const memo = String(raw).trim();
      const slotTime = `${slotStart}:00`;

      if (!memo) {
        const { error } = await supabase
          .from("oto_slot_memos")
          .delete()
          .eq("memo_date", selectedDate)
          .eq("season", season)
          .eq("teacher_name", teacherName)
          .eq("slot_start_time", slotTime);

        if (error) throw error;
        return;
      }

      const { error } = await supabase.from("oto_slot_memos").upsert(
        {
          memo_date: selectedDate,
          season,
          teacher_name: teacherName,
          slot_start_time: slotTime,
          memo,
        },
        { onConflict: "memo_date,season,teacher_name,slot_start_time" }
      );

      if (error) throw error;
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setMemoSavingKey(null);
    }
  }

  // ✅ 수동 보강 추가 (일대일 화면이므로 schedule_kind='oto' 강제)
  async function addManualMakeup() {
    setErr("");
    const name = String(manualMakeup.studentName || "").trim();
    const sid = String(manualMakeup.studentId || "").trim();
    const makeupDate = String(manualMakeup.makeupDate || "").trim();
    const makeupTestTime = normalizeHHMM(manualMakeup.makeupTestTime);
    const makeupClassTime = normalizeHHMM(manualMakeup.makeupClassTime);

    if (!name && !sid) {
      setErr("수동 보강: 학생 이름을 입력(또는 선택)해주세요.");
      return;
    }
    if (!makeupDate) {
      setErr("수동 보강: 보강일을 선택해주세요.");
      return;
    }
    if (!makeupTestTime || !/^\d{2}:\d{2}$/.test(makeupTestTime)) {
      setErr("수동 보강: 보강 테스트시간을 HH:MM 형식으로 입력해주세요. (예: 15:50)");
      return;
    }
    if (!makeupClassTime || !/^\d{2}:\d{2}$/.test(makeupClassTime)) {
      setErr("수동 보강: 보강 수업시간을 HH:MM 형식으로 입력해주세요. (예: 16:00)");
      return;
    }

    // 이름으로만 입력했을 때 id 매칭(동명이인 가능성은 있지만 현재 UX 우선)
    let studentId = sid;
    if (!studentId && name) {
      const found = (studentsList || []).find((s) => String(s.name || "").trim() === name);
      studentId = found?.id || "";
    }
    if (!studentId) {
      setErr("수동 보강: 학생을 찾지 못했습니다. 목록에서 선택하거나 정확한 이름으로 입력해주세요.");
      return;
    }

    setSavingId("manualMakeup");
    try {
      const payload = {
        student_id: studentId,
        event_date: makeupDate,
        kind: "extra",
        start_time: `${makeupClassTime}:00`,
        season: seasonForDate(makeupDate),
        event_kind: "makeup",
        schedule_kind: "oto", // ✅ 강제 (핵심)
        original_event_id: null, // ✅ 결석과 무관한 수동 보강
        makeup_time: makeupTestTime, // ✅ 보강 출석 기준(테스트 시간)
        attendance_status: null,
        attended_at: null,
        late_minutes: null,
        absent_reason: null,
        makeup_date: null,
        makeup_class_time: null,
      };

      const { error } = await supabase.from("student_events").insert(payload);
      if (error) throw error;

      setManualMakeup({
        studentName: "",
        studentId: "",
        makeupDate: "",
        makeupTestTime: "",
        makeupClassTime: "",
      });

      // 보강이 다른 날짜일 수 있으니: 현재 날짜면 reload 해서 바로 보이게
      if (makeupDate === selectedDate) await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingId(null);
    }
  }

  const slotRows = useMemo(() => {
    return fixedSlots.map((slotStart) => {
      const slotEnd = addMinutes(slotStart, CLASS_MINUTES);
      const list = classBySlot.get(slotStart) || [];
      return { slotStart, slotEnd, events: list };
    });
  }, [fixedSlots, classBySlot]);

  const container = { minHeight: "100vh", background: COLORS.bg, color: COLORS.text };
  const wrap = { maxWidth: 1280, margin: "0 auto", padding: "22px 16px 42px" };

  const btnBase = {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnPrimary = { ...btnBase, background: "rgba(90,167,255,0.12)", border: "1px solid rgba(90,167,255,0.55)" };
  const btnDanger = { ...btnBase, background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.45)" };
  const btnGhost = { ...btnBase, background: "rgba(255,255,255,0.75)" };

  const tableStyle = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
  const thStyle = {
    textAlign: "center",
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 900,
    padding: "8px 8px",
    borderBottom: `1px solid ${COLORS.line}`,
  };
  const tdStyle = {
    padding: "8px 8px",
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    verticalAlign: "middle",
    fontSize: 13,
    color: COLORS.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const memoMiniStyle = {
    width: "100%",
    height: 32,
    minHeight: 32,
    maxHeight: 96,
    resize: "vertical",
    overflow: "auto",
    padding: "7px 10px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 800,
    fontSize: 13,
    lineHeight: "18px",
    outline: "none",
  };

  // ✅ 학생 이름 링크 스타일(파란색 + 밑줄)
  const nameLinkStyle = {
    color: "#1f6feb",
    textDecoration: "underline",
    textUnderlineOffset: 3,
    cursor: "pointer",
    fontWeight: 1000,
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
  };

  const formInputStyle = {
    height: 36,
    padding: "0 10px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    fontWeight: 900,
    color: COLORS.text,
    outline: "none",
  };

  return (
    <div style={container}>
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: -0.3 }}>일대일 시간표</div>
            <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 13 }}>
              수업 없는 슬롯도 빈칸 유지 · <span style={{ fontWeight: 900 }}>{isWinter ? "겨울방학 슬롯" : "학기중 슬롯"}</span>
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 900, color: COLORS.sub }}>(선생님: {teacherName})</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" style={btnGhost} onClick={() => setSelectedDate(toISODate(new Date()))}>
              오늘
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: 12,
                border: `1px solid ${COLORS.line}`,
                background: COLORS.white,
                color: COLORS.text,
                fontWeight: 900,
              }}
            />
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

        <div style={{ marginTop: 14 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 140 }}>시간</th>
                <th style={{ ...thStyle, width: 160 }}>학생</th>
                <th style={{ ...thStyle, width: 160 }}>학교</th>
                <th style={{ ...thStyle, width: 90 }}>학년</th>
                <th style={{ ...thStyle, width: 360 }}>출결</th>
                <th style={{ ...thStyle, width: 90 }}>초기화</th>
                <th style={{ ...thStyle, width: 90 }}>삭제</th>
                <th style={{ ...thStyle, width: 260 }}>메모</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, padding: "14px 10px", color: COLORS.sub, textAlign: "center" }}>
                    불러오는 중…
                  </td>
                </tr>
              ) : (
                slotRows.map((slot) => {
                  if (!slot.events.length) {
                    const slotMemoVal = memoDraftBySlotStart[slot.slotStart] ?? "";
                    const saving = memoSavingKey === `s:${slot.slotStart}`;

                    return (
                      <tr key={`slot-${slot.slotStart}`}>
                        <td style={{ ...tdStyle, fontWeight: 1000, textAlign: "center" }}>
                          {slot.slotStart}-{slot.slotEnd}
                        </td>
                        <td style={{ ...tdStyle, color: COLORS.sub, textAlign: "center" }}>-</td>
                        <td style={{ ...tdStyle, color: COLORS.sub, textAlign: "center" }}>-</td>
                        <td style={{ ...tdStyle, color: COLORS.sub, textAlign: "center" }}>-</td>
                        <td style={{ ...tdStyle, color: COLORS.sub }} />
                        <td style={{ ...tdStyle, color: COLORS.sub }} />
                        <td style={{ ...tdStyle, color: COLORS.sub }} />
                        <td style={tdStyle}>
                          <textarea
                            value={slotMemoVal}
                            onChange={(ev) =>
                              setMemoDraftBySlotStart((prev) => ({
                                ...prev,
                                [slot.slotStart]: ev.target.value,
                              }))
                            }
                            onBlur={() => saveSlotMemo(slot.slotStart)}
                            placeholder="(빈 슬롯 메모)"
                            rows={1}
                            style={{ ...memoMiniStyle, opacity: saving ? 0.75 : 1 }}
                            disabled={saving}
                          />
                        </td>
                      </tr>
                    );
                  }

                  return slot.events.map((e, idx) => {
                    const st = e.students || {};
                    const bg = rowBg(e);

                    const isDone = e.attendance_status === "present" || e.attendance_status === "absent";
                    const isAbsentOpen = !!openAbsent[e.id];
                    const draft = absentDrafts[e.id] || {};

                    const linkedMakeupClassTime = e.makeup_event_id ? makeupClassTimeById.get(e.makeup_event_id) || "" : "";
                    const summary = buildSummary(e, linkedMakeupClassTime);

                    const memoVal = memoDraftByEventId[e.id] ?? (e.memo || "");
                    const memoSaving = memoSavingKey === `e:${e.id}`;

                    const deleting = savingId === `del:${e.id}`;

                    return (
                      <tr key={e.id} style={{ background: bg }}>
                        <td style={{ ...tdStyle, fontWeight: 1000, textAlign: "center" }}>
                          {idx === 0 ? `${slot.slotStart}-${slot.slotEnd}` : ""}
                          {e.event_kind === "makeup" ? (
                            <div style={{ marginTop: 2, fontSize: 11, color: COLORS.sub, fontWeight: 900 }}>보강</div>
                          ) : null}
                        </td>

                        {/* ✅ 학생 이름: 파란색 + 밑줄 + 클릭 시 학생 상세로 이동 */}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {st.name ? (
                            <button
                              type="button"
                              style={nameLinkStyle}
                              onClick={() => goStudentDetail(e.student_id)}
                              title="학생 상세 페이지로 이동"
                            >
                              {st.name}
                            </button>
                          ) : (
                            <span style={{ color: COLORS.sub, fontWeight: 900 }}>-</span>
                          )}
                        </td>

                        <td style={{ ...tdStyle, textAlign: "center", color: COLORS.sub, fontWeight: 800 }}>{st.school || "-"}</td>
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 900, color: COLORS.sub }}>{st.grade || "-"}</td>

                        <td style={tdStyle}>
                          {isDone && !isAbsentOpen ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                              <div style={{ fontWeight: 1000 }}>{summary?.title}</div>
                              <div style={{ color: COLORS.sub, fontSize: 12, lineHeight: 1.25, textAlign: "center" }}>{summary?.detail}</div>
                            </div>
                          ) : null}

                          {!isDone && !isAbsentOpen ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" style={btnPrimary} onClick={() => markPresent(e)} disabled={savingId === e.id}>
                                출석
                              </button>

                              <button
                                type="button"
                                style={btnDanger}
                                onClick={() => {
                                  ensureDraft(e.id, e);
                                  setOpenAbsent((prev) => ({ ...prev, [e.id]: true }));
                                }}
                                disabled={savingId === e.id}
                              >
                                결석
                              </button>

                              <div style={{ color: COLORS.sub, fontSize: 12, fontWeight: 800 }}>출석기준: {getAttendanceBaseHHMM(e) || "-"}</div>
                            </div>
                          ) : null}

                          {isAbsentOpen ? (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                              <textarea
                                value={draft.reason ?? ""}
                                onChange={(ev) => setDraft(e.id, { reason: ev.target.value })}
                                placeholder="결석사유"
                                rows={2}
                                style={{
                                  width: "100%",
                                  resize: "vertical",
                                  padding: "10px 10px",
                                  borderRadius: 12,
                                  border: `1px solid ${COLORS.line}`,
                                  background: COLORS.white,
                                  color: COLORS.text,
                                  fontWeight: 800,
                                }}
                              />

                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강일</div>
                                  <input
                                    type="date"
                                    value={draft.makeupDate ?? ""}
                                    onChange={(ev) => setDraft(e.id, { makeupDate: ev.target.value })}
                                    style={{
                                      height: 36,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      border: `1px solid ${COLORS.line}`,
                                      background: COLORS.white,
                                      fontWeight: 900,
                                    }}
                                  />
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강 테스트시간(HH:MM)</div>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="예: 15:50"
                                    value={draft.makeupTestTime ?? ""}
                                    onChange={(ev) => setDraft(e.id, { makeupTestTime: ev.target.value })}
                                    style={{
                                      height: 36,
                                      width: 150,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      border: `1px solid ${COLORS.line}`,
                                      background: COLORS.white,
                                      fontWeight: 900,
                                    }}
                                  />
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강 수업시간(HH:MM)</div>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="예: 16:00"
                                    value={draft.makeupClassTime ?? ""}
                                    onChange={(ev) => setDraft(e.id, { makeupClassTime: ev.target.value })}
                                    style={{
                                      height: 36,
                                      width: 150,
                                      padding: "0 10px",
                                      borderRadius: 12,
                                      border: `1px solid ${COLORS.line}`,
                                      background: COLORS.white,
                                      fontWeight: 900,
                                    }}
                                  />
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                                <button type="button" style={btnDanger} onClick={() => saveAbsent(e)} disabled={savingId === e.id}>
                                  저장
                                </button>

                                <button
                                  type="button"
                                  style={btnGhost}
                                  onClick={() => setOpenAbsent((prev) => ({ ...prev, [e.id]: false }))}
                                  disabled={savingId === e.id}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>

                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <button type="button" style={btnGhost} onClick={() => resetAttendance(e)} disabled={savingId === e.id}>
                            초기화
                          </button>
                        </td>

                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <button type="button" style={btnDanger} onClick={() => deleteOnlyThisEvent(e)} disabled={deleting}>
                            삭제
                          </button>
                        </td>

                        <td style={tdStyle}>
                          <textarea
                            value={memoVal}
                            onChange={(ev) =>
                              setMemoDraftByEventId((prev) => ({
                                ...prev,
                                [e.id]: ev.target.value,
                              }))
                            }
                            onBlur={() => saveEventMemo(e.id)}
                            placeholder="메모"
                            rows={1}
                            style={{ ...memoMiniStyle, opacity: memoSaving ? 0.75 : 1 }}
                            disabled={memoSaving}
                          />
                        </td>
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 10, color: COLORS.sub, fontSize: 12, lineHeight: 1.45 }}>
            · 겨울방학 슬롯 적용 기간:{" "}
            <b>
              {WINTER_FROM} ~ {WINTER_TO}
            </b>
            <br />· 원수업(oto_class) 초기화 → 연결된 보강도 함께 삭제됨
            <br />· 삭제 버튼 → 해당 날짜의 해당 이벤트 1개만 삭제됨
            <br />· 수동 보강/자동 보강 모두 <b>schedule_kind='oto'</b>로 강제 저장됨 (독해 시간표와 섞임 방지)
          </div>

          {/* ✅ 수동 보강 추가 폼 */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${COLORS.lineSoft}` }}>
            <div style={{ fontSize: 16, fontWeight: 1000, letterSpacing: -0.2 }}>수동 보강 추가</div>
            <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 12, lineHeight: 1.45 }}>
              결석이 없어도 보강(추가 수업)을 직접 등록할 수 있어요. (표에는 <b>보강일</b>에 들어가면 노란색으로 표시됩니다)
              <br />
              • 이 화면에서 추가한 보강은 자동으로 <b>일대일(oto)</b> 보강으로 저장돼요.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>학생 이름</div>

                <input
                  list="oto-students-datalist"
                  value={manualMakeup.studentName}
                  onChange={(e) => {
                    const v = e.target.value;
                    // datalist로 선택하면 name만 들어오므로 id를 같이 추적
                    const found = (studentsList || []).find((s) => String(s.name || "").trim() === String(v || "").trim());
                    setManualMakeup((prev) => ({
                      ...prev,
                      studentName: v,
                      studentId: found?.id || prev.studentId || "",
                    }));
                  }}
                  placeholder="학생 이름 입력/선택"
                  style={{ ...formInputStyle, width: 220 }}
                />
                <datalist id="oto-students-datalist">
                  {(studentsList || []).map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.school || ""} {s.grade || ""}
                    </option>
                  ))}
                </datalist>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강일</div>
                <input
                  type="date"
                  value={manualMakeup.makeupDate}
                  onChange={(e) => setManualMakeup((prev) => ({ ...prev, makeupDate: e.target.value }))}
                  style={{ ...formInputStyle, width: 160 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강 테스트시간(HH:MM)</div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 15:50"
                  value={manualMakeup.makeupTestTime}
                  onChange={(e) => setManualMakeup((prev) => ({ ...prev, makeupTestTime: e.target.value }))}
                  style={{ ...formInputStyle, width: 170 }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 900 }}>보강 수업시간(HH:MM)</div>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 16:00"
                  value={manualMakeup.makeupClassTime}
                  onChange={(e) => setManualMakeup((prev) => ({ ...prev, makeupClassTime: e.target.value }))}
                  style={{ ...formInputStyle, width: 170 }}
                />
              </div>

              <button type="button" style={btnPrimary} onClick={addManualMakeup} disabled={savingId === "manualMakeup"}>
                보강 추가
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
