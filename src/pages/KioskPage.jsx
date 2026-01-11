// src/pages/KioskPage.jsx
import { useMemo, useRef, useState, useEffect } from "react";
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
  white: "#ffffff",
  blue: "#2f6fed",
  red: "#e54848",
  green: "#0f9d58",
};

function onlyDigits(v) {
  return (v || "").replace(/\D/g, "");
}

// ✅ students.phone_digits 제약(8~11자리)과 동일하게 제한
function clampPhoneDigits(v) {
  return onlyDigits(v).slice(0, 11);
}

function beepOk() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    // ignore
  }
}
function beepErr() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 220;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // ignore
  }
}

// ✅ 분류 규칙(필요하면 여기만 바꾸면 됨)
function classifyKind(row) {
  const k = (row?.kind || "").toLowerCase();

  if (k === "reading") return "reading"; // 독해(보강 포함)
  if (k === "oto" || k === "one_to_one" || k === "1to1") return "oto"; // 일대일(보강 포함)
  if (k === "extra" || k === "extra_attendance" || k === "add") return "extra"; // 추가등원
  return "other";
}

/** ✅ 컨페티 조각 생성(고정 시드 없이 매번 랜덤) */
function makeConfettiPieces(count = 140) {
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const left = Math.random() * 100; // vw%
    const size = 6 + Math.random() * 10; // px
    const delay = Math.random() * 0.6; // s
    const dur = 1.9 + Math.random() * 1.2; // s
    const drift = (Math.random() * 2 - 1) * 120; // px
    const rot = Math.random() * 720; // deg
    const opacity = 0.75 + Math.random() * 0.25;

    pieces.push({
      id: `c${i}-${Math.random().toString(16).slice(2)}`,
      left,
      size,
      delay,
      dur,
      drift,
      rot,
      opacity,
    });
  }
  return pieces;
}

/**
 * ✅ 공통 오버레이 (미리보기/실제보상 둘 다 사용)
 * - variant: "preview" | "reward"
 */
function MonthEndOverlay({ open, onClose, variant = "preview" }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!open) return;
    setPieces(makeConfettiPieces(160));
  }, [open]);

  if (!open) return null;

  const isReward = variant === "reward";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(10, 18, 35, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* 애니메이션 keyframes */}
      <style>{`
        @keyframes kioskConfettiFall {
          0% {
            transform: translate3d(var(--dx), -12vh, 0) rotate(0deg);
            opacity: var(--op);
          }
          100% {
            transform: translate3d(calc(var(--dx) + var(--drift)), 110vh, 0) rotate(var(--rot));
            opacity: 0.9;
          }
        }
        @keyframes kioskPop {
          0% { transform: scale(0.96); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes kioskGlow {
          0% { box-shadow: 0 10px 30px rgba(47,111,237,0.18); }
          100% { box-shadow: 0 16px 44px rgba(47,111,237,0.28); }
        }
      `}</style>

      {/* confetti layer */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        {pieces.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.left}vw`,
              top: 0,
              width: `${p.size}px`,
              height: `${Math.max(6, p.size * 0.6)}px`,
              borderRadius: 4,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.55))",
              border: "1px solid rgba(255,255,255,0.35)",
              transform: "translate3d(0, -12vh, 0)",
              opacity: p.opacity,
              animationName: "kioskConfettiFall",
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              animationTimingFunction: "cubic-bezier(.15,.75,.25,1)",
              animationIterationCount: 1,
              // CSS 변수로 드리프트/회전 전달
              ["--dx"]: "0px",
              ["--drift"]: `${p.drift}px`,
              ["--rot"]: `${p.rot}deg`,
              ["--op"]: p.opacity,
              filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.12))",
            }}
          />
        ))}
      </div>

      {/* content card */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 96vw)",
          borderRadius: 22,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(31,42,68,0.12)",
          backdropFilter: "blur(10px)",
          padding: "22px 18px",
          textAlign: "center",
          animation: "kioskPop 180ms ease-out, kioskGlow 900ms ease-in-out infinite alternate",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 1000, color: COLORS.sub }}>
          {isReward ? "🎉 월말 보상!" : "🎉 월말 보상 화면 미리보기"}
        </div>

        <div
          style={{
            marginTop: 10,
            fontSize: 22,
            fontWeight: 1000,
            color: COLORS.text,
            letterSpacing: -0.2,
            lineHeight: 1.35,
          }}
        >
          한달동안 수업시간을 잘지켰네요!
          <br />
          데스크에서 과자를 받아가세요!!
        </div>

        <div style={{ marginTop: 12, fontSize: 13, color: COLORS.sub, fontWeight: 800 }}>
          {isReward ? "(자동 표시) · 바깥을 클릭하거나 잠시 후 자동으로 닫혀요." : "(테스트용 화면) · 바깥을 클릭하거나 잠시 후 자동으로 닫혀요."}
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 40,
              padding: "0 16px",
              borderRadius: 999,
              border: "1px solid rgba(31,42,68,0.16)",
              background: "#fff",
              color: COLORS.text,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KioskPage() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [student, setStudent] = useState(null); // { id, name, school, grade, teacher_name }
  const [result, setResult] = useState(null); // { totals, updatedByBucket, updatedCount, rowsCount, ... }
  const [err, setErr] = useState("");

  const inputRef = useRef(null);

  // ✅ 월말테스트(미리보기) 상태
  const [monthEndPreviewOpen, setMonthEndPreviewOpen] = useState(false);
  const previewTimerRef = useRef(null);

  // ✅ 실제 월말 보상(자동) 상태
  const [monthEndRewardOpen, setMonthEndRewardOpen] = useState(false);
  const rewardTimerRef = useRef(null);

  function openMonthEndPreview() {
    // 기존 기능 영향 X: 단순 UI 미리보기만
    setMonthEndPreviewOpen(true);
    try {
      beepOk();
    } catch {
      // ignore
    }

    // 4초 후 자동 닫기
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      setMonthEndPreviewOpen(false);
      previewTimerRef.current = null;
    }, 4000);
  }

  function openMonthEndRewardOnce(studentId, monthKey) {
    // ✅ 같은 학생/같은 달에 1번만
    const lsKey = `kiosk_month_reward_shown__${studentId}__${monthKey}`;
    if (localStorage.getItem(lsKey) === "1") return;
    localStorage.setItem(lsKey, "1");

    setMonthEndRewardOpen(true);
    try {
      beepOk();
    } catch {
      // ignore
    }

    // 4초 후 자동 닫기
    if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    rewardTimerRef.current = setTimeout(() => {
      setMonthEndRewardOpen(false);
      rewardTimerRef.current = null;
    }, 4000);
  }

  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    };
  }, []);

  // ✅ 학생 번호 = students.phone_digits 로 확정
  async function findStudentByCode(phoneDigits) {
    const { data, error } = await supabase
      .from("students")
      .select("id, name, school, grade, teacher_name")
      .eq("phone_digits", phoneDigits)
      .maybeSingle();

    if (error) throw error;
    return data; // 없으면 null
  }

  async function loadTodayEvents(studentId) {
    const { data, error } = await supabase
      .from("student_events")
      .select("id, kind, start_time, makeup_time, attendance_status, original_event_id, event_date, event_kind, late_minutes")
      .eq("student_id", studentId)
      .eq("event_date", today)
      .order("start_time", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  function summarize(rows) {
    const init = {
      oto: { total: 0, willUpdate: 0 },
      reading: { total: 0, willUpdate: 0 },
      extra: { total: 0, willUpdate: 0 },
      other: { total: 0, willUpdate: 0 },
    };

    for (const r of rows) {
      const bucket = classifyKind(r);
      init[bucket].total += 1;

      const already = String(r.attendance_status || "").toLowerCase() === "present";
      if (!already) init[bucket].willUpdate += 1;
    }
    return init;
  }

  async function markPresent(rows) {
    const now = new Date();

    const toUpdate = rows.filter(
      (r) => String(r.attendance_status || "").toLowerCase() !== "present"
    );

    if (toUpdate.length === 0) {
      return { updatedCount: 0, updatedIds: [] };
    }

    const ids = toUpdate.map((r) => r.id);

    const { error } = await supabase
      .from("student_events")
      .update({
        attendance_status: "present",
        attended_at: now.toISOString(),
        late_minutes: 0, // ✅ 칼같이: 키오스크 출석은 무조건 0
      })
      .in("id", ids);

    if (error) throw error;

    return { updatedCount: ids.length, updatedIds: ids };
  }

  /**
   * ✅ 월말 보상 조건 검사 (자동)
   * 조건:
   * 1) 이번 달(달력 기준) student_events 중 (oto_test 제외) "표시 대상 수업"이 1개 이상 존재
   * 2) 그 달의 모든 표시 대상 수업이 attendance_status='present' AND late_minutes === 0 (null 불가)
   * 3) today가 그 학생의 "이번 달 마지막 수업 날짜"와 같을 때 (학생 기준 마지막 수업)
   */
  async function checkAndMaybeShowMonthEndReward(studentId) {
    const mStart = dayjs(today).startOf("month").format("YYYY-MM-DD");
    const mEnd = dayjs(today).endOf("month").format("YYYY-MM-DD");
    const monthKey = dayjs(today).format("YYYY-MM"); // 로컬스토리지 중복 방지 키

    const { data, error } = await supabase
      .from("student_events")
      .select("id, event_date, kind, event_kind, attendance_status, late_minutes")
      .eq("student_id", studentId)
      .gte("event_date", mStart)
      .lte("event_date", mEnd)
      .in("kind", ["oto_class", "reading", "extra"]); // ✅ oto_test는 제외(조회 자체에서 배제)

    if (error) throw error;

    const rows = (data || [])
      // ✅ 보상 판단에 포함될 수업만 남김 (혹시 kind가 섞여 들어올 대비)
      .filter((r) => r.kind !== "oto_test");

    if (rows.length === 0) return;

    // 학생 기준 "이번 달 마지막 수업 날짜"
    let lastDate = "";
    for (const r of rows) {
      const d = String(r.event_date || "");
      if (!lastDate || d > lastDate) lastDate = d;
    }
    if (!lastDate) return;

    // 오늘이 그 학생의 마지막 수업 날짜가 아니면 보상 X
    if (today !== lastDate) return;

    // ✅ 완벽 출석(칼같이): present + late_minutes === 0 (null/undefined/양수 전부 탈락)
    const perfect = rows.every((r) => {
      if (String(r.attendance_status || "").toLowerCase() !== "present") return false;
      return r.late_minutes === 0;
    });

    if (!perfect) return;

    // ✅ 조건 충족 → 자동 보상 표시(달/학생 1회)
    openMonthEndRewardOnce(studentId, monthKey);
  }

  async function onSubmit() {
    const digits = onlyDigits(code);

    if (!digits) {
      setErr("학생 번호(휴대폰 숫자)를 입력해 주세요.");
      beepErr();
      inputRef.current?.focus();
      return;
    }

    // ✅ students.phone_digits 제약: 8~11자리
    if (digits.length < 8 || digits.length > 11) {
      setErr("학생 번호는 8~11자리 숫자여야 해요.");
      beepErr();
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setErr("");
    setStudent(null);
    setResult(null);

    try {
      const st = await findStudentByCode(digits);
      if (!st) {
        setErr("해당 학생을 찾을 수 없어요. (students.phone_digits 확인)");
        beepErr();
        return;
      }

      const rows = await loadTodayEvents(st.id);
      const totals = summarize(rows);

      const { updatedCount, updatedIds } = await markPresent(rows);

      const updatedByBucket = { oto: 0, reading: 0, extra: 0, other: 0 };
      for (const r of rows) {
        if (updatedIds.includes(r.id)) {
          const bucket = classifyKind(r);
          updatedByBucket[bucket] += 1;
        }
      }

      setStudent(st);
      setResult({
        totals,
        updatedByBucket,
        updatedCount,
        rowsCount: rows.length,
      });

      beepOk();

      // ✅ (추가) 출석 처리 직후 월말 보상 조건 검사
      // - 기존 출석 기능 영향 없음
      // - 조건 만족 시에만 자동 오버레이 표시
      try {
        await checkAndMaybeShowMonthEndReward(st.id);
      } catch {
        // 월말보상은 부가기능이므로 실패해도 출석 자체는 유지
      }

      // 다음 학생 입력을 위해 자동 초기화/포커스
      setCode("");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setErr(e?.message || "처리 중 오류가 발생했어요.");
      beepErr();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") onSubmit();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(180deg, ${COLORS.bgTop}, ${COLORS.bgBottom})`,
        color: COLORS.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
      }}
    >
      {/* ✅ 우상단 월말테스트 버튼(기존 기능 영향 X) */}
      <button
        type="button"
        onClick={openMonthEndPreview}
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          right: 12,
          zIndex: 99998,
          height: 38,
          padding: "0 14px",
          borderRadius: 999,
          border: `1px solid ${COLORS.line}`,
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(8px)",
          fontWeight: 1000,
          cursor: "pointer",
        }}
        title="월말 보상 화면 미리보기"
      >
        월말테스트
      </button>

      {/* ✅ 월말 보상 화면 미리보기 오버레이 */}
      <MonthEndOverlay
        open={monthEndPreviewOpen}
        onClose={() => setMonthEndPreviewOpen(false)}
        variant="preview"
      />

      {/* ✅ 월말 자동 보상 오버레이 */}
      <MonthEndOverlay
        open={monthEndRewardOpen}
        onClose={() => setMonthEndRewardOpen(false)}
        variant="reward"
      />

      <div style={{ width: "min(920px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.2 }}>
            키오스크 출석체크
          </div>
          <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 13 }}>
            오늘 날짜: <b>{today}</b> · 학생 번호(휴대폰 숫자만) 입력 후 Enter
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(clampPhoneDigits(e.target.value))}
            onKeyDown={onKeyDown}
            inputMode="numeric"
            placeholder="휴대폰 번호(숫자만)"
            disabled={busy}
            style={{
              width: "min(420px, 92vw)",
              height: 58,
              borderRadius: 16,
              border: `1px solid ${COLORS.line}`,
              outline: "none",
              padding: "0 16px",
              fontSize: 22,
              fontWeight: 900,
              textAlign: "center",
              background: COLORS.white,
            }}
          />

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            style={{
              height: 58,
              minWidth: 120,
              borderRadius: 16,
              border: `1px solid ${COLORS.line}`,
              background: COLORS.white,
              fontWeight: 900,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "처리중..." : "출석체크"}
          </button>

          <button
            type="button"
            onClick={() => {
              setErr("");
              setStudent(null);
              setResult(null);
              setCode("");
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            disabled={busy}
            style={{
              height: 58,
              minWidth: 120,
              borderRadius: 16,
              border: `1px solid ${COLORS.line}`,
              background: "transparent",
              fontWeight: 900,
              cursor: busy ? "default" : "pointer",
            }}
          >
            초기화
          </button>
        </div>

        {err ? (
          <div
            style={{
              textAlign: "center",
              color: COLORS.red,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            {err}
          </div>
        ) : null}

        {student && result ? (
          <div
            style={{
              marginTop: 14,
              borderTop: `1px solid ${COLORS.line}`,
              paddingTop: 16,
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>
                {student.name}{" "}
                <span style={{ color: COLORS.sub, fontWeight: 700, fontSize: 14 }}>
                  ({student.school || "-"} / {student.grade || "-"})
                </span>
              </div>

              {result.rowsCount === 0 ? (
                <div style={{ color: COLORS.sub, fontSize: 13, marginTop: 6 }}>
                  오늘 잡힌 수업이 없어요.
                </div>
              ) : (
                <div style={{ color: COLORS.sub, fontSize: 13, marginTop: 6 }}>
                  오늘 수업 {result.rowsCount}개 중 이번 입력으로{" "}
                  <b style={{ color: COLORS.blue }}>{result.updatedCount}개</b> 출석 처리됨
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <Stat
                title="일대일(보강 포함)"
                total={result.totals.oto.total}
                updated={result.updatedByBucket.oto}
              />
              <Stat
                title="독해(보강 포함)"
                total={result.totals.reading.total}
                updated={result.updatedByBucket.reading}
              />
              <Stat
                title="추가등원"
                total={result.totals.extra.total}
                updated={result.updatedByBucket.extra}
              />
            </div>

            {(result.totals.other.total || 0) > 0 ? (
              <div
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: COLORS.sub,
                  fontSize: 12,
                }}
              >
                참고: 알 수 없는 kind 수업 {result.totals.other.total}개가 있어요(집계 제외). DB의 kind 값을 확인해 주세요.
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: COLORS.sub, fontSize: 13, marginTop: 18 }}>
            학생 번호(휴대폰 숫자)를 입력하면 <b>오늘 잡힌 수업 전체</b>가 출석 처리됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ title, total, updated }) {
  return (
    <div
      style={{
        border: `1px solid rgba(31,42,68,0.14)`,
        borderRadius: 18,
        padding: 14,
        background: "rgba(255,255,255,0.7)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(31,42,68,0.78)" }}>
        {title}
      </div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 1000 }}>
        {updated}
        <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(31,42,68,0.55)" }}>
          {" "}
          / {total}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "rgba(31,42,68,0.55)" }}>
        이번 입력으로 출석 처리된 수 / 오늘 수업 총 개수
      </div>
    </div>
  );
}
