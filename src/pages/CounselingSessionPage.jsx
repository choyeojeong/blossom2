// src/pages/CounselingSessionPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/ko";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
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
};

const WEEKDAYS = [
  { v: 1, label: "월" },
  { v: 2, label: "화" },
  { v: 3, label: "수" },
  { v: 4, label: "목" },
  { v: 5, label: "금" },
  { v: 6, label: "토" },
];

function wLabel(v) {
  return WEEKDAYS.find((x) => x.v === Number(v))?.label || "-";
}

function clampInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function safeText(v) {
  const s = (v || "").toString().trim();
  return s ? s : "-";
}

// ✅ "16:00:00" -> "16:00"
function fmtTimeHM(v) {
  const s = (v || "").toString().trim();
  if (!s) return "-";
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function pct(score, max) {
  const m = clampInt(max);
  if (m <= 0) return 0;
  const p = (clampInt(score) / m) * 100;
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

// ✅ Promise 타임아웃 유틸
function withTimeout(promise, ms, message = "시간 초과") {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms)),
  ]);
}

/**
 * ✅ 레이더 차트(SVG)
 * - chartSize: 그래프 크기
 * - margin: 라벨 여백(캔버스)
 * - shiftX: 그래프 중심을 오른쪽으로 이동(긴 라벨 잘림 방지)
 * ✅ 추가:
 * - extraRight/extraLeft: SVG 자체 가로폭을 늘려 라벨이 캔버스 밖으로 안 나가게
 * - noWrap: PDF에서 차트+요약 줄바꿈 방지
 * - labelFontSize: 라벨 폰트 크기
 */
function RadarChart({
  areas,
  scoresMap,
  chartSize = 320,
  margin = 80,
  shiftX = 0,
  showSummary = true,
  extraRight = 140,
  extraLeft = 0,
  noWrap = false,
  labelFontSize = 14,
}) {
  const items = (areas || []).map((a) => {
    const row = scoresMap?.[a.id] || {};
    const sc = clampInt(row.score ?? 0);
    const mx = clampInt(row.max ?? a.max_score ?? 0);
    return { id: a.id, name: a.name || "", score: sc, max: mx, p: pct(sc, mx) };
  });

  const n = items.length;
  if (!n) return null;

  const svgW = chartSize + margin * 2 + extraLeft + extraRight;
  const svgH = chartSize + margin * 2;

  const cx = margin + extraLeft + chartSize / 2 + shiftX;
  const cy = margin + chartSize / 2;

  const pad = 16;
  const R = chartSize / 2 - pad;

  const angleAt = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  const pt = (r, i) => {
    const ang = angleAt(i);
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
  };

  const gridSteps = [0.25, 0.5, 0.75, 1.0];
  const gridPolys = gridSteps.map((k) => {
    const r = R * k;
    return items
      .map((_, i) => {
        const p = pt(r, i);
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      })
      .join(" ");
  });

  const dataPoly = items
    .map((it, i) => {
      const r = R * (it.p / 100);
      const p = pt(r, i);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");

  const labelR = R + 28;

  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        flexWrap: noWrap ? "nowrap" : "wrap",
        alignItems: "center",
        overflow: "visible",
      }}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{
          background: "#ffffff",
          border: `1px solid ${COLORS.lineSoft}`,
          borderRadius: 14,
          overflow: "visible",
          flex: "0 0 auto",
        }}
      >
        {/* 축 */}
        {items.map((_, i) => {
          const a = pt(R, i);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={a.x}
              y2={a.y}
              stroke={COLORS.lineSoft}
              strokeWidth="1"
            />
          );
        })}

        {/* 그리드 */}
        {gridPolys.map((poly, idx) => (
          <polygon
            key={`grid-${idx}`}
            points={poly}
            fill="none"
            stroke={COLORS.lineSoft}
            strokeWidth="1"
          />
        ))}

        {/* 데이터 */}
        <polygon points={dataPoly} fill={COLORS.blueSoft} stroke={COLORS.blue} strokeWidth="2" />

        {/* 점 */}
        {items.map((it) => {
          const i = items.findIndex((x) => x.id === it.id);
          const r = R * (it.p / 100);
          const p = pt(r, i);
          return (
            <circle
              key={`dot-${it.id}`}
              cx={p.x}
              cy={p.y}
              r="3.2"
              fill={COLORS.blue}
              stroke="#ffffff"
              strokeWidth="1"
            />
          );
        })}

        {/* 라벨 */}
        {items.map((it, i) => {
          const p = pt(labelR, i);
          const anchor = p.x < cx - 6 ? "end" : p.x > cx + 6 ? "start" : "middle";
          const dy = p.y < cy ? -6 : 16;
          return (
            <text
              key={`label-${it.id}`}
              x={p.x}
              y={p.y + dy}
              fontSize={String(labelFontSize)}
              fill={COLORS.sub}
              textAnchor={anchor}
            >
              {it.name}
            </text>
          );
        })}
      </svg>

      {showSummary && (
        <div style={{ minWidth: 280, flex: "1 1 auto" }}>
          <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 15 }}>영역별 달성률</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
              <div
                key={`row-${it.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <div style={{ fontWeight: 900 }}>{it.name}</div>
                <div style={{ color: COLORS.sub }}>
                  {it.score}/{it.max} ({Math.round(it.p)}%)
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CounselingSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [type, setType] = useState(null);
  const [areas, setAreas] = useState([]);
  const [scores, setScores] = useState({}); // area_id -> { score, max }
  const [templatesByArea, setTemplatesByArea] = useState({});
  const [checkedTemplateIds, setCheckedTemplateIds] = useState(new Set());

  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // ✅ PDF 페이지를 2개로 분리
  const page1Ref = useRef(null);
  const page2Ref = useRef(null);

  // ✅ 로고 경로 (Vite base 경로 대응)
  const LOGO_SRC = `${import.meta.env.BASE_URL}blossom-logo.png`;

  const total = useMemo(() => {
    let s = 0;
    let m = 0;
    for (const a of areas) {
      const row = scores[a.id];
      s += clampInt(row?.score ?? 0);
      m += clampInt(row?.max ?? a.max_score ?? 0);
    }
    return { score: s, max: m };
  }, [areas, scores]);

  async function loadAll() {
    const { data: s, error: e1 } = await supabase
      .from("counsel_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (e1) return alert("상담 로드 실패: " + e1.message);
    setSession(s);

    const { data: t, error: e2 } = await supabase
      .from("counsel_test_types")
      .select("*")
      .eq("id", s.test_type_id)
      .single();
    if (e2) return alert("종류 로드 실패: " + e2.message);
    setType(t);

    const { data: a, error: e3 } = await supabase
      .from("counsel_areas")
      .select("*")
      .eq("test_type_id", s.test_type_id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (e3) return alert("영역 로드 실패: " + e3.message);
    setAreas(a || []);

    const { data: sc, error: e4 } = await supabase
      .from("counsel_session_scores")
      .select("*")
      .eq("session_id", sessionId);
    if (e4) return alert("점수 로드 실패: " + e4.message);

    const map = {};
    for (const row of sc || []) {
      map[row.area_id] = { score: row.score, max: row.max_score_snapshot };
    }
    for (const ar of a || []) {
      if (!map[ar.id]) map[ar.id] = { score: 0, max: ar.max_score };
    }
    setScores(map);

    if ((a || []).length) {
      const { data: tmp, error: e5 } = await supabase
        .from("counsel_comment_templates")
        .select("*")
        .in(
          "area_id",
          (a || []).map((x) => x.id)
        )
        .eq("is_active", true)
        .order("order_index", { ascending: true });
      if (e5) return alert("코멘트 템플릿 로드 실패: " + e5.message);

      const grouped = {};
      for (const row of tmp || []) {
        if (!grouped[row.area_id]) grouped[row.area_id] = [];
        grouped[row.area_id].push(row);
      }
      setTemplatesByArea(grouped);
    } else {
      setTemplatesByArea({});
    }

    const { data: cm, error: e6 } = await supabase
      .from("counsel_session_comment_map")
      .select("template_id")
      .eq("session_id", sessionId);
    if (e6) return alert("선택 코멘트 로드 실패: " + e6.message);
    setCheckedTemplateIds(new Set((cm || []).map((x) => x.template_id)));
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function toggleTemplate(id) {
    setCheckedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateScore(areaId, v) {
    const n = clampInt(v);
    setScores((prev) => ({
      ...prev,
      [areaId]: { ...(prev[areaId] || {}), score: n },
    }));
  }

  async function saveAll({ silent = false } = {}) {
    if (!session) return false;
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from("counsel_sessions")
        .update({
          student_name: session.student_name,
          student_school: session.student_school,
          student_grade: session.student_grade,
          teacher_name: session.teacher_name,
          test_date: session.test_date,

          oto_weekday: session.oto_weekday ?? null,
          oto_arrival_time: session.oto_arrival_time || null,
          oto_class_time: session.oto_class_time || null,

          reading_weekday: session.reading_weekday ?? null,
          reading_teacher_name: session.reading_teacher_name || null,
          reading_class_time: session.reading_class_time || null,

          first_book_vocab: session.first_book_vocab,
          first_book_grammar: session.first_book_grammar,
          first_book_reading: session.first_book_reading,

          overall_note: null, // ✅ 총평 미사용
        })
        .eq("id", sessionId);
      if (e1) throw e1;

      const rows = areas.map((a) => ({
        session_id: sessionId,
        area_id: a.id,
        score: clampInt(scores[a.id]?.score ?? 0),
        max_score_snapshot: clampInt(scores[a.id]?.max ?? a.max_score ?? 0),
      }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("counsel_session_scores").upsert(rows, {
          onConflict: "session_id,area_id",
        });
        if (e2) throw e2;
      }

      const { error: e3 } = await supabase
        .from("counsel_session_comment_map")
        .delete()
        .eq("session_id", sessionId);
      if (e3) throw e3;

      const ids = Array.from(checkedTemplateIds);
      if (ids.length) {
        const ins = ids.map((tid) => ({ session_id: sessionId, template_id: tid }));
        const { error: e4 } = await supabase.from("counsel_session_comment_map").insert(ins);
        if (e4) throw e4;
      }

      if (!silent) alert("저장 완료");
      return true;
    } catch (e) {
      alert("저장 실패: " + (e?.message || String(e)));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function waitForImages(rootEl, timeoutMs = 8000) {
    const imgs = Array.from(rootEl?.querySelectorAll?.("img") || []);
    if (!imgs.length) return;

    const tasks = imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 3000);
        })
    );

    try {
      await withTimeout(Promise.all(tasks), timeoutMs, "이미지 로딩 지연");
    } catch {}
  }

  function addCanvasAsPage(pdf, canvas, { marginMm = 8 } = {}) {
    const pageW = 210;
    const pageH = 297;
    const contentW = pageW - marginMm * 2;
    const contentH = pageH - marginMm * 2;

    const imgData = canvas.toDataURL("image/png");
    const imgProps = pdf.getImageProperties(imgData);

    const imgW = contentW;
    const imgH = (imgProps.height * imgW) / imgProps.width;

    // ✅ 각 페이지 DOM을 “페이지에 맞게” 만들었기 때문에,
    // 여기서는 한 페이지에만 넣고(넘치지 않게) 여백 기준으로 배치
    // 혹시라도 아주 미세하게 넘치면 높이에 맞춰 축소(잘림 방지)
    let drawW = imgW;
    let drawH = imgH;
    if (drawH > contentH) {
      const ratio = contentH / drawH;
      drawH = contentH;
      drawW = drawW * ratio;
    }

    const x = marginMm + (contentW - drawW) / 2;
    const y = marginMm + (contentH - drawH) / 2;

    pdf.addImage(imgData, "PNG", x, y, drawW, drawH);
  }

  // ===== PDF 생성(2페이지 고정) =====
  async function buildPdfBlob() {
    if (!page1Ref.current || !page2Ref.current) throw new Error("PDF 영역이 없습니다.");

    // 폰트 로딩 대기
    if (document?.fonts?.ready) {
      try {
        await withTimeout(document.fonts.ready, 3000, "폰트 로딩 지연");
      } catch {}
    }

    // 이미지 로딩 대기(페이지별)
    await waitForImages(page1Ref.current, 8000);
    await waitForImages(page2Ref.current, 8000);
    await new Promise((r) => setTimeout(r, 120));

    const commonOpts = {
      scale: 1.7,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollY: -window.scrollY,
    };

    const canvas1 = await withTimeout(
      html2canvas(page1Ref.current, {
        ...commonOpts,
        windowWidth: page1Ref.current.scrollWidth,
        windowHeight: page1Ref.current.scrollHeight,
      }),
      25000,
      "PDF(1페이지) 캡처가 너무 오래 걸립니다"
    );

    const canvas2 = await withTimeout(
      html2canvas(page2Ref.current, {
        ...commonOpts,
        windowWidth: page2Ref.current.scrollWidth,
        windowHeight: page2Ref.current.scrollHeight,
      }),
      25000,
      "PDF(2페이지) 캡처가 너무 오래 걸립니다"
    );

    const pdf = new jsPDF("p", "mm", "a4");
    addCanvasAsPage(pdf, canvas1, { marginMm: 8 });
    pdf.addPage();
    addCanvasAsPage(pdf, canvas2, { marginMm: 8 });

    return pdf.output("blob");
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const ok = await saveAll({ silent: true });
      if (!ok) return;

      const blob = await buildPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (session?.student_name || "학생").replace(/[\\/:*?"<>|]/g, "_");
      a.href = url;
      a.download = `레벨테스트_상담결과_${safeName}_${dayjs(session?.test_date).format("YYYYMMDD")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("PDF 다운로드 실패: " + (e?.message || String(e)));
    } finally {
      setPdfBusy(false);
    }
  }

  async function uploadPdfToStorage() {
    setPdfBusy(true);
    try {
      const ok = await saveAll({ silent: true });
      if (!ok) return;

      const blob = await buildPdfBlob();

      const safeName = (session?.student_name || "학생").replace(/[\\/:*?"<>|]/g, "_");
      const filename = `counsel_${dayjs(session?.test_date).format("YYYYMMDD")}_${safeName}_${sessionId}.pdf`;
      const path = `${dayjs(session?.test_date).format("YYYY-MM")}/${filename}`;

      const { error: e1 } = await supabase.storage
        .from("counseling_pdfs")
        .upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("counsel_sessions")
        .update({ pdf_path: path })
        .eq("id", sessionId);
      if (e2) throw e2;

      alert("PDF를 Supabase에 저장했어요.");
      await loadAll();
    } catch (e) {
      alert("PDF 업로드 실패: " + (e?.message || String(e)));
    } finally {
      setPdfBusy(false);
    }
  }

  const selectedCommentsByArea = useMemo(() => {
    const byArea = {};
    for (const a of areas) byArea[a.id] = [];
    for (const a of areas) {
      const list = templatesByArea[a.id] || [];
      for (const t of list) if (checkedTemplateIds.has(t.id)) byArea[a.id].push(t);
    }
    return byArea;
  }, [areas, templatesByArea, checkedTemplateIds]);

  // ===== 화면 스타일 =====
  const wrap = {
    minHeight: "100vh",
    padding: "calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 96px)",
    background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
    color: COLORS.text,
  };

  const h1 = { margin: 0, fontSize: 18, letterSpacing: -0.2 };
  const sub = { marginTop: 6, color: COLORS.sub, fontSize: 13 };

  const row = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };
  const input = {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    outline: "none",
    minWidth: 180,
  };

  const btn = {
    height: 42,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.blueSoft,
    cursor: "pointer",
    fontWeight: 900,
  };

  const bottomBar = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "10px 12px calc(env(safe-area-inset-bottom) + 10px)",
    background: "rgba(247,249,252,0.90)",
    backdropFilter: "blur(10px)",
    borderTop: `1px solid ${COLORS.lineSoft}`,
    zIndex: 60,
  };

  // ✅ PDF 캡처용 A4 픽셀 폭(96dpi 기준)
  const A4_PX_W = 794;
  const A4_PAD = 44;

  // ✅ PDF 타이포(디자인 유지 + 1페이지 맞춤용으로 “조금만” 조절)
  const pdfBase = {
    fontSize: 13.2,
    lineHeight: 1.42,
    color: COLORS.text,
    letterSpacing: -0.1,
  };

  const pdfCard = {
    background: "#ffffff",
    borderRadius: 16,
    border: `1px solid ${COLORS.lineSoft}`,
    boxShadow: "0 6px 18px rgba(31,42,68,0.06)",
  };

  const pdfTitle = { fontSize: 20.5, fontWeight: 900, marginBottom: 10, letterSpacing: -0.4 };
  const pdfMeta = { display: "flex", flexWrap: "wrap", gap: 10, color: COLORS.sub, fontSize: 13 };
  const pdfSectionTitle = { fontWeight: 900, marginBottom: 8, fontSize: 15.2 };
  const pdfSubTitle = { fontWeight: 900, color: COLORS.text, marginBottom: 2, fontSize: 13.6 };
  const pdfDivider = { borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10, marginTop: 10 };

  if (!session)
    return (
      <div style={wrap}>
        <div style={{ color: COLORS.sub }}>로딩중…</div>
      </div>
    );

  return (
    <>
      <div style={wrap}>
        {/* 상단: 제목만 */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <h1 style={h1}>상담 입력</h1>
            <div style={sub}>
              {type?.name || "-"} · {dayjs(session.test_date).format("YYYY-MM-DD")}
            </div>
          </div>
        </div>

        {/* 입력: 학생/담당 */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>학생 정보</div>
          <div style={row}>
            <input
              style={input}
              value={session.student_name || ""}
              onChange={(e) => setSession((p) => ({ ...p, student_name: e.target.value }))}
              placeholder="이름"
            />
            <input
              style={input}
              value={session.student_school || ""}
              onChange={(e) => setSession((p) => ({ ...p, student_school: e.target.value }))}
              placeholder="학교"
            />
            <input
              style={{ ...input, minWidth: 120 }}
              value={session.student_grade || ""}
              onChange={(e) => setSession((p) => ({ ...p, student_grade: e.target.value }))}
              placeholder="학년"
            />
            <input
              style={input}
              value={session.teacher_name || ""}
              onChange={(e) => setSession((p) => ({ ...p, teacher_name: e.target.value }))}
              placeholder="담당 선생님"
            />
            <input
              style={{ ...input, minWidth: 170 }}
              type="date"
              value={session.test_date || dayjs().format("YYYY-MM-DD")}
              onChange={(e) => setSession((p) => ({ ...p, test_date: e.target.value }))}
            />
          </div>
        </div>

        {/* 입력: 수업정보 */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>수업 정보 (PDF 상단에 표시)</div>

          <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 13 }}>일대일</div>
          <div style={row}>
            <select
              style={{ ...input, minWidth: 120 }}
              value={session.oto_weekday ?? 1}
              onChange={(e) => setSession((p) => ({ ...p, oto_weekday: Number(e.target.value) }))}
            >
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}
                </option>
              ))}
            </select>

            <input
              style={{ ...input, minWidth: 180 }}
              type="time"
              value={fmtTimeHM(session.oto_arrival_time || "")}
              onChange={(e) => setSession((p) => ({ ...p, oto_arrival_time: e.target.value }))}
              placeholder="등원시간"
            />
            <input
              style={{ ...input, minWidth: 180 }}
              type="time"
              value={fmtTimeHM(session.oto_class_time || "")}
              onChange={(e) => setSession((p) => ({ ...p, oto_class_time: e.target.value }))}
              placeholder="수업시간"
            />
          </div>

          <div style={{ height: 10 }} />

          <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 13 }}>독해</div>
          <div style={row}>
            <select
              style={{ ...input, minWidth: 120 }}
              value={session.reading_weekday ?? 1}
              onChange={(e) => setSession((p) => ({ ...p, reading_weekday: Number(e.target.value) }))}
            >
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}
                </option>
              ))}
            </select>

            <input
              style={{ ...input, minWidth: 220 }}
              value={session.reading_teacher_name || ""}
              onChange={(e) => setSession((p) => ({ ...p, reading_teacher_name: e.target.value }))}
              placeholder="독해 선생님 성함"
            />
            <input
              style={{ ...input, minWidth: 180 }}
              type="time"
              value={fmtTimeHM(session.reading_class_time || "")}
              onChange={(e) => setSession((p) => ({ ...p, reading_class_time: e.target.value }))}
              placeholder="독해 수업시간"
            />
          </div>
        </div>

        {/* 영역 점수 */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>
            영역별 점수{" "}
            <span style={{ color: COLORS.sub, fontSize: 12 }}>
              (총 {total.score}/{total.max})
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", borderTop: `1px solid ${COLORS.line}` }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: COLORS.sub }}>영역</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: COLORS.sub }}>점수</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: COLORS.sub }}>총점</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id}>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${COLORS.lineSoft}`, fontWeight: 900 }}>
                      {a.name}
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${COLORS.lineSoft}` }}>
                      <input
                        style={{ ...input, height: 36, minWidth: 120 }}
                        type="number"
                        value={scores[a.id]?.score ?? 0}
                        onChange={(e) => updateScore(a.id, e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "10px 8px", borderBottom: `1px solid ${COLORS.lineSoft}`, color: COLORS.sub }}>
                      {scores[a.id]?.max ?? a.max_score}
                    </td>
                  </tr>
                ))}
                {!areas.length && (
                  <tr>
                    <td style={{ padding: "10px 8px", color: COLORS.sub }} colSpan={3}>
                      이 테스트 종류에 영역이 없습니다. 먼저 /상담관리에서 영역을 추가해주세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 화면 레이더 */}
          <div style={{ marginTop: 12 }}>
            <RadarChart areas={areas} scoresMap={scores} chartSize={320} margin={80} shiftX={22} />
          </div>
        </div>

        {/* 코멘트 체크 */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>객관식 코멘트 선택</div>

          {areas.map((a) => (
            <div key={a.id} style={{ paddingTop: 10, borderTop: `1px solid ${COLORS.lineSoft}` }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>{a.name}</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                {(templatesByArea[a.id] || []).map((t) => (
                  <label key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checkedTemplateIds.has(t.id)}
                      onChange={() => toggleTemplate(t.id)}
                      style={{ width: 18, height: 18, marginTop: 2 }}
                    />
                    <div style={{ fontSize: 13, lineHeight: 1.35 }}>{t.content}</div>
                  </label>
                ))}
                {!templatesByArea[a.id]?.length && <div style={{ color: COLORS.sub, fontSize: 13 }}>코멘트 없음</div>}
              </div>
            </div>
          ))}
        </div>

        {/* 첫 교재 */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>첫 교재 정보</div>
          <div style={row}>
            <input
              style={{ ...input, minWidth: 260 }}
              value={session.first_book_vocab || ""}
              onChange={(e) => setSession((p) => ({ ...p, first_book_vocab: e.target.value }))}
              placeholder="단어책"
            />
            <input
              style={{ ...input, minWidth: 260 }}
              value={session.first_book_grammar || ""}
              onChange={(e) => setSession((p) => ({ ...p, first_book_grammar: e.target.value }))}
              placeholder="문법/구문책"
            />
            <input
              style={{ ...input, minWidth: 260 }}
              value={session.first_book_reading || ""}
              onChange={(e) => setSession((p) => ({ ...p, first_book_reading: e.target.value }))}
              placeholder="독해책"
            />
          </div>
        </div>

        {/* ===== PDF 미리보기 (2페이지) ===== */}
        <div style={{ marginTop: 18, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>PDF 미리보기</div>

          <div style={{ overflowX: "auto", paddingBottom: 8 }}>
            {/* ===== 1페이지 ===== */}
            <div
              ref={page1Ref}
              style={{
                ...pdfCard,
                ...pdfBase,
                width: A4_PX_W,
                margin: "0 auto",
                padding: A4_PAD,
                overflow: "visible",
              }}
            >
              <div style={pdfTitle}>산본 블라썸에듀 · 레벨테스트 상담결과</div>

              <div style={pdfMeta}>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>학생</span>: {safeText(session.student_name)}
                </div>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>학교</span>: {safeText(session.student_school)}
                </div>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>학년</span>: {safeText(session.student_grade)}
                </div>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>담당</span>: {safeText(session.teacher_name)}
                </div>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>테스트</span>: {safeText(type?.name)}
                </div>
                <div>
                  <span style={{ fontWeight: 900, color: COLORS.text }}>날짜</span>:{" "}
                  {dayjs(session.test_date).format("YYYY-MM-DD")}
                </div>
              </div>

              {/* 수업정보 */}
              <div style={pdfDivider}>
                <div style={pdfSectionTitle}>수업 정보</div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, color: COLORS.sub }}>
                  <div style={{ minWidth: 280 }}>
                    <div style={pdfSubTitle}>일대일</div>
                    <div>요일: {wLabel(session.oto_weekday)}</div>
                    <div>등원시간: {fmtTimeHM(session.oto_arrival_time)}</div>
                    <div>수업시간: {fmtTimeHM(session.oto_class_time)}</div>
                  </div>

                  <div style={{ minWidth: 280 }}>
                    <div style={pdfSubTitle}>독해</div>
                    <div>요일: {wLabel(session.reading_weekday)}</div>
                    <div>선생님: {safeText(session.reading_teacher_name)}</div>
                    <div>수업시간: {fmtTimeHM(session.reading_class_time)}</div>
                  </div>
                </div>
              </div>

              {/* 총점 */}
              <div style={pdfDivider}>
                <div style={{ fontWeight: 900, fontSize: 16.2 }}>
                  총점: {total.score} / {total.max}
                </div>
                <div style={{ color: COLORS.sub, fontSize: 12.4, marginTop: 2 }}>(아래 영역별 점수 합산)</div>
              </div>

              {/* 점수 + 그래프 */}
              <div style={pdfDivider}>
                <div style={pdfSectionTitle}>영역별 점수</div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 12.4, color: COLORS.sub, padding: "8px 6px" }}>
                        영역
                      </th>
                      <th style={{ textAlign: "left", fontSize: 12.4, color: COLORS.sub, padding: "8px 6px" }}>
                        점수
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {areas.map((a) => (
                      <tr key={a.id}>
                        <td style={{ padding: "8px 6px", borderTop: `1px solid ${COLORS.lineSoft}`, fontWeight: 900 }}>
                          {a.name}
                        </td>
                        <td style={{ padding: "8px 6px", borderTop: `1px solid ${COLORS.lineSoft}` }}>
                          {clampInt(scores[a.id]?.score ?? 0)} / {clampInt(scores[a.id]?.max ?? a.max_score)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ✅ 1페이지에 “딱” 들어가게: 그래프는 살짝만 조절 */}
                <div style={{ marginTop: 12 }}>
                  <RadarChart
                    areas={areas}
                    scoresMap={scores}
                    chartSize={390}
                    margin={104}
                    shiftX={0}
                    extraRight={230}
                    extraLeft={34}
                    noWrap={true}
                    labelFontSize={15}
                  />
                </div>
              </div>
            </div>

            <div style={{ height: 14 }} />

            {/* ===== 2페이지 ===== */}
            <div
              ref={page2Ref}
              style={{
                ...pdfCard,
                ...pdfBase,
                width: A4_PX_W,
                margin: "0 auto",
                padding: A4_PAD,
                overflow: "visible",
              }}
            >
              {/* 코멘트 */}
              <div style={pdfSectionTitle}>선택 코멘트</div>

              {areas.map((a) => {
                const list = selectedCommentsByArea[a.id] || [];
                if (!list.length) return null;
                return (
                  <div key={a.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 13.8 }}>{a.name}</div>
                    <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                      {list.map((t) => (
                        <li key={t.id} style={{ marginBottom: 6, lineHeight: 1.42, color: COLORS.text }}>
                          {t.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {!areas.some((a) => (selectedCommentsByArea[a.id] || []).length) && (
                <div style={{ color: COLORS.sub }}>선택된 코멘트가 없습니다.</div>
              )}

              {/* 교재 */}
              <div style={pdfDivider}>
                <div style={pdfSectionTitle}>첫 교재 안내</div>
                <div style={{ lineHeight: 1.5, color: COLORS.sub }}>
                  <div>
                    <span style={{ fontWeight: 900, color: COLORS.text }}>단어</span>: {safeText(session.first_book_vocab)}
                  </div>
                  <div>
                    <span style={{ fontWeight: 900, color: COLORS.text }}>문법/구문</span>: {safeText(session.first_book_grammar)}
                  </div>
                  <div>
                    <span style={{ fontWeight: 900, color: COLORS.text }}>독해</span>: {safeText(session.first_book_reading)}
                  </div>
                </div>
              </div>

              {/* 로고(2페이지 하단) */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${COLORS.lineSoft}` }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <img
                    src={LOGO_SRC}
                    alt="블라썸에듀"
                    crossOrigin="anonymous"
                    style={{ width: 84, height: 84, objectFit: "contain", opacity: 0.95 }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 12 }} />
      </div>

      {/* 하단 스티키 액션바 */}
      <div style={bottomBar}>
        <div
          style={{
            width: "min(980px, 100%)",
            margin: "0 auto",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button style={btn} onClick={() => navigate("/counseling")}>
            목록
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={btn} onClick={() => saveAll()} disabled={saving}>
              {saving ? "저장중…" : "저장"}
            </button>
            <button style={btn} onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? "처리중…" : "PDF 다운로드"}
            </button>
            <button style={btn} onClick={uploadPdfToStorage} disabled={pdfBusy}>
              {pdfBusy ? "처리중…" : "PDF 저장(서버)"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}