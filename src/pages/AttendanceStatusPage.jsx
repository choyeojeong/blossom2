// src/pages/AttendanceStatusPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "rgba(31,42,68,0.14)",
  lineSoft: "rgba(31,42,68,0.08)",
  white: "#ffffff",

  blueSoft: "#dcecff", // 출석
  redSoft: "#ffe3e3", // 결석
  yellowSoft: "#fff2c9", // 보강(미처리)
  greenHead: "rgba(90, 200, 140, 0.22)", // 날짜 헤더(연초록)
  greenHeadBd: "rgba(90, 200, 140, 0.45)",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function firstDayOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function lastDayOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addMonths(d, delta) {
  const x = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function toHHMM(timeStr) {
  const s = String(timeStr || "").trim();
  if (!s) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return s;
}
function hhmmFromISO(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function kindLabel(e) {
  // e.kind: oto_class | oto_test | reading | extra
  if (!e) return "-";

  // ✅ 보강이면: 일대일보강 / 독해보강 표시
  const isMakeup = e.kind === "extra" && e.event_kind === "makeup";
  if (isMakeup) {
    // 원결석 종류를 저장해둔 컬럼이 제일 정확
    const sk = String(e.schedule_kind || "").toLowerCase().trim();

    // schedule_kind: "oto_class" | "reading" | "extra" ... (프로젝트에서 쓰는 값 기준)
    if (sk === "oto" || sk === "oto_class" || sk === "one_to_one") return "일대일보강";
    if (sk === "reading") return "독해보강";

    // fallback: 수동/구버전 데이터는 schedule_kind가 비어있을 수 있음
    const ok = String(e.__original_kind || "").toLowerCase().trim();
    if (ok === "oto_class") return "일대일보강";
    if (ok === "reading") return "독해보강";

    return "보강";
  }

  if (e.kind === "oto_class") return "일대일";
  if (e.kind === "reading") return "독해";
  if (e.kind === "extra") return "추가등원";
  if (e.kind === "oto_test") return "테스트";
  return e.kind || "-";
}

function rowBg(e) {
  if (!e) return "transparent";

  // 보강은 미처리일 때만 노랑, 처리되면 출석/결석 색을 따른다.
  const isMakeup = e.kind === "extra" && e.event_kind === "makeup";
  if (e.attendance_status === "present") return COLORS.blueSoft;
  if (e.attendance_status === "absent") return COLORS.redSoft;
  if (isMakeup) return COLORS.yellowSoft;
  return "transparent";
}

function statusLabel(e) {
  if (!e) return "-";
  if (e.attendance_status === "present") return "출석";
  if (e.attendance_status === "absent") return "결석";
  return "미처리";
}

function punctualLabel(e) {
  if (!e) return "";
  if (e.attendance_status !== "present") return "";

  // ✅ late_minutes가 null이어도 0으로 취급되지 않게
  const hasLate = e.late_minutes !== null && e.late_minutes !== undefined;
  const lateNum = hasLate ? Number(e.late_minutes) : null;

  const at = e.attended_at ? hhmmFromISO(e.attended_at) : "";

  if (!hasLate || !Number.isFinite(lateNum)) {
    return `지각분 미기록${at ? ` · 체크 ${at}` : ""}`;
  }
  if (lateNum <= 0) return `정시 출석${at ? ` · 체크 ${at}` : ""}`;
  return `${lateNum}분 지각${at ? ` · 체크 ${at}` : ""}`;
}

function formatDateHeader(iso) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const w = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  return `${m}.${d} (${w})`;
}

export default function AttendanceStatusPage() {
  // ✅ 기본: 오늘 기준 현재 달
  const [monthCursor, setMonthCursor] = useState(() => firstDayOfMonth(new Date()));
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [events, setEvents] = useState([]); // month + linked rows
  const [collapsedByDate, setCollapsedByDate] = useState({}); // iso -> boolean (true면 접힘)

  // ✅ 추가등원 출결 입력용(이 화면에서만)
  const [absentDraftById, setAbsentDraftById] = useState({}); // { [eventId]: string }
  const [savingById, setSavingById] = useState({}); // { [eventId]: boolean }

  const monthStart = useMemo(() => toISODate(firstDayOfMonth(monthCursor)), [monthCursor]);
  const monthEnd = useMemo(() => toISODate(lastDayOfMonth(monthCursor)), [monthCursor]);
  const monthTitle = useMemo(() => `${monthCursor.getFullYear()}년 ${monthCursor.getMonth() + 1}월`, [monthCursor]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      // 1) 월 이벤트 로드
      const { data: base, error } = await supabase
        .from("student_events")
        .select(
          `
          id,
          student_id,
          event_date,
          kind,
          start_time,
          season,
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
          schedule_kind,
          memo,
          students:students (
            id,
            name,
            school,
            grade,
            teacher_name
          )
        `
        )
        .gte("event_date", monthStart)
        .lte("event_date", monthEnd)
        .in("kind", ["oto_class", "oto_test", "reading", "extra"])
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const baseRows = base || [];

      // 2) 링크된 원결석/보강 이벤트가 월 밖에 있을 수도 있으니, 필요한 것만 추가로 로드
      const haveIds = new Set(baseRows.map((r) => r.id));
      const needIds = new Set();

      for (const r of baseRows) {
        if (r?.original_event_id && !haveIds.has(r.original_event_id)) needIds.add(r.original_event_id);
        if (r?.makeup_event_id && !haveIds.has(r.makeup_event_id)) needIds.add(r.makeup_event_id);
      }

      let extraRows = [];
      if (needIds.size > 0) {
        const ids = Array.from(needIds);
        const { data: linked, error: lerr } = await supabase
          .from("student_events")
          .select(
            `
            id,
            student_id,
            event_date,
            kind,
            start_time,
            season,
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
            schedule_kind,
            memo,
            students:students (
              id,
              name,
              school,
              grade,
              teacher_name
            )
          `
          )
          .in("id", ids);

        if (lerr) throw lerr;
        extraRows = linked || [];
      }

      const all = [...baseRows, ...extraRows];

      // 3) 날짜 접힘 상태 초기화: "기본은 접힘"
      const datesInMonth = new Set(baseRows.map((r) => r.event_date));
      setCollapsedByDate((prev) => {
        const next = { ...prev };
        for (const d of datesInMonth) {
          if (next[d] === undefined) next[d] = true; // 기본 접힘
        }
        return next;
      });

      // ✅ 추가등원 결석사유 draft 초기화(이미 입력돼있으면 그 값)
      setAbsentDraftById((prev) => {
        const next = { ...prev };
        for (const r of all) {
          const isExtraNormal = r.kind === "extra" && String(r.event_kind || "").toLowerCase() !== "makeup";
          if (!isExtraNormal) continue;
          if (next[r.id] === undefined) next[r.id] = (r.absent_reason || "").trim();
        }
        return next;
      });

      setEvents(all);
    } catch (e) {
      setErr(e?.message || String(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  // ✅ 조회 편의: id -> event
  const byId = useMemo(() => {
    const m = new Map();
    for (const r of events) m.set(r.id, r);
    return m;
  }, [events]);

  // ✅ 일대일 테스트시간 매핑: (student_id + event_date + season) -> HH:MM
  const testTimeKeyMap = useMemo(() => {
    const m = new Map();
    for (const r of events) {
      if (r.kind !== "oto_test") continue;
      const key = `${r.student_id}__${r.event_date}__${r.season}`;
      m.set(key, toHHMM(r.start_time));
    }
    return m;
  }, [events]);

  // ✅ 이 화면에서 "추가등원(보강 제외)"만 출결 처리
  function isExtraNormal(raw) {
    return raw?.kind === "extra" && String(raw?.event_kind || "").toLowerCase() !== "makeup";
  }

  async function markExtraPresent(eventId) {
    setErr("");
    if (!eventId) return;

    setSavingById((p) => ({ ...p, [eventId]: true }));
    try {
      const nowIso = new Date().toISOString();

      // ✅ 출석: present + attended_at 기록, 결석사유 제거
      // ✅ DB 체크제약: present면 late_minutes가 NULL이면 안 됨 → 0으로 저장
      const { error } = await supabase
        .from("student_events")
        .update({
          attendance_status: "present",
          attended_at: nowIso,
          late_minutes: 0, // ✅ FIX: 제약 통과
          absent_reason: null,
        })
        .eq("id", eventId);

      if (error) throw error;

      // UI 반영
      setEvents((prev) =>
        prev.map((r) =>
          r.id === eventId
            ? { ...r, attendance_status: "present", attended_at: nowIso, late_minutes: 0, absent_reason: null }
            : r
        )
      );
      setAbsentDraftById((p) => ({ ...p, [eventId]: "" }));
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingById((p) => ({ ...p, [eventId]: false }));
    }
  }

  async function markExtraAbsent(eventId) {
    setErr("");
    if (!eventId) return;

    const reason = String(absentDraftById[eventId] || "").trim();
    if (!reason) {
      setErr("추가등원 결석 처리 시 결석 사유를 입력해주세요.");
      return;
    }

    setSavingById((p) => ({ ...p, [eventId]: true }));
    try {
      // ✅ 결석: absent + absent_reason 기록, attended_at 제거
      const { error } = await supabase
        .from("student_events")
        .update({
          attendance_status: "absent",
          absent_reason: reason,
          attended_at: null,
          late_minutes: null,
        })
        .eq("id", eventId);

      if (error) throw error;

      // UI 반영
      setEvents((prev) =>
        prev.map((r) =>
          r.id === eventId
            ? { ...r, attendance_status: "absent", absent_reason: reason, attended_at: null, late_minutes: null }
            : r
        )
      );
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingById((p) => ({ ...p, [eventId]: false }));
    }
  }

  // ✅ 화면에 보여줄 row 만들기
  const visibleRows = useMemo(() => {
    const nameQ = (q || "").trim().toLowerCase();

    const monthOnly = events.filter((r) => r.event_date >= monthStart && r.event_date <= monthEnd);

    const rows = monthOnly
      .filter((r) => r.kind !== "oto_test")
      .filter((r) => {
        if (!nameQ) return true;
        const nm = (r.students?.name || "").toLowerCase();
        return nm.includes(nameQ);
      })
      .map((r) => {
        const st = r.students || {};

        const isMakeup = r.kind === "extra" && r.event_kind === "makeup";

        // 원결석/보강 정보
        const original = r.original_event_id ? byId.get(r.original_event_id) : null;
        const makeup = r.makeup_event_id ? byId.get(r.makeup_event_id) : null;

        // ✅ 보강 종류 fallback용: 원결석 kind를 raw에 붙여줌
        const rawForLabel = isMakeup ? { ...r, __original_kind: original?.kind || "" } : r;

        const type = kindLabel(rawForLabel);

        // 일대일 테스트시간(작게)
        let testHH = "";
        if (r.kind === "oto_class") {
          const key = `${r.student_id}__${r.event_date}__${r.season}`;
          testHH = testTimeKeyMap.get(key) || "";
        }

        // 시간(정렬 기준도 start_time)
        const startHH = toHHMM(r.start_time);

        // 보강일정보(원결석 row에서)
        let makeupInfo = "";
        if (makeup) {
          const md = makeup.event_date;
          const mt = (makeup.makeup_time || "").trim(); // 보강 테스트 기준
          const mc = toHHMM(makeup.start_time); // 보강 수업시간
          const mix = [mt ? `테스트 ${mt}` : "", mc ? `수업 ${mc}` : ""].filter(Boolean).join(" / ");
          makeupInfo = `보강: ${md}${mix ? ` (${mix})` : ""}`;
        }

        // 원결석일정보(보강 row에서)
        let originalInfo = "";
        if (original) {
          const od = original.event_date;
          const oc = toHHMM(original.start_time);
          originalInfo = `원결석: ${od}${oc ? ` (${oc})` : ""}`;
        }

        const absentReason = (r.absent_reason || "").trim();
        const punctual = punctualLabel(r);

        return {
          id: r.id,
          event_date: r.event_date,
          sort_time: startHH || "00:00",
          raw: rawForLabel, // ✅ label 계산에 원결석kind 포함
          st,
          type,
          isMakeup,
          isExtraNormal: isExtraNormal(r), // ✅ 추가등원(보강 제외) 여부
          startHH,
          testHH,
          status: statusLabel(r),
          absentReason,
          makeupInfo,
          originalInfo,
          punctual,
        };
      });

    rows.sort((a, b) => {
      if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
      if (a.sort_time !== b.sort_time) return a.sort_time < b.sort_time ? -1 : 1;
      const an = (a.st?.name || "").localeCompare(b.st?.name || "");
      return an;
    });

    return rows;
  }, [events, monthStart, monthEnd, q, byId, testTimeKeyMap]);

  // ✅ 날짜별 그룹핑
  const grouped = useMemo(() => {
    const g = new Map(); // date -> rows[]
    for (const r of visibleRows) {
      const arr = g.get(r.event_date) || [];
      arr.push(r);
      g.set(r.event_date, arr);
    }
    const dates = Array.from(g.keys()).sort((a, b) => (a < b ? -1 : 1));
    return { g, dates };
  }, [visibleRows]);

  const container = {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 55%, ${COLORS.bgBottom} 100%)`,
    color: COLORS.text,
  };
  const wrap = { maxWidth: 1400, margin: "0 auto", padding: "22px 16px 46px" };

  const btnBase = {
    height: 34,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const btnGhost = { ...btnBase, background: "rgba(255,255,255,0.75)" };

  const inputStyle = {
    height: 36,
    padding: "0 12px",
    borderRadius: 14,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    color: COLORS.text,
    fontWeight: 900,
    outline: "none",
    minWidth: 240,
  };

  const tableWrap = {
    width: "100%",
    overflowX: "auto",
    borderTop: `1px solid ${COLORS.line}`,
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    minWidth: 1400,
  };

  const thStyle = {
    textAlign: "center",
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 1000,
    padding: "10px 8px",
    borderBottom: `1px solid ${COLORS.line}`,
    background: "rgba(255,255,255,0.55)",
    position: "sticky",
    top: 0,
    zIndex: 2,
    backdropFilter: "blur(6px)",
  };

  const tdStyle = {
    padding: "10px 8px",
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    verticalAlign: "middle",
    fontSize: 13,
    color: COLORS.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const dateHeaderStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: `1px solid ${COLORS.greenHeadBd}`,
    background: COLORS.greenHead,
    cursor: "pointer",
    userSelect: "none",
  };

  const smallBtn = {
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: "rgba(255,255,255,0.9)",
    fontWeight: 1000,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const smallBtnBlue = { ...smallBtn, background: "rgba(90,167,255,0.14)", border: "1px solid rgba(90,167,255,0.55)" };
  const smallBtnRed = { ...smallBtn, background: "rgba(255,99,99,0.12)", border: "1px solid rgba(255,99,99,0.45)", color: "#b00020" };

  const reasonInput = {
    width: "100%",
    height: 32,
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    padding: "0 10px",
    fontWeight: 900,
    outline: "none",
  };

  return (
    <div style={container}>
      <div style={wrap}>
        {/* 상단 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 1000, letterSpacing: -0.3 }}>출결현황</div>
            <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 13 }}>
              월별 · 날짜별 묶음 · 시간순 정렬 · 검색 시 해당 학생만 표시
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => setMonthCursor((p) => addMonths(p, -1))}>
              ←
            </button>
            <div style={{ fontWeight: 1000, minWidth: 140, textAlign: "center" }}>{monthTitle}</div>
            <button type="button" style={btnGhost} onClick={() => setMonthCursor((p) => addMonths(p, +1))}>
              →
            </button>

            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 이름 검색" style={inputStyle} />

            <button type="button" style={btnGhost} onClick={() => setMonthCursor(firstDayOfMonth(new Date()))}>
              이번 달
            </button>
          </div>
        </div>

        {/* 오류 */}
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

        {/* 본문 */}
        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ color: COLORS.sub, fontWeight: 900, padding: "14px 6px" }}>불러오는 중…</div>
          ) : grouped.dates.length === 0 ? (
            <div style={{ color: COLORS.sub, fontWeight: 900, padding: "14px 6px" }}>해당 월에 표시할 데이터가 없어요.</div>
          ) : (
            grouped.dates.map((dateIso) => {
              const isCollapsed = collapsedByDate[dateIso] !== false; // default true
              const rows = grouped.g.get(dateIso) || [];

              return (
                <div key={dateIso} style={{ marginBottom: 14 }}>
                  {/* 날짜 헤더 */}
                  <div
                    style={dateHeaderStyle}
                    onClick={() =>
                      setCollapsedByDate((prev) => ({
                        ...prev,
                        [dateIso]: !isCollapsed,
                      }))
                    }
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 1000 }}>{formatDateHeader(dateIso)}</div>
                      <div style={{ color: COLORS.sub, fontWeight: 900, fontSize: 12 }}>{rows.length}건</div>
                    </div>

                    <div style={{ fontWeight: 1000, color: COLORS.sub }}>{isCollapsed ? "펼치기 ▼" : "접기 ▲"}</div>
                  </div>

                  {/* 접힘이면 숨김 */}
                  {isCollapsed ? null : (
                    <div style={{ marginTop: 10 }}>
                      <div style={tableWrap}>
                        <table style={tableStyle}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, width: 140 }}>시간</th>
                              <th style={{ ...thStyle, width: 150 }}>학생</th>
                              <th style={{ ...thStyle, width: 170 }}>학교</th>
                              <th style={{ ...thStyle, width: 90 }}>학년</th>
                              <th style={{ ...thStyle, width: 120 }}>담당</th>
                              <th style={{ ...thStyle, width: 110 }}>수업종류</th>
                              <th style={{ ...thStyle, width: 190 }}>출결</th>
                              <th style={{ ...thStyle, width: 220 }}>정시/지각</th>
                              <th style={{ ...thStyle, width: 260 }}>결석사유</th>
                              <th style={{ ...thStyle, width: 280 }}>보강일정보</th>
                              <th style={{ ...thStyle, width: 280 }}>원결석일정보</th>
                            </tr>
                          </thead>

                          <tbody>
                            {rows.map((r) => {
                              const e = r.raw;
                              const bg = rowBg(e);

                              const canCheckExtra = r.isExtraNormal; // ✅ 추가등원(보강 제외)만
                              const saving = !!savingById[r.id];
                              const draft = absentDraftById[r.id] ?? "";

                              return (
                                <tr key={r.id} style={{ background: bg }}>
                                  {/* 시간 + (일대일이면 테스트시간 작은 글씨) */}
                                  <td style={{ ...tdStyle, fontWeight: 1000, textAlign: "center", whiteSpace: "normal" }}>
                                    <div>{r.startHH || "-"}</div>
                                    {r.testHH ? (
                                      <div style={{ marginTop: 4, fontSize: 11, color: COLORS.sub, fontWeight: 900 }}>테스트 {r.testHH}</div>
                                    ) : null}
                                    {r.isMakeup ? (
                                      <div style={{ marginTop: 4, fontSize: 11, color: COLORS.sub, fontWeight: 1000 }}>보강</div>
                                    ) : null}
                                  </td>

                                  <td style={{ ...tdStyle, fontWeight: 1000, textAlign: "center" }}>{r.st?.name || "-"}</td>
                                  <td style={{ ...tdStyle, textAlign: "center", color: COLORS.sub, fontWeight: 900 }}>{r.st?.school || "-"}</td>
                                  <td style={{ ...tdStyle, textAlign: "center", color: COLORS.sub, fontWeight: 1000 }}>{r.st?.grade || "-"}</td>
                                  <td style={{ ...tdStyle, textAlign: "center", color: COLORS.sub, fontWeight: 1000 }}>{r.st?.teacher_name || "-"}</td>

                                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 1000 }}>{r.type}</td>

                                  {/* ✅ 출결: 추가등원(보강 제외)만 버튼 노출 */}
                                  <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "normal" }}>
                                    {canCheckExtra ? (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                                        <div style={{ fontWeight: 1000 }}>{r.status}</div>
                                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                          <button
                                            type="button"
                                            style={smallBtnBlue}
                                            disabled={saving}
                                            onClick={() => markExtraPresent(r.id)}
                                            title="추가등원 출석 처리"
                                          >
                                            출석
                                          </button>
                                          <button
                                            type="button"
                                            style={smallBtnRed}
                                            disabled={saving}
                                            onClick={() => markExtraAbsent(r.id)}
                                            title="추가등원 결석 처리 (사유 필수)"
                                          >
                                            결석
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ fontWeight: 1000 }}>{r.status}</div>
                                    )}
                                  </td>

                                  <td style={{ ...tdStyle, color: r.punctual ? COLORS.text : COLORS.sub, fontWeight: 900 }}>{r.punctual || "-"}</td>

                                  {/* ✅ 결석사유: 추가등원(보강 제외)만 입력 가능 */}
                                  <td style={{ ...tdStyle, whiteSpace: "normal", overflow: "visible" /* ✅ FIX: input이 셀에서 안 보이던 문제 방지 */ }}>
                                    {canCheckExtra ? (
                                      <input
                                        value={draft}
                                        onChange={(ev) => setAbsentDraftById((p) => ({ ...p, [r.id]: ev.target.value }))}
                                        placeholder="결석 사유 입력"
                                        style={reasonInput}
                                        disabled={saving}
                                      />
                                    ) : (
                                      <div style={{ color: r.absentReason ? COLORS.text : COLORS.sub, fontWeight: 900 }}>
                                        {r.absentReason || "-"}
                                      </div>
                                    )}
                                  </td>

                                  <td style={{ ...tdStyle, color: r.makeupInfo ? COLORS.text : COLORS.sub, fontWeight: 900, whiteSpace: "normal" }}>
                                    {r.makeupInfo || "-"}
                                  </td>

                                  <td style={{ ...tdStyle, color: r.originalInfo ? COLORS.text : COLORS.sub, fontWeight: 900, whiteSpace: "normal" }}>
                                    {r.originalInfo || "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: 8, color: COLORS.sub, fontSize: 12, fontWeight: 900 }}>
                        · 색상: 출석(연파랑) / 결석(연빨강) / 보강 미처리(연노랑)
                        <br />
                        · 이 화면에서 출결 버튼은 <b>추가등원(보강 제외)</b>만 가능합니다. (결석은 사유 입력 후 “결석” 클릭)
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 12, fontWeight: 900 }}>
          · 조회 범위: {monthStart} ~ {monthEnd}
        </div>
      </div>
    </div>
  );
}
