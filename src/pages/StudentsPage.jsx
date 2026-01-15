// src/pages/StudentsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";

const COLORS = {
  bg: "#f6f9ff",
  text: "#1f2a44",
  sub: "#60708a",
  line: "rgba(31,42,68,0.12)",
  line2: "rgba(31,42,68,0.08)",
  blue: "#2f6fff",
  blueSoft: "rgba(47,111,255,0.12)",
  danger: "#d6455d",
  dangerSoft: "rgba(214,69,93,0.12)",
  ok: "#1a8f5b",
};

const WEEKDAYS = [
  // ✅ 일요일(0) 제외: 우리 학원 휴무
  { v: 1, label: "월" },
  { v: 2, label: "화" },
  { v: 3, label: "수" },
  { v: 4, label: "목" },
  { v: 5, label: "금" },
  { v: 6, label: "토" },
];

function weekdayLabel(v) {
  const f = WEEKDAYS.find((x) => x.v === Number(v));
  return f ? f.label : "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function timeToMinutesHHMM(t) {
  if (!t) return null;
  const s = String(t).trim();
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return hh * 60 + mm;
}

function minutesToHHMM(m) {
  if (m == null) return "";
  let mm = m % (24 * 60);
  if (mm < 0) mm += 24 * 60;
  const hh = Math.floor(mm / 60);
  const mi = mm % 60;
  return `${pad2(hh)}:${pad2(mi)}`;
}

function shiftMinus3HoursHHMM(t) {
  const m = timeToMinutesHHMM(t);
  if (m == null) return "";
  return minutesToHHMM(m - 180);
}

function normalizePhoneDigits(s) {
  return (s || "").replace(/[^0-9]/g, "");
}

function buildExtraSummary(extraMap) {
  const keys = Object.keys(extraMap || {})
    .map((k) => Number(k))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);
  if (!keys.length) return "—";
  return keys.map((k) => `${weekdayLabel(k)} ${extraMap[k] || ""}`.trim()).join(", ");
}

function buildTermSummary(row, extrasTerm) {
  const oto = `${weekdayLabel(row.term_oto_weekday)} T${(row.term_oto_test_time || "").slice(0, 5)} / S${(row.term_oto_class_time || "").slice(0, 5)}`;
  const read = `${weekdayLabel(row.term_read_weekday)} ${(row.term_read_class_time || "").slice(0, 5)}`;
  const extra = buildExtraSummary(extrasTerm);
  return `일대일: ${oto} · 독해: ${read} · 추가: ${extra}`;
}

function buildWinterSummary(row, extrasWinter) {
  const oto = `${weekdayLabel(row.winter_oto_weekday)} T${(row.winter_oto_test_time || "").slice(0, 5)} / S${(row.winter_oto_class_time || "").slice(0, 5)}`;
  const read = `${weekdayLabel(row.winter_read_weekday)} ${(row.winter_read_class_time || "").slice(0, 5)}`;
  const extra = buildExtraSummary(extrasWinter);
  return `일대일: ${oto} · 독해: ${read} · 추가: ${extra}`;
}

function SectionTitle({ title, desc }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.text }}>{title}</div>
      {desc ? <div style={{ fontSize: 13, color: COLORS.sub }}>{desc}</div> : null}
    </div>
  );
}

function ThinDivider() {
  return <div style={{ height: 1, background: COLORS.line2, margin: "18px 0" }} />;
}

function Button({ variant = "primary", children, ...props }) {
  const base = {
    height: 38,
    padding: "0 14px",
    borderRadius: 999,
    fontWeight: 900,
    border: "1px solid transparent",
    cursor: "pointer",
    userSelect: "none",
    background: "transparent",
  };

  const styles =
    variant === "primary"
      ? { background: COLORS.blue, color: "#fff" }
      : variant === "ghost"
      ? { borderColor: COLORS.line, color: COLORS.text, background: "transparent" }
      : variant === "danger"
      ? { background: COLORS.danger, color: "#fff" }
      : variant === "soft"
      ? { background: COLORS.blueSoft, color: COLORS.text, borderColor: "transparent" }
      : { borderColor: COLORS.line, color: COLORS.text };

  return (
    <button type="button" {...props} style={{ ...base, ...styles, ...(props.style || {}) }}>
      {children}
    </button>
  );
}

function Input({ label, required, hint, ...props }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: COLORS.sub }}>
        {label} {required ? <span style={{ color: COLORS.danger, fontWeight: 900 }}>*</span> : null}
      </div>
      <input
        {...props}
        style={{
          height: 40,
          padding: "0 12px",
          borderRadius: 12,
          border: `1px solid ${COLORS.line}`,
          outline: "none",
          background: "#fff",
          color: COLORS.text,
          fontSize: 14,
        }}
      />
      {hint ? <div style={{ fontSize: 12, color: COLORS.sub }}>{hint}</div> : null}
    </label>
  );
}

function Select({ label, required, children, ...props }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: COLORS.sub }}>
        {label} {required ? <span style={{ color: COLORS.danger, fontWeight: 900 }}>*</span> : null}
      </div>
      <select
        {...props}
        style={{
          height: 40,
          padding: "0 10px",
          borderRadius: 12,
          border: `1px solid ${COLORS.line}`,
          outline: "none",
          background: "#fff",
          color: COLORS.text,
          fontSize: 14,
        }}
      >
        {children}
      </select>
    </label>
  );
}

function CheckboxRow({ checked, label, onChange, disabled }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span style={{ color: COLORS.text, fontWeight: 900 }}>{label}</span>
    </label>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          borderRadius: 18,
          border: `1px solid ${COLORS.line}`,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 1000, color: COLORS.text }}>{title}</div>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  id: null,

  name: "",
  school: "",
  grade: "",

  teacher_name: "",
  phone_digits: "",
  first_lesson_date: "",

  // 학기중
  term_oto_weekday: 1,
  term_oto_test_time: "",
  term_oto_class_time: "",
  term_read_weekday: 1,
  term_read_class_time: "",

  // 겨울방학
  winter_oto_weekday: 1,
  winter_oto_test_time: "",
  winter_oto_class_time: "",
  winter_read_weekday: 1,
  winter_read_class_time: "",

  // 추가등원
  extras_term: {}, // { weekday: "HH:MM" }
  extras_winter: {},
});

export default function StudentsPage() {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState(() => emptyForm());

  const [rows, setRows] = useState([]);
  const [extrasByStudent, setExtrasByStudent] = useState({}); // { id: { term:{}, winter:{} } }

  const [q, setQ] = useState("");

  const [withdrawModal, setWithdrawModal] = useState({ open: false, student: null, date: "" });

  const filtered = useMemo(() => {
    const keyword = (q || "").trim().toLowerCase();
    const list = [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    if (!keyword) return list;

    return list.filter((r) => {
      const ex = extrasByStudent[r.id] || { term: {}, winter: {} };
      const hay = [
        r.name,
        r.school,
        r.grade,
        r.teacher_name,
        r.phone_digits,
        r.first_lesson_date,
        r.withdrawal_date,
        buildTermSummary(r, ex.term),
        buildWinterSummary(r, ex.winter),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(keyword);
    });
  }, [q, rows, extrasByStudent]);

  function toast(message, isError = false) {
    setMsg(isError ? "" : message);
    setErr(isError ? message : "");
    if (message) {
      setTimeout(() => {
        setMsg("");
        setErr("");
      }, 2400);
    }
  }

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function loadAll() {
    try {
      setLoading(true);
      setErr("");
      setMsg("");

      const { data: students, error: e1 } = await supabase.from("students").select("*").order("name", { ascending: true });
      if (e1) throw e1;

      const ids = (students || []).map((s) => s.id);
      let extraRows = [];
      if (ids.length) {
        const { data: er, error: e2 } = await supabase
          .from("student_extra_rules")
          .select("student_id, season, weekday, class_time")
          .in("student_id", ids);
        if (e2) throw e2;
        extraRows = er || [];
      }

      const map = {};
      for (const s of students || []) map[s.id] = { term: {}, winter: {} };
      for (const r of extraRows) {
        const sid = r.student_id;
        if (!map[sid]) map[sid] = { term: {}, winter: {} };
        map[sid][r.season] = map[sid][r.season] || {};
        map[sid][r.season][String(r.weekday)] = (r.class_time || "").slice(0, 5);
      }

      setRows(students || []);
      setExtrasByStudent(map);
    } catch (e) {
      console.error(e);
      toast(e?.message || "로드 실패", true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function resetForm() {
    setForm(emptyForm());
    setErr("");
    setMsg("");
  }

  function validateTimeHHMM(t) {
    return timeToMinutesHHMM(t) != null;
  }

  function validateForm(f) {
    const must = [
      ["name", "이름"],
      ["school", "학교"],
      ["grade", "학년"],
      ["teacher_name", "담당선생님"],
      ["phone_digits", "휴대폰번호"],
      ["first_lesson_date", "첫수업일"],

      ["term_oto_test_time", "학기중 일대일 테스트 시간"],
      ["term_oto_class_time", "학기중 일대일 수업 시간"],
      ["term_read_class_time", "학기중 독해 수업 시간"],

      ["winter_oto_test_time", "겨울방학 일대일 테스트 시간"],
      ["winter_oto_class_time", "겨울방학 일대일 수업 시간"],
      ["winter_read_class_time", "겨울방학 독해 수업 시간"],
    ];

    for (const [k, label] of must) {
      if (!String(f[k] || "").trim()) return `${label}을(를) 입력해주세요.`;
    }

    const digits = normalizePhoneDigits(f.phone_digits);
    if (!/^[0-9]{8,11}$/.test(digits)) return "휴대폰번호는 '-' 없이 숫자만(8~11자리) 입력해주세요.";

    // 요일은 1~6만 (일요일 없음)
    const mustWeekdays = [
      ["term_oto_weekday", "학기중 일대일 요일"],
      ["term_read_weekday", "학기중 독해 요일"],
      ["winter_oto_weekday", "겨울방학 일대일 요일"],
      ["winter_read_weekday", "겨울방학 독해 요일"],
    ];
    for (const [k, label] of mustWeekdays) {
      const v = Number(f[k]);
      if (!(v >= 1 && v <= 6)) return `${label}은(는) 월~토만 선택 가능해요.`;
    }

    // 시간 형식 검증(HH:MM)
    const mustTimes = [
      ["term_oto_test_time", "학기중 일대일 테스트 시간"],
      ["term_oto_class_time", "학기중 일대일 수업 시간"],
      ["term_read_class_time", "학기중 독해 수업 시간"],
      ["winter_oto_test_time", "겨울방학 일대일 테스트 시간"],
      ["winter_oto_class_time", "겨울방학 일대일 수업 시간"],
      ["winter_read_class_time", "겨울방학 독해 수업 시간"],
    ];
    for (const [k, label] of mustTimes) {
      if (!validateTimeHHMM(f[k])) return `${label}은(는) 24시 기준 HH:MM(예: 13:00) 형식으로 입력해주세요.`;
    }

    // 추가등원: 체크된 요일은 시간 필수 + 형식 검증
    const checkExtras = (extras, seasonLabel) => {
      for (const wdStr of Object.keys(extras || {})) {
        const wd = Number(wdStr);
        if (!(wd >= 1 && wd <= 6)) return `${seasonLabel} 추가등원: 일요일은 사용할 수 없어요.`;

        const t = (extras[wdStr] || "").trim();
        if (!t) return `${seasonLabel} 추가등원: ${weekdayLabel(wd)} 시간 입력이 비어있어요.`;
        if (!validateTimeHHMM(t)) return `${seasonLabel} 추가등원: ${weekdayLabel(wd)} 시간은 HH:MM(예: 13:00) 형식으로 입력해주세요.`;
      }
      return null;
    };

    const e1 = checkExtras(f.extras_term, "학기중");
    if (e1) return e1;

    const e2 = checkExtras(f.extras_winter, "겨울방학");
    if (e2) return e2;

    return null;
  }

  async function upsertStudentAndExtras() {
    const f = {
      ...form,
      phone_digits: normalizePhoneDigits(form.phone_digits),
      name: (form.name || "").trim(),
      school: (form.school || "").trim(),
      grade: (form.grade || "").trim(),
      teacher_name: (form.teacher_name || "").trim(),
    };

    const vmsg = validateForm(f);
    if (vmsg) {
      toast(vmsg, true);
      return;
    }

    try {
      setBusy(true);
      setErr("");
      setMsg("");

      const payload = {
        name: f.name,
        school: f.school,
        grade: f.grade,
        teacher_name: f.teacher_name,
        phone_digits: f.phone_digits,
        first_lesson_date: f.first_lesson_date,

        term_oto_weekday: Number(f.term_oto_weekday),
        term_oto_test_time: f.term_oto_test_time,
        term_oto_class_time: f.term_oto_class_time,
        term_read_weekday: Number(f.term_read_weekday),
        term_read_class_time: f.term_read_class_time,

        winter_oto_weekday: Number(f.winter_oto_weekday),
        winter_oto_test_time: f.winter_oto_test_time,
        winter_oto_class_time: f.winter_oto_class_time,
        winter_read_weekday: Number(f.winter_read_weekday),
        winter_read_class_time: f.winter_read_class_time,
      };

      let saved;
      if (f.id) {
        const { data, error } = await supabase.from("students").update(payload).eq("id", f.id).select("*").single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from("students").insert(payload).select("*").single();
        if (error) throw error;
        saved = data;
      }

      // ✅ extras 동기화(시즌별 기존 삭제 후 삽입)
      const syncSeason = async (season, extrasMap) => {
        const sid = saved?.id;

        // ✅ 핵심: sid/season이 비정상이면 DELETE 자체를 막아서 "WHERE clause" 에러 원천 차단
        if (!sid) throw new Error("저장된 학생 id가 없습니다. (saved.id)");
        if (season !== "term" && season !== "winter") throw new Error(`잘못된 season 값: ${season}`);

        // ✅ 더 안전한 match 사용 (조건 누락 가능성 최소화)
        const { error: delErr } = await supabase.from("student_extra_rules").delete().match({ student_id: sid, season });
        if (delErr) throw delErr;

        const entries = Object.keys(extrasMap || {})
          .map((wdStr) => ({
            student_id: sid,
            season,
            weekday: Number(wdStr),
            class_time: extrasMap[wdStr],
          }))
          .filter((x) => Number.isFinite(x.weekday) && x.weekday >= 1 && x.weekday <= 6 && x.class_time);

        if (entries.length) {
          const { error: insErr } = await supabase.from("student_extra_rules").insert(entries);
          if (insErr) throw insErr;
        }
      };

      await syncSeason("term", f.extras_term);
      await syncSeason("winter", f.extras_winter);

      toast(f.id ? "수정 완료!" : "등록 완료!");
      resetForm();
      await loadAll();
    } catch (e) {
      console.error(e);
      toast(e?.message || "저장 실패", true);
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(row) {
    try {
      setErr("");
      setMsg("");

      const { data: er, error } = await supabase.from("student_extra_rules").select("season, weekday, class_time").eq("student_id", row.id);
      if (error) throw error;

      const extrasTerm = {};
      const extrasWinter = {};
      for (const r of er || []) {
        const t = (r.class_time || "").slice(0, 5);
        if (r.season === "term") extrasTerm[String(r.weekday)] = t;
        if (r.season === "winter") extrasWinter[String(r.weekday)] = t;
      }

      setForm({
        id: row.id,

        name: row.name || "",
        school: row.school || "",
        grade: row.grade || "",

        teacher_name: row.teacher_name || "",
        phone_digits: row.phone_digits || "",
        first_lesson_date: row.first_lesson_date || "",

        term_oto_weekday: row.term_oto_weekday ?? 1,
        term_oto_test_time: (row.term_oto_test_time || "").slice(0, 5),
        term_oto_class_time: (row.term_oto_class_time || "").slice(0, 5),
        term_read_weekday: row.term_read_weekday ?? 1,
        term_read_class_time: (row.term_read_class_time || "").slice(0, 5),

        winter_oto_weekday: row.winter_oto_weekday ?? 1,
        winter_oto_test_time: (row.winter_oto_test_time || "").slice(0, 5),
        winter_oto_class_time: (row.winter_oto_class_time || "").slice(0, 5),
        winter_read_weekday: row.winter_read_weekday ?? 1,
        winter_read_class_time: (row.winter_read_class_time || "").slice(0, 5),

        extras_term: extrasTerm,
        extras_winter: extrasWinter,
      });

      // ✅ 수정 시작할 때는 위로 올라가도 자연스러워서 유지
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      toast(e?.message || "불러오기 실패", true);
    }
  }

  function toggleExtra(season, weekday, checked) {
    setForm((prev) => {
      const key = season === "term" ? "extras_term" : "extras_winter";
      const cur = { ...(prev[key] || {}) };
      const w = String(weekday);

      if (checked) {
        if (cur[w] === undefined) cur[w] = "";
      } else {
        delete cur[w];
      }

      return { ...prev, [key]: cur };
    });
  }

  function setExtraTime(season, weekday, timeStr) {
    // 입력 중에는 검증하지 않고 그대로 넣고, 저장 시 검증
    setForm((prev) => {
      const key = season === "term" ? "extras_term" : "extras_winter";
      const cur = { ...(prev[key] || {}) };
      cur[String(weekday)] = timeStr;
      return { ...prev, [key]: cur };
    });
  }

  function applyWinterAutoFill() {
    setForm((prev) => {
      const termOtoWd = Number(prev.term_oto_weekday);
      const termReadWd = Number(prev.term_read_weekday);

      const isSatOto = termOtoWd === 6;
      const isSatRead = termReadWd === 6;

      const winter_oto_weekday = termOtoWd;
      const winter_read_weekday = termReadWd;

      const winter_oto_test_time = isSatOto ? prev.term_oto_test_time : shiftMinus3HoursHHMM(prev.term_oto_test_time);
      const winter_oto_class_time = isSatOto ? prev.term_oto_class_time : shiftMinus3HoursHHMM(prev.term_oto_class_time);
      const winter_read_class_time = isSatRead ? prev.term_read_class_time : shiftMinus3HoursHHMM(prev.term_read_class_time);

      // 추가등원: 요일별 (토요일은 그대로)
      const nextExtrasWinter = {};
      const termMap = prev.extras_term || {};
      for (const wdStr of Object.keys(termMap)) {
        const wd = Number(wdStr);
        const t = termMap[wdStr];
        nextExtrasWinter[wdStr] = wd === 6 ? t : shiftMinus3HoursHHMM(t);
      }

      return {
        ...prev,
        winter_oto_weekday,
        winter_oto_test_time,
        winter_oto_class_time,
        winter_read_weekday,
        winter_read_class_time,
        extras_winter: nextExtrasWinter,
      };
    });

    toast("겨울방학 자동 채움 완료!");
  }

  function openWithdraw(row) {
    setWithdrawModal({ open: true, student: row, date: "" });
  }

  async function confirmWithdraw() {
    const row = withdrawModal.student;
    const date = (withdrawModal.date || "").trim();
    if (!row?.id) return;

    if (!date) {
      toast("퇴원일을 선택해주세요.", true);
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.from("students").update({ withdrawal_date: date }).eq("id", row.id);
      if (error) throw error;

      toast("퇴원 처리 완료!");
      setWithdrawModal({ open: false, student: null, date: "" });
      await loadAll();
    } catch (e) {
      console.error(e);
      toast(e?.message || "퇴원 처리 실패", true);
    } finally {
      setBusy(false);
    }
  }

  async function clearWithdraw(row) {
    if (!row?.id) return;
    try {
      setBusy(true);
      const { error } = await supabase.from("students").update({ withdrawal_date: null }).eq("id", row.id);
      if (error) throw error;
      toast("퇴원 해제 완료!");
      await loadAll();
    } catch (e) {
      console.error(e);
      toast(e?.message || "퇴원 해제 실패", true);
    } finally {
      setBusy(false);
    }
  }

  const topActions = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {loading ? <span style={{ color: COLORS.sub, fontSize: 13 }}>불러오는 중…</span> : null}
      <Button variant="ghost" onClick={loadAll} disabled={busy || loading}>
        새로고침
      </Button>
      <Button variant="soft" onClick={resetForm} disabled={busy}>
        폼 초기화
      </Button>
      <Button variant="primary" onClick={upsertStudentAndExtras} disabled={busy}>
        {busy ? "저장 중…" : form.id ? "수정 저장" : "학생 등록"}
      </Button>
    </div>
  );

  const bottomSave = (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
      <Button variant="primary" onClick={upsertStudentAndExtras} disabled={busy} style={{ height: 44, padding: "0 18px" }}>
        {busy ? "저장 중…" : form.id ? "수정 저장" : "학생 등록"}
      </Button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      <div style={{ width: "min(1200px, 100%)", margin: "0 auto", padding: "26px 16px 80px" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.text, letterSpacing: "-0.2px" }}>학생관리</div>
            <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 6 }}>
              학생 정보 + 수업 규칙(학기중/겨울방학)을 저장하면, DB 트리거가 자동으로 시간표 이벤트를 생성해요.
            </div>
          </div>
          {topActions}
        </div>

        {/* 토스트 */}
        {(err || msg) && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 14,
              border: `1px solid ${err ? COLORS.danger : COLORS.line}`,
              background: err ? COLORS.dangerSoft : COLORS.blueSoft,
              color: COLORS.text,
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {err || msg}
          </div>
        )}

        <ThinDivider />

        {/* 등록/수정 폼 */}
        <SectionTitle title={form.id ? "학생 수정" : "학생 등록"} desc="추가등원은 선택사항(체크한 요일만 시간 입력)" />

        {/* ✅ 1줄: 이름/학교/학년 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <Input label="이름" required value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div style={{ gridColumn: "span 5" }}>
            <Input label="학교" required value={form.school} onChange={(e) => setField("school", e.target.value)} placeholder="예: 산본고등학교" />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <Input label="학년" required value={form.grade} onChange={(e) => setField("grade", e.target.value)} placeholder="예: 중3" />
          </div>
        </div>

        {/* ✅ 2줄: 담당선생님/휴대폰/첫수업일 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <Input label="담당선생님" required value={form.teacher_name} onChange={(e) => setField("teacher_name", e.target.value)} placeholder="예: 김땡땡T" />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="휴대폰번호(숫자만)"
              required
              value={form.phone_digits}
              onChange={(e) => setField("phone_digits", normalizePhoneDigits(e.target.value))}
              placeholder="01012345678"
              inputMode="numeric"
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input label="첫수업일" required type="date" value={form.first_lesson_date} onChange={(e) => setField("first_lesson_date", e.target.value)} />
          </div>
        </div>

        <ThinDivider />

        {/* 학기중 */}
        <SectionTitle title="학기중 수업 규칙" desc="요일은 월~토만, 시간은 24시 HH:MM(예: 13:00)로 직접 입력" />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <Select label="일대일 요일" required value={form.term_oto_weekday} onChange={(e) => setField("term_oto_weekday", e.target.value)}>
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}요일
                </option>
              ))}
            </Select>
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="일대일 테스트 시간"
              required
              value={form.term_oto_test_time}
              onChange={(e) => setField("term_oto_test_time", e.target.value)}
              placeholder="예: 13:00"
              hint="24시 기준 HH:MM"
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="일대일 수업 시간"
              required
              value={form.term_oto_class_time}
              onChange={(e) => setField("term_oto_class_time", e.target.value)}
              placeholder="예: 13:20"
              hint="24시 기준 HH:MM"
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <Select label="독해 요일" required value={form.term_read_weekday} onChange={(e) => setField("term_read_weekday", e.target.value)}>
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}요일
                </option>
              ))}
            </Select>
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="독해 수업 시간"
              required
              value={form.term_read_class_time}
              onChange={(e) => setField("term_read_class_time", e.target.value)}
              placeholder="예: 15:40"
              hint="24시 기준 HH:MM"
            />
          </div>
        </div>

        {/* 학기중 추가등원 */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 1000, color: COLORS.text }}>추가등원(선택)</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 6 }}>요일 체크 → 해당 요일 시간 입력칸 표시</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 10 }}>
            {WEEKDAYS.map((w) => {
              const checked = form.extras_term?.[String(w.v)] !== undefined;
              return (
                <div key={`term-extra-${w.v}`} style={{ gridColumn: "span 3", padding: "8px 0", borderBottom: `1px solid ${COLORS.line2}` }}>
                  <CheckboxRow checked={checked} label={`${w.label}요일`} onChange={(v) => toggleExtra("term", w.v, v)} />
                  {checked ? (
                    <div style={{ marginTop: 8 }}>
                      <Input
                        label="시간"
                        required
                        value={form.extras_term?.[String(w.v)] || ""}
                        onChange={(e) => setExtraTime("term", w.v, e.target.value)}
                        placeholder="예: 16:00"
                        hint="24시 기준 HH:MM"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <ThinDivider />

        {/* 겨울방학 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <SectionTitle title="겨울방학 수업 규칙" desc="토요일은 동일, 나머지는 -3시간 자동 채움" />
          <Button variant="soft" onClick={applyWinterAutoFill} disabled={busy}>
            3시간씩 앞당기기(토요일 제외)
          </Button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <Select label="일대일 요일" required value={form.winter_oto_weekday} onChange={(e) => setField("winter_oto_weekday", e.target.value)}>
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}요일
                </option>
              ))}
            </Select>
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="일대일 테스트 시간"
              required
              value={form.winter_oto_test_time}
              onChange={(e) => setField("winter_oto_test_time", e.target.value)}
              placeholder="예: 10:00"
              hint="24시 기준 HH:MM"
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="일대일 수업 시간"
              required
              value={form.winter_oto_class_time}
              onChange={(e) => setField("winter_oto_class_time", e.target.value)}
              placeholder="예: 10:20"
              hint="24시 기준 HH:MM"
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <Select label="독해 요일" required value={form.winter_read_weekday} onChange={(e) => setField("winter_read_weekday", e.target.value)}>
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}요일
                </option>
              ))}
            </Select>
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <Input
              label="독해 수업 시간"
              required
              value={form.winter_read_class_time}
              onChange={(e) => setField("winter_read_class_time", e.target.value)}
              placeholder="예: 12:00"
              hint="24시 기준 HH:MM"
            />
          </div>
        </div>

        {/* 겨울방학 추가등원 */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 1000, color: COLORS.text }}>추가등원(선택)</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 6 }}>요일 체크 → 해당 요일 시간 입력칸 표시</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 10 }}>
            {WEEKDAYS.map((w) => {
              const checked = form.extras_winter?.[String(w.v)] !== undefined;
              return (
                <div key={`winter-extra-${w.v}`} style={{ gridColumn: "span 3", padding: "8px 0", borderBottom: `1px solid ${COLORS.line2}` }}>
                  <CheckboxRow checked={checked} label={`${w.label}요일`} onChange={(v) => toggleExtra("winter", w.v, v)} />
                  {checked ? (
                    <div style={{ marginTop: 8 }}>
                      <Input
                        label="시간"
                        required
                        value={form.extras_winter?.[String(w.v)] || ""}
                        onChange={(e) => setExtraTime("winter", w.v, e.target.value)}
                        placeholder="예: 13:00"
                        hint="24시 기준 HH:MM"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* ✅ 아래 저장 버튼 추가 */}
        {bottomSave}

        <ThinDivider />

        {/* 학생 목록 */}
        <SectionTitle title="학생 목록" desc="이름순 · 번호 · 만능 검색" />

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Input label="만능 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름/학교/학년/선생님/전화/수업정보…" />
          </div>
          <div style={{ fontSize: 12, color: COLORS.sub, paddingTop: 18 }}>
            총 <b style={{ color: COLORS.text }}>{filtered.length}</b>명
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 12, borderTop: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, background: "transparent" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={thStyle(60)}>#</th>
                <th style={thStyle(120)}>이름</th>
                <th style={thStyle(180)}>학교</th>
                <th style={thStyle(90)}>학년</th>
                <th style={thStyle(120)}>담당</th>
                <th style={thStyle(460)}>학기중(요약)</th>
                <th style={thStyle(160)}>상태</th>
                <th style={thStyle(200)}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => {
                const ex = extrasByStudent[r.id] || { term: {}, winter: {} };
                const termSummary = buildTermSummary(r, ex.term);
                const status = r.withdrawal_date ? `퇴원(${r.withdrawal_date})` : "재원";
                return (
                  <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.line2}` }}>
                    <td style={tdStyle(60)}>{idx + 1}</td>
                    <td style={tdStyle(120)}>
                      <div style={{ fontWeight: 1000, color: COLORS.text }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>{r.phone_digits}</div>
                    </td>
                    <td style={tdStyle(180)}>{r.school}</td>
                    <td style={tdStyle(90)}>{r.grade}</td>
                    <td style={tdStyle(120)}>{r.teacher_name}</td>
                    <td style={tdStyle(460)}>
                      <div style={{ color: COLORS.text, fontWeight: 900, lineHeight: 1.35 }}>{termSummary}</div>
                      <div style={{ color: COLORS.sub, fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>
                        겨울: {buildWinterSummary(r, ex.winter)}
                      </div>
                    </td>
                    <td style={tdStyle(160)}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${COLORS.line}`,
                          background: r.withdrawal_date ? COLORS.dangerSoft : "rgba(26,143,91,0.10)",
                          fontWeight: 1000,
                          color: COLORS.text,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: r.withdrawal_date ? COLORS.danger : COLORS.ok }} />
                        {status}
                      </span>
                    </td>
                    <td style={tdStyle(200)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Button variant="ghost" onClick={() => startEdit(r)} disabled={busy}>
                          수정
                        </Button>
                        {r.withdrawal_date ? (
                          <Button variant="soft" onClick={() => clearWithdraw(r)} disabled={busy}>
                            퇴원해제
                          </Button>
                        ) : (
                          <Button variant="danger" onClick={() => openWithdraw(r)} disabled={busy}>
                            퇴원
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td colSpan={8} style={{ padding: 18, color: COLORS.sub }}>
                    {loading ? "불러오는 중…" : "학생이 없습니다. 위 폼에서 학생을 등록해보세요."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 퇴원 모달 */}
        <Modal
          open={withdrawModal.open}
          title={withdrawModal.student ? `퇴원 처리: ${withdrawModal.student.name}` : "퇴원 처리"}
          onClose={() => setWithdrawModal({ open: false, student: null, date: "" })}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ color: COLORS.sub, fontSize: 13, lineHeight: 1.5 }}>
              퇴원일을 선택하면, <b>퇴원일 이후</b>의 수업 이벤트는 DB 트리거로 자동 정리돼요.
            </div>
            <Input label="퇴원일" required type="date" value={withdrawModal.date} onChange={(e) => setWithdrawModal((p) => ({ ...p, date: e.target.value }))} />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Button variant="ghost" onClick={() => setWithdrawModal({ open: false, student: null, date: "" })} disabled={busy}>
                취소
              </Button>
              <Button variant="danger" onClick={confirmWithdraw} disabled={busy}>
                {busy ? "처리 중…" : "퇴원 확정"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}

function thStyle(w) {
  return {
    width: w,
    padding: "10px 10px",
    color: COLORS.sub,
    fontSize: 12,
    fontWeight: 1000,
    whiteSpace: "nowrap",
  };
}

function tdStyle(w) {
  return {
    width: w,
    padding: "12px 10px",
    verticalAlign: "top",
    color: COLORS.text,
    fontSize: 13,
  };
}
