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

/**
 * ✅ 레이더 차트(SVG)
 * - chartSize: 그래프 크기
 * - margin: 라벨 여백(캔버스)
 * - shiftX: 그래프 중심을 오른쪽으로 이동(긴 라벨 잘림 방지)
 */
function RadarChart({
  areas,
  scoresMap,
  chartSize = 320,
  margin = 80,
  shiftX = 0,
  showSummary = true,
}) {
  const items = (areas || []).map((a) => {
    const row = scoresMap?.[a.id] || {};
    const sc = clampInt(row.score ?? 0);
    const mx = clampInt(row.max ?? a.max_score ?? 0);
    return { id: a.id, name: a.name || "", score: sc, max: mx, p: pct(sc, mx) };
  });

  const n = items.length;
  if (!n) return null;

  const svgSize = chartSize + margin * 2;
  const cx = margin + chartSize / 2 + shiftX;
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
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{
          background: "#ffffff",
          border: `1px solid ${COLORS.lineSoft}`,
          borderRadius: 14,
          overflow: "visible",
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
        {items.map((it, i) => {
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
              fontSize="14"
              fill={COLORS.sub}
              textAnchor={anchor}
            >
              {it.name}
            </text>
          );
        })}
      </svg>

      {showSummary && (
        <div style={{ minWidth: 280 }}>
          <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 15 }}>영역별 달성률</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
              <div
                key={`row-${it.id}`}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}
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

  const reportRef = useRef(null);

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
    // session
    const { data: s, error: e1 } = await supabase
      .from("counsel_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (e1) return alert("상담 로드 실패: " + e1.message);
    setSession(s);

    // type
    const { data: t, error: e2 } = await supabase
      .from("counsel_test_types")
      .select("*")
      .eq("id", s.test_type_id)
      .single();
    if (e2) return alert("종류 로드 실패: " + e2.message);
    setType(t);

    // areas
    const { data: a, error: e3 } = await supabase
      .from("counsel_areas")
      .select("*")
      .eq("test_type_id", s.test_type_id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });
    if (e3) return alert("영역 로드 실패: " + e3.message);
    setAreas(a || []);

    // scores
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

    // templates
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

    // checked
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

      // scores upsert
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

      // comments sync
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

  // ✅ 캡처 전 이미지 로딩을 확실히 기다림 (public 로고 포함)
  async function waitForImages(rootEl) {
    const imgs = Array.from(rootEl.querySelectorAll("img"));
    if (!imgs.length) return;

    await Promise.all(
      imgs.map((img) => {
        try {
          // 이미 로드됨
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        } catch {
          return Promise.resolve();
        }
      })
    );
  }

  // ===== PDF 생성 =====
  async function buildPdfBlob() {
    if (!reportRef.current) throw new Error("PDF 영역이 없습니다.");

    // ✅ 이미지(로고) 로드 대기
    await waitForImages(reportRef.current);
    // ✅ 폰트/레이아웃 안정화 약간
    await new Promise((r) => setTimeout(r, 200));

    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollY: -window.scrollY,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = 210;
    const pageHeight = 297;

    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pageWidth;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    } else {
      let remaining = imgHeight;
      let position = 0;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        remaining -= pageHeight;
        if (remaining > 0) {
          pdf.addPage();
          position -= pageHeight;
        }
      }
    }

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

  // ===== 스타일 =====
  const wrap = {
    minHeight: "100vh",
    padding:
      "calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 96px)",
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

  if (!session) return <div style={wrap}><div style={{ color: COLORS.sub }}>로딩중…</div></div>;

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
            <input style={input} value={session.student_name || ""} onChange={(e) => setSession((p) => ({ ...p, student_name: e.target.value }))} placeholder="이름" />
            <input style={input} value={session.student_school || ""} onChange={(e) => setSession((p) => ({ ...p, student_school: e.target.value }))} placeholder="학교" />
            <input style={{ ...input, minWidth: 120 }} value={session.student_grade || ""} onChange={(e) => setSession((p) => ({ ...p, student_grade: e.target.value }))} placeholder="학년" />
            <input style={input} value={session.teacher_name || ""} onChange={(e) => setSession((p) => ({ ...p, teacher_name: e.target.value }))} placeholder="담당 선생님" />
            <input style={{ ...input, minWidth: 170 }} type="date" value={session.test_date || dayjs().format("YYYY-MM-DD")} onChange={(e) => setSession((p) => ({ ...p, test_date: e.target.value }))} />
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
                <option key={w.v} value={w.v}>{w.label}</option>
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
                <option key={w.v} value={w.v}>{w.label}</option>
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
            영역별 점수 <span style={{ color: COLORS.sub, fontSize: 12 }}>(총 {total.score}/{total.max})</span>
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
            <input style={{ ...input, minWidth: 260 }} value={session.first_book_vocab || ""} onChange={(e) => setSession((p) => ({ ...p, first_book_vocab: e.target.value }))} placeholder="단어책" />
            <input style={{ ...input, minWidth: 260 }} value={session.first_book_grammar || ""} onChange={(e) => setSession((p) => ({ ...p, first_book_grammar: e.target.value }))} placeholder="문법/구문책" />
            <input style={{ ...input, minWidth: 260 }} value={session.first_book_reading || ""} onChange={(e) => setSession((p) => ({ ...p, first_book_reading: e.target.value }))} placeholder="독해책" />
          </div>
        </div>

        {/* ===== PDF 미리보기 ===== */}
        <div style={{ marginTop: 18, borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 10 }}>PDF 미리보기</div>

          <div
            ref={reportRef}
            style={{
              background: "#ffffff",
              borderRadius: 14,
              padding: 18,
              border: `1px solid ${COLORS.lineSoft}`,
            }}
          >
            {/* 상단 헤더 */}
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
              산본 블라썸에듀 · 레벨테스트 상담결과
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 10, color: COLORS.sub }}>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>학생</span>: {safeText(session.student_name)}</div>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>학교</span>: {safeText(session.student_school)}</div>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>학년</span>: {safeText(session.student_grade)}</div>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>담당</span>: {safeText(session.teacher_name)}</div>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>테스트</span>: {safeText(type?.name)}</div>
              <div><span style={{ fontWeight: 900, color: COLORS.text }}>날짜</span>: {dayjs(session.test_date).format("YYYY-MM-DD")}</div>
            </div>

            {/* 수업정보 */}
            <div style={{ borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>수업 정보</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: COLORS.sub, lineHeight: 1.45 }}>
                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 900, color: COLORS.text, marginBottom: 2 }}>일대일</div>
                  <div>요일: {wLabel(session.oto_weekday)}</div>
                  <div>등원시간: {fmtTimeHM(session.oto_arrival_time)}</div>
                  <div>수업시간: {fmtTimeHM(session.oto_class_time)}</div>
                </div>

                <div style={{ minWidth: 260 }}>
                  <div style={{ fontWeight: 900, color: COLORS.text, marginBottom: 2 }}>독해</div>
                  <div>요일: {wLabel(session.reading_weekday)}</div>
                  <div>선생님: {safeText(session.reading_teacher_name)}</div>
                  <div>수업시간: {fmtTimeHM(session.reading_class_time)}</div>
                </div>
              </div>
            </div>

            {/* 총점 */}
            <div style={{ borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 15 }}>
                총점: {total.score} / {total.max}
              </div>
              <div style={{ color: COLORS.sub, fontSize: 12 }}>(아래 영역별 점수 합산)</div>
            </div>

            {/* 점수 + 그래프 */}
            <div style={{ borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>영역별 점수</div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 12, color: COLORS.sub, padding: "8px 6px" }}>영역</th>
                    <th style={{ textAlign: "left", fontSize: 12, color: COLORS.sub, padding: "8px 6px" }}>점수</th>
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

              <div style={{ marginTop: 14 }}>
                <RadarChart
                  areas={areas}
                  scoresMap={scores}
                  chartSize={380}
                  margin={96}
                  shiftX={34}
                />
              </div>
            </div>

            {/* 코멘트 */}
            <div style={{ borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>선택 코멘트</div>

              {areas.map((a) => {
                const list = selectedCommentsByArea[a.id] || [];
                if (!list.length) return null;
                return (
                  <div key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 900 }}>{a.name}</div>
                    <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                      {list.map((t) => (
                        <li key={t.id} style={{ marginBottom: 4, lineHeight: 1.35 }}>
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
            </div>

            {/* 교재 */}
            <div style={{ borderTop: `1px solid ${COLORS.lineSoft}`, paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>첫 교재 안내</div>
              <div style={{ lineHeight: 1.45, color: COLORS.sub }}>
                <div><span style={{ fontWeight: 900, color: COLORS.text }}>단어</span>: {safeText(session.first_book_vocab)}</div>
                <div><span style={{ fontWeight: 900, color: COLORS.text }}>문법/구문</span>: {safeText(session.first_book_grammar)}</div>
                <div><span style={{ fontWeight: 900, color: COLORS.text }}>독해</span>: {safeText(session.first_book_reading)}</div>
              </div>
            </div>

            {/* ✅ 하단 중앙 로고 (public/blossom-logo.png) */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.lineSoft}` }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <img
                  src="/blossom-logo.png"
                  alt="블라썸에듀"
                  crossOrigin="anonymous"
                  style={{ width: 72, height: 72, objectFit: "contain", opacity: 0.95 }}
                />
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
          <button style={btn} onClick={() => navigate("/counseling")}>목록</button>

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