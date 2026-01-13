// src/pages/ReadingSchedulePage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import { supabase } from "../utils/supabaseClient";

dayjs.locale("ko");

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  border: "#d9e3f7",
  white: "#ffffff",

  presentBg: "rgba(47,111,237,0.10)",
  presentBd: "rgba(47,111,237,0.35)",
  absentBg: "rgba(224,49,49,0.08)",
  absentBd: "rgba(224,49,49,0.30)",

  // 보강 기본(출결 전)
  makeupBg: "rgba(250, 176, 5, 0.18)",
  makeupBd: "rgba(250, 176, 5, 0.40)",

  presentBtnBg: "rgba(47,111,237,0.12)",
  presentBtnBd: "rgba(47,111,237,0.35)",
  absentBtnBg: "rgba(224,49,49,0.10)",
  absentBtnBd: "rgba(224,49,49,0.32)",

  dangerBg: "rgba(224,49,49,0.08)",
  dangerBd: "rgba(224,49,49,0.28)",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function hhmm(t) {
  const s = (t || "").toString();
  if (!s) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return s;
}

function clampTimeHHMM(v) {
  const s = (v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return s;
  hh = Math.max(0, Math.min(23, hh));
  mm = Math.max(0, Math.min(59, mm));
  return `${pad2(hh)}:${pad2(mm)}`;
}

function isValidHHMM(v) {
  const s = (v || "").trim();
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function presentWindow(attendedAtIso) {
  if (!attendedAtIso) return "";
  const a = dayjs(attendedAtIso);
  const b = a.add(90, "minute");
  return `${a.format("HH:mm")}-${b.format("HH:mm")}`;
}

// ✅ 날짜(YYYY-MM-DD) + 시간(HH:MM) -> 로컬 Date 생성
function makeLocalDateTime(dateStr, timeStrHHMM) {
  const d = String(dateStr || "").trim();
  const t = hhmm(timeStrHHMM);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{2}:\d{2}$/.test(t)) return null;

  const [Y, M, D] = d.split("-").map((x) => parseInt(x, 10));
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  if (!Y || !M || !D) return null;

  const dt = new Date(Y, M - 1, D, h || 0, m || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// ✅ attended_at(실제 체크) 기준으로 지각분 계산 (타임존/파싱 안전)
function calcLateFromAttendedAt(eventDate, startTime, attendedAtIso) {
  const scheduled = makeLocalDateTime(eventDate, startTime);
  const attended = attendedAtIso ? new Date(attendedAtIso) : null;
  if (!scheduled || !attended || Number.isNaN(attended.getTime())) return null;

  const diffMin = Math.floor((attended.getTime() - scheduled.getTime()) / 60000);
  return Math.max(0, diffMin);
}

// ✅ “지금 클릭한 순간” 기준으로 지각분 계산 (저장용)
function calcLateFromNow(eventDate, startTime) {
  const scheduled = makeLocalDateTime(eventDate, startTime);
  if (!scheduled) return 0;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - scheduled.getTime()) / 60000);
  return Math.max(0, diffMin);
}

// ✅ 보강 추가시 season 자동 추정(현재 프로젝트 규칙)
function seasonForDate(d) {
  const s = (d || "").trim();
  if (!s) return "term";
  const x = dayjs(s);
  if (!x.isValid()) return "term";
  const start = dayjs("2026-01-12");
  const end = dayjs("2026-02-28");
  if ((x.isAfter(start, "day") || x.isSame(start, "day")) && (x.isBefore(end, "day") || x.isSame(end, "day"))) {
    return "winter";
  }
  return "term";
}

export default function ReadingSchedulePage() {
  const [date, setDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  // 메모 drafts / saving
  const [memoDraftById, setMemoDraftById] = useState({});
  const [memoSavingId, setMemoSavingId] = useState(null);

  // 결석/보강 모달
  const [absentOpen, setAbsentOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [absentReason, setAbsentReason] = useState("");
  const [makeupDate, setMakeupDate] = useState("");
  const [makeupClassTime, setMakeupClassTime] = useState("");
  const firstInputRef = useRef(null);

  // ✅ 하단 “보강 추가” 폼
  const [addName, setAddName] = useState("");
  const [addDate, setAddDate] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [addTime, setAddTime] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (absentOpen) setTimeout(() => firstInputRef.current?.focus?.(), 0);
  }, [absentOpen]);

  const titleText = useMemo(() => {
    const d = dayjs(date);
    return `${d.format("YYYY.MM.DD")} (${d.format("ddd")})`;
  }, [date]);

  function isMakeupRow(r) {
    return r.kind === "extra" && (r.event_kind || "") === "makeup";
  }

  // 보강은 출결 전엔 연노랑 / 출결 처리되면 present/absent가 우선
  function rowTone(r) {
    if (r.attendance_status === "present") return { bg: COLORS.presentBg, bd: COLORS.presentBd };
    if (r.attendance_status === "absent") return { bg: COLORS.absentBg, bd: COLORS.absentBd };
    if (isMakeupRow(r)) return { bg: COLORS.makeupBg, bd: COLORS.makeupBd };
    return { bg: "transparent", bd: "transparent" };
  }

  async function load() {
    try {
      setErr("");
      setLoading(true);

      // ✅ 독해 화면에서는 reading + (makeup extra 중 schedule_kind='reading')만 보여야 함
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
          makeup_class_time,
          class_minutes,
          original_event_id,
          makeup_event_id,
          event_kind,
          memo,
          student:students (
            id,
            name,
            school,
            grade,
            teacher_name
          )
        `
        )
        .eq("event_date", date)
        .or(
          [
            "kind.eq.reading",
            "and(kind.eq.extra,event_kind.eq.makeup,schedule_kind.eq.reading)",
          ].join(",")
        );

      if (error) throw error;

      const filtered = (data || []).filter((r) => {
        if (r.kind === "reading") return true;
        if (r.kind === "extra" && (r.event_kind || "") === "makeup" && (r.schedule_kind || "") === "reading") return true;
        return false;
      });

      const normalized = filtered.map((r) => ({
        ...r,
        student_name: (r.student?.name || "").trim(),
        school: (r.student?.school || "").trim(),
        grade: (r.student?.grade || "").trim(),
        teacher_name: (r.student?.teacher_name || "").trim(),
        start_hhmm: hhmm(r.start_time),
      }));

      // 시간순 → 같은 시간이면 이름순
      normalized.sort((a, b) => {
        const ta = makeLocalDateTime(a.event_date, a.start_time)?.getTime() ?? 9e18;
        const tb = makeLocalDateTime(b.event_date, b.start_time)?.getTime() ?? 9e18;
        if (ta !== tb) return ta - tb;
        return (a.student_name || "").localeCompare(b.student_name || "", "ko");
      });

      setRows(normalized);

      // memoDraft 초기화(없으면 채움)
      setMemoDraftById((prev) => {
        const next = { ...prev };
        for (const r of normalized) {
          if (next[r.id] === undefined) next[r.id] = r.memo || "";
        }
        return next;
      });
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function markPresent(r) {
    try {
      setErr("");

      // ✅ FIX: 날짜+시간 기준으로 정확히 late 계산
      const late = calcLateFromNow(r.event_date, r.start_time);

      const { error } = await supabase
        .from("student_events")
        .update({
          attendance_status: "present",
          attended_at: new Date().toISOString(),
          late_minutes: late,
          absent_reason: null,
        })
        .eq("id", r.id);

      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function openAbsent(r) {
    setTarget(r);
    setAbsentReason("");
    setMakeupDate("");
    setMakeupClassTime("");
    setAbsentOpen(true);
  }

  async function saveAbsent() {
    const r = target;
    if (!r) return;

    const mct = clampTimeHHMM(makeupClassTime);

    if ((makeupDate && !mct) || (!makeupDate && mct)) {
      setErr("보강일과 보강 수업시간(HH:MM)은 둘 다 입력해야 해요.");
      return;
    }
    if (mct && !isValidHHMM(mct)) {
      setErr("보강 수업시간은 HH:MM 형식으로 입력해줘. 예) 16:30");
      return;
    }

    try {
      setErr("");

      // ✅ 결석은 attended_at을 남기지 않음
      const { error: upErr } = await supabase
        .from("student_events")
        .update({
          attendance_status: "absent",
          attended_at: null,
          late_minutes: null,
          absent_reason: (absentReason || "").trim() || null,
          makeup_date: r.kind === "reading" ? (makeupDate || null) : null,
          makeup_class_time: r.kind === "reading" ? (mct || null) : null,
        })
        .eq("id", r.id);

      if (upErr) throw upErr;

      // 2) 보강 생성은 원수업(kind=reading)에서만
      if (r.kind === "reading" && makeupDate && mct) {
        const dur = Number.isFinite(r.class_minutes) && r.class_minutes ? r.class_minutes : 60;

        const insertPayload = {
          student_id: r.student_id,
          event_date: makeupDate,
          kind: "extra",
          start_time: `${mct}:00`,
          season: r.season,
          schedule_kind: "reading", // ✅ 강제
          attendance_status: null,
          attended_at: null,
          late_minutes: null,
          absent_reason: null,
          class_minutes: dur,
          original_event_id: r.id,
          event_kind: "makeup",
          makeup_class_time: mct,
        };

        const { data: insData, error: insErr } = await supabase
          .from("student_events")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insErr) throw insErr;

        const { error: linkErr } = await supabase
          .from("student_events")
          .update({ makeup_event_id: insData?.id || null })
          .eq("id", r.id);

        if (linkErr) throw linkErr;
      }

      setAbsentOpen(false);
      setTarget(null);
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function resetAttendance(r) {
    try {
      setErr("");

      if (r.kind === "reading") {
        if (r.makeup_event_id) {
          const { error: delErr } = await supabase.from("student_events").delete().eq("id", r.makeup_event_id);
          if (delErr) throw delErr;
        }

        const { error: upErr } = await supabase
          .from("student_events")
          .update({
            attendance_status: null,
            attended_at: null,
            late_minutes: null,
            absent_reason: null,
            makeup_date: null,
            makeup_time: null,
            makeup_class_time: null,
            makeup_event_id: null,
          })
          .eq("id", r.id);

        if (upErr) throw upErr;
        await load();
        return;
      }

      const { error } = await supabase
        .from("student_events")
        .update({
          attendance_status: null,
          attended_at: null,
          late_minutes: null,
          absent_reason: null,
        })
        .eq("id", r.id);

      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function saveMemo(rowId) {
    setMemoSavingId(rowId);
    setErr("");
    try {
      const raw = memoDraftById[rowId] ?? "";
      const memo = String(raw).trim();

      const { error } = await supabase.from("student_events").update({ memo: memo ? memo : null }).eq("id", rowId);
      if (error) throw error;
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setMemoSavingId(null);
    }
  }

  function autosizeTextarea(el) {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  function renderAttendanceCell(r) {
    const status = r.attendance_status || null;

    if (status === "present") {
      const win = presentWindow(r.attended_at);

      // ✅ FIX: DB late_minutes가 0으로 잘못 저장된 케이스도 “attended_at”으로 재계산해서 표시
      const stored = r.late_minutes;
      const storedNum = stored === null || stored === undefined ? null : Number(stored);
      const computed = calcLateFromAttendedAt(r.event_date, r.start_time, r.attended_at);

      // 표시용 late 결정:
      // - 저장값이 유효(>0)이면 그걸 사용
      // - 저장값이 0/없음인데 computed가 1 이상이면 computed 사용
      // - 그 외는 0 처리
      let lateForShow = 0;
      if (Number.isFinite(storedNum) && storedNum > 0) lateForShow = storedNum;
      else if (Number.isFinite(computed) && computed > 0) lateForShow = computed;
      else lateForShow = 0;

      const lateText = lateForShow <= 0 ? "정시 출석" : `지각 ${lateForShow}분`;

      return (
        <div style={styles.attnBox}>
          <div style={styles.attnLine1}>{win || "출석"}</div>
          <div style={styles.attnLine2}>{lateText}</div>
        </div>
      );
    }

    if (status === "absent") {
      const line1 = r.absent_reason ? `결석 (${r.absent_reason})` : "결석";
      const line2 =
        r.kind === "reading" && r.makeup_date && r.makeup_class_time
          ? `보강 ${dayjs(r.makeup_date).format("MM.DD")} ${r.makeup_class_time}`
          : "";
      return (
        <div style={styles.attnBox}>
          <div style={styles.attnLine1}>{line1}</div>
          <div style={styles.attnLine2}>{line2}</div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
        <button type="button" onClick={() => markPresent(r)} style={styles.btnPresent}>
          출석
        </button>
        <button type="button" onClick={() => openAbsent(r)} style={styles.btnAbsent}>
          결석
        </button>
      </div>
    );
  }

  async function findStudentIdByName(nameRaw) {
    const name = (nameRaw || "").trim();
    if (!name) return { id: null, pickedName: "" };

    {
      const { data, error } = await supabase.from("students").select("id,name").eq("name", name).limit(1);
      if (error) throw error;
      if (data && data.length) return { id: data[0].id, pickedName: data[0].name };
    }

    {
      const { data, error } = await supabase.from("students").select("id,name").ilike("name", `%${name}%`).limit(5);
      if (error) throw error;
      if (!data || data.length === 0) return { id: null, pickedName: "" };
      const sorted = [...data].sort((a, b) => (a.name || "").length - (b.name || "").length);
      return { id: sorted[0].id, pickedName: sorted[0].name };
    }
  }

  async function addMakeupDirect() {
    const nm = (addName || "").trim();
    const d = (addDate || "").trim();
    const t = clampTimeHHMM(addTime);

    if (!nm) {
      setErr("학생이름을 입력해줘.");
      return;
    }
    if (!d) {
      setErr("보강일을 선택해줘.");
      return;
    }
    if (!t || !isValidHHMM(t)) {
      setErr("보강 수업시간은 HH:MM 형식으로 입력해줘. 예) 16:30");
      return;
    }

    try {
      setErr("");
      setAdding(true);

      const found = await findStudentIdByName(nm);
      if (!found.id) {
        setErr(`학생을 찾지 못했어요: "${nm}"`);
        return;
      }

      const payload = {
        student_id: found.id,
        event_date: d,
        kind: "extra",
        event_kind: "makeup",
        schedule_kind: "reading",
        start_time: `${t}:00`,
        season: seasonForDate(d),
        attendance_status: null,
        attended_at: null,
        late_minutes: null,
        absent_reason: null,
        class_minutes: 60,
        original_event_id: null,
        makeup_class_time: t,
      };

      const { error } = await supabase.from("student_events").insert(payload);
      if (error) throw error;

      setAddName("");
      setAddTime("");
      setDate(d);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(r) {
    if (!r?.id) return;
    const ok = window.confirm("이 줄을 삭제할까요? (되돌릴 수 없어요)");
    if (!ok) return;

    try {
      setErr("");

      if (isMakeupRow(r) && r.original_event_id) {
        const { error: upErr } = await supabase
          .from("student_events")
          .update({
            makeup_date: null,
            makeup_time: null,
            makeup_class_time: null,
            makeup_event_id: null,
          })
          .eq("id", r.original_event_id);

        if (upErr) throw upErr;
      }

      const { error } = await supabase.from("student_events").delete().eq("id", r.id);
      if (error) throw error;

      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.headRow}>
          <div>
            <div style={styles.title}>독해 시간표</div>
            <div style={styles.subtitle}>{titleText}</div>
          </div>

          <div style={styles.headRight}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.date} />
            <button type="button" onClick={load} style={styles.ghostBtn}>
              새로고침
            </button>
          </div>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.table}>
          <div style={styles.thead}>
            <div style={styles.thCenter}>번호</div>
            <div style={styles.thCenter}>시작</div>
            <div style={styles.thCenter}>학생이름</div>
            <div style={styles.thCenter}>학교</div>
            <div style={styles.thCenter}>학년</div>
            <div style={styles.thCenter}>담당선생님</div>
            <div style={styles.thCenter}>출결</div>
            <div style={styles.thCenter}>초기화</div>
            <div style={styles.thCenter}>메모</div>
            <div style={styles.thCenter}>삭제</div>
          </div>

          {loading ? (
            <div style={styles.empty}>불러오는 중…</div>
          ) : rows.length === 0 ? (
            <div style={styles.empty}>이 날짜에 독해 수업이 없어요.</div>
          ) : (
            rows.map((r, idx) => {
              const tone = rowTone(r);
              const isMakeup = isMakeupRow(r);
              const memoVal = memoDraftById[r.id] ?? (r.memo || "");
              const saving = memoSavingId === r.id;

              return (
                <div
                  key={r.id}
                  style={{
                    ...styles.tr,
                    background: tone.bg,
                    borderColor: tone.bd,
                  }}
                >
                  <div style={styles.tdCenter}>{idx + 1}</div>

                  <div style={styles.tdCenterStrong}>{r.start_hhmm || "-"}</div>

                  <div style={styles.tdCenterFlex}>
                    <div style={styles.ellipsisStrong}>{r.student_name || "-"}</div>
                    {isMakeup ? <span style={styles.badge}>보강</span> : null}
                  </div>

                  <div style={styles.tdCenter}>
                    <span style={styles.ellipsisSub}>{r.school || "-"}</span>
                  </div>

                  <div style={styles.tdCenter}>
                    <span style={{ fontWeight: 900, color: COLORS.sub }}>{r.grade || "-"}</span>
                  </div>

                  <div style={styles.tdCenter}>
                    <span style={styles.ellipsisSub}>{r.teacher_name || "-"}</span>
                  </div>

                  <div style={styles.tdCenter}>{renderAttendanceCell(r)}</div>

                  <div style={styles.tdCenter}>
                    <button type="button" onClick={() => resetAttendance(r)} style={styles.ghostBtn}>
                      초기화
                    </button>
                  </div>

                  <div style={{ ...styles.tdCenter, alignItems: "stretch" }}>
                    <div style={{ width: "100%" }}>
                      <textarea
                        value={memoVal}
                        onChange={(e) =>
                          setMemoDraftById((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        onInput={(e) => autosizeTextarea(e.currentTarget)}
                        onFocus={(e) => autosizeTextarea(e.currentTarget)}
                        onBlur={(e) => {
                          autosizeTextarea(e.currentTarget);
                          saveMemo(r.id);
                        }}
                        placeholder="메모"
                        rows={1}
                        style={{
                          ...styles.memo,
                          opacity: saving ? 0.75 : 1,
                        }}
                        disabled={saving}
                      />
                      <div style={styles.memoHint}>{saving ? "저장 중…" : ""}</div>
                    </div>
                  </div>

                  <div style={styles.tdCenter}>
                    <button type="button" onClick={() => deleteRow(r)} style={styles.btnDelete}>
                      삭제
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ✅ 하단: 보강 추가 폼 */}
        <div style={styles.addBox}>
          <div style={styles.addTitle}>보강 추가</div>
          <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 12, lineHeight: 1.45, fontWeight: 800 }}>
            • 이 화면에서 추가한 보강은 자동으로 <b>독해(reading)</b> 보강으로 저장돼요. (일대일 시간표에 섞이지 않음)
          </div>

          <div style={styles.addGrid}>
            <div>
              <div style={styles.label}>학생이름</div>
              <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="예: 김민준" style={styles.input} />
            </div>

            <div>
              <div style={styles.label}>보강일</div>
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={styles.input} />
            </div>

            <div>
              <div style={styles.label}>보강 수업시간 HH:MM</div>
              <input
                value={addTime}
                onChange={(e) => setAddTime(clampTimeHHMM(e.target.value))}
                placeholder="예: 16:30"
                style={styles.input}
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
              <button type="button" onClick={addMakeupDirect} style={styles.btnAdd} disabled={adding}>
                {adding ? "추가 중…" : "보강 추가"}
              </button>
            </div>
          </div>

          <div style={styles.addHint}>
            • 원결석일 없이도 보강(추가) 수업을 직접 만들어요. <br />
            • 추가하면 해당 보강일로 화면이 이동해요.
          </div>
        </div>
      </div>

      {absentOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={() => {
            setAbsentOpen(false);
            setTarget(null);
          }}
          style={styles.modalOverlay}
        >
          <div onMouseDown={(e) => e.stopPropagation()} style={styles.modal}>
            <div style={styles.modalHead}>
              <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.text }}>결석 처리: {target?.student_name || "-"}</div>
              <button
                type="button"
                onClick={() => {
                  setAbsentOpen(false);
                  setTarget(null);
                }}
                style={styles.ghostBtn}
              >
                닫기
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div>
                <div style={styles.label}>결석 사유</div>
                <input
                  ref={firstInputRef}
                  value={absentReason}
                  onChange={(e) => setAbsentReason(e.target.value)}
                  placeholder="예: 감기 / 학교행사 / 개인사정"
                  style={styles.input}
                />
              </div>

              {target?.kind === "reading" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={styles.label}>보강일 (선택)</div>
                    <input type="date" value={makeupDate} onChange={(e) => setMakeupDate(e.target.value)} style={styles.input} />
                  </div>

                  <div>
                    <div style={styles.label}>보강 수업시간 HH:MM (선택)</div>
                    <input
                      value={makeupClassTime}
                      onChange={(e) => setMakeupClassTime(clampTimeHHMM(e.target.value))}
                      placeholder="예: 16:30"
                      style={styles.input}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: COLORS.sub, fontWeight: 800, lineHeight: 1.5 }}>
                  • 보강(추가) 수업은 여기서 “보강 생성”을 하지 않아요. 결석 사유만 저장돼요.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setAbsentOpen(false);
                    setTarget(null);
                  }}
                  style={styles.ghostBtn}
                >
                  취소
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (target?.kind === "reading" && makeupClassTime) {
                      const t = clampTimeHHMM(makeupClassTime);
                      if (!isValidHHMM(t)) {
                        setErr("보강 수업시간은 HH:MM 형식으로 입력해줘. 예) 16:30");
                        return;
                      }
                    }
                    saveAbsent();
                  }}
                  style={styles.btnAbsent}
                >
                  저장
                </button>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.sub, lineHeight: 1.5 }}>
                • 독해 보강은 테스트시간이 없어서 <b>수업시간만</b> 입력해요.<br />
                • 출석 누르면 출결 칸에 <b>출석체크 시각~90분</b>이 표시돼요.<br />
                • 보강은 출결 전엔 <b>연노랑</b>, 출결 처리하면 그때 색이 바뀌어요.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const GRID = "46px 66px 0.92fr 0.80fr 72px 110px 1.60fr 86px 1.18fr 78px";

const styles = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 60%, ${COLORS.bgBottom} 100%)`,
    padding: "22px 16px 90px",
    color: COLORS.text,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR"',
  },
  wrap: { maxWidth: 1280, margin: "0 auto" },

  headRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: 900, letterSpacing: -0.2 },
  subtitle: { marginTop: 6, color: COLORS.sub, fontSize: 13, fontWeight: 700 },

  headRight: { display: "flex", alignItems: "center", gap: 10 },
  date: {
    height: 38,
    padding: "0 10px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    fontWeight: 800,
  },

  error: {
    marginBottom: 12,
    border: "1px solid rgba(224,49,49,0.25)",
    background: "rgba(224,49,49,0.08)",
    color: "#b42318",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    whiteSpace: "pre-wrap",
  },

  table: { display: "grid", gap: 8 },

  thead: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 6,
    padding: "0 2px",
  },
  thCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    fontSize: 12,
    fontWeight: 900,
    color: COLORS.sub,
    textAlign: "center",
  },

  tr: {
    display: "grid",
    gridTemplateColumns: GRID,
    gap: 6,
    alignItems: "center",
    padding: "10px 10px",
    borderRadius: 16,
    border: "1px solid transparent",
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(6px)",
  },

  tdCenter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    overflow: "hidden",
  },
  tdCenterStrong: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    overflow: "hidden",
    fontWeight: 900,
    color: COLORS.text,
  },
  tdCenterFlex: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 32,
    overflow: "hidden",
  },

  ellipsisStrong: {
    maxWidth: "100%",
    fontWeight: 900,
    color: COLORS.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ellipsisSub: {
    maxWidth: "100%",
    color: COLORS.sub,
    fontWeight: 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  badge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.75)",
    color: COLORS.sub,
    fontWeight: 900,
    flex: "0 0 auto",
  },

  btnPresent: {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.presentBtnBd}`,
    background: COLORS.presentBtnBg,
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnAbsent: {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.absentBtnBd}`,
    background: COLORS.absentBtnBg,
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  ghostBtn: {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.75)",
    color: COLORS.sub,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  btnDelete: {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.dangerBd}`,
    background: COLORS.dangerBg,
    color: "#b42318",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  attnBox: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    overflow: "hidden",
  },
  attnLine1: {
    width: "100%",
    textAlign: "center",
    fontWeight: 900,
    fontSize: 13,
    color: COLORS.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "18px",
  },
  attnLine2: {
    width: "100%",
    textAlign: "center",
    fontWeight: 800,
    fontSize: 12,
    color: COLORS.sub,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    lineHeight: "16px",
    minHeight: 16,
  },

  memo: {
    width: "100%",
    minHeight: 32,
    height: 32,
    resize: "none",
    overflow: "hidden",
    padding: "7px 10px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    fontWeight: 800,
    fontSize: 13,
    lineHeight: "18px",
    outline: "none",
  },
  memoHint: {
    marginTop: 4,
    minHeight: 14,
    fontSize: 11,
    color: COLORS.sub,
    fontWeight: 800,
    textAlign: "center",
  },

  empty: {
    padding: 14,
    color: COLORS.sub,
    fontWeight: 800,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "min(560px, 100%)",
    borderRadius: 18,
    background: "#fff",
    border: `1px solid ${COLORS.border}`,
    padding: 16,
  },
  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  label: { fontSize: 12, fontWeight: 900, color: COLORS.sub, marginBottom: 6 },
  input: {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    outline: "none",
    color: COLORS.text,
    fontWeight: 800,
    background: "#fff",
  },

  addBox: {
    marginTop: 18,
    border: `1px solid ${COLORS.border}`,
    background: "rgba(255,255,255,0.55)",
    borderRadius: 16,
    padding: 14,
  },
  addTitle: {
    fontSize: 14,
    fontWeight: 900,
    color: COLORS.text,
    marginBottom: 10,
  },
  addGrid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr 1fr auto",
    gap: 10,
    alignItems: "end",
  },
  btnAdd: {
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: `1px solid ${COLORS.presentBtnBd}`,
    background: COLORS.presentBtnBg,
    color: COLORS.text,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  addHint: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 800,
    lineHeight: 1.5,
  },
};
