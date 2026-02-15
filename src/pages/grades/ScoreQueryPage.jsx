// src/pages/grades/ScoreQueryPage.jsx
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "../../utils/supabaseClient";

// ✅ 로고 파일을 여기에 넣고 경로만 맞추세요.
import blossomLogo from "../../assets/blossom-logo.png";

const COLORS = {
  text: "#1f2a44",
  sub: "#5d6b82",
  border: "#e3e8f3",
  soft: "#f7f9fc",
  blue: "#2f6fed",
  red: "#e04b4b",

  // PDF
  pdfTop: "#eef4ff",
  pdfTop2: "#f7f9fc",
  pdfLine: "rgba(31,42,68,0.12)",
  pdfLineSoft: "rgba(31,42,68,0.08)",
  chipBg: "rgba(47,111,237,0.10)",
  chipBd: "rgba(47,111,237,0.25)",
};

const YEARS = [2024, 2025, 2026, 2027, 2028];
const SCHOOL_GRADES_ALL = ["중1", "중2", "중3", "고1", "고2", "고3"];
const SCHOOL_GRADES_HIGH = ["고1", "고2", "고3"];
const SEMESTERS = ["1학기", "2학기"];
const EXAM_KINDS = ["중간", "기말"];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// =========================
// ✅ 절대평가 등급 (academy_mock)
// =========================
function scoreToAbsoluteGrade(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 90) return 1;
  if (n >= 80) return 2;
  if (n >= 70) return 3;
  if (n >= 60) return 4;
  if (n >= 50) return 5;
  if (n >= 40) return 6;
  if (n >= 30) return 7;
  if (n >= 20) return 8;
  return 9;
}
function gradeLabelFromScore(score) {
  const g = scoreToAbsoluteGrade(score);
  return g ? `${g}등급` : "-";
}

// =========================
// ✅ 유틸
// =========================
function fmtScore(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toFixed(2).replace(/\.00$/, ".0").replace(/(\.\d)0$/, "$1");
}
function fmtDelta(v) {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  if (n === 0) return "-";
  const abs = Math.abs(n);
  return `${n > 0 ? "+" : "-"}${abs.toFixed(2).replace(/\.00$/, "")}`;
}
function trendText(symbol, delta) {
  if (!symbol || symbol === "-") return "-";
  return `${symbol} ${fmtDelta(delta)}`;
}
function safeFileName(s) {
  return (s || "")
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
}

// title에서 "n회" 파싱
function parseRoundNo(title) {
  const t = (title || "").toString();
  let m = t.match(/(\d+)\s*회차/);
  if (m) return Number(m[1]);
  m = t.match(/(\d+)\s*회/);
  if (m) return Number(m[1]);
  m = t.match(/No\.?\s*(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

function calcMedian(nums) {
  const arr = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid - 1] + arr[mid]) / 2;
}

function calcStats(scores) {
  const nums = (scores || []).map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { count: 0, avg: null, min: null, max: null, median: null, sorted: [] };
  const sorted = nums.slice().sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count: nums.length,
    avg: sum / nums.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: calcMedian(sorted),
    sorted,
  };
}

// 상/중/하 (상위 33% / 중간 33% / 하위 33%)
function positionBand(score, sortedAsc) {
  const n = sortedAsc?.length || 0;
  const s = Number(score);
  if (!Number.isFinite(s) || n === 0) return { band: "-", percentile: null };

  // score 이하 개수로 퍼센타일(대충) 계산
  let le = 0;
  for (let i = 0; i < n; i++) if (sortedAsc[i] <= s) le++;
  const pct = le / n; // 0~1
  // pct가 클수록 상위 (점수 높음)
  if (pct >= 2 / 3) return { band: "상", percentile: pct };
  if (pct >= 1 / 3) return { band: "중", percentile: pct };
  return { band: "하", percentile: pct };
}

function buildComment({ band, deltaFromAvg }) {
  const d = Number(deltaFromAvg);
  const hasD = Number.isFinite(d);
  const dText = hasD ? `${Math.abs(d).toFixed(1)}점` : "-";
  const upDown = !hasD ? "" : d > 0 ? "높아요" : d < 0 ? "낮아요" : "같아요";

  if (band === "상") {
    return `이번 회차는 평균보다 ${dText} ${upDown}. 전반적으로 상위권(상) 성적입니다.`;
  }
  if (band === "중") {
    return `이번 회차는 평균과 비교했을 때 ${dText} 정도 차이가 있습니다. 중위권(중)에 해당합니다.`;
  }
  if (band === "하") {
    return `이번 회차는 평균보다 ${dText} ${upDown}. 하위권(하)으로 분류되며, 다음 회차에서 점수 상승을 목표로 해보면 좋아요.`;
  }
  return `이번 회차 결과 요약을 확인해주세요.`;
}

// 그래프 점이 너무 많으면 라벨/선이 지저분해져서 샘플링(최대 18개)
function samplePoints(points, max = 18) {
  if (!Array.isArray(points)) return [];
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    out.push(points[idx]);
  }
  return out;
}

export default function ScoreQueryPage() {
  const nav = useNavigate();

  const [type, setType] = useState("school_exam"); // school_exam | mock_exam | academy_mock
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  // 공통 필터
  const [studentName, setStudentName] = useState("");
  const [studentSchool, setStudentSchool] = useState("");
  const [studentGrade, setStudentGrade] = useState("");
  const [teacherName, setTeacherName] = useState("");

  // 내신 필터
  const [year, setYear] = useState(2026);
  const [schoolGrade, setSchoolGrade] = useState("중2");
  const [semester, setSemester] = useState("2학기");
  const [examKind, setExamKind] = useState("기말");

  // 모의고사 필터
  const [mockYear, setMockYear] = useState(2026);
  const [mockGrade, setMockGrade] = useState("고1");
  const [mockMonth, setMockMonth] = useState(6);

  // 기타(학원모의) 필터
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");

  const canExport = rows.length > 0;

  const headerTitle = useMemo(() => {
    if (type === "school_exam") return "유형별 성적데이터 조회 · 내신";
    if (type === "mock_exam") return "유형별 성적데이터 조회 · 모의고사";
    return "유형별 성적데이터 조회 · 기타 학원 모의고사";
  }, [type]);

  // =========================
  // ✅ PDF
  // =========================
  const [pdfLoadingId, setPdfLoadingId] = useState(null);
  const [pdfModel, setPdfModel] = useState(null);
  const pdfRef = useRef(null);

  async function search() {
    setLoading(true);
    try {
      let q = supabase.from("student_scores_enriched").select("*").eq("type", type);

      if (studentName.trim()) q = q.ilike("student_name", `%${studentName.trim()}%`);
      if (studentSchool.trim()) q = q.ilike("student_school", `%${studentSchool.trim()}%`);
      if (studentGrade) q = q.eq("student_grade", studentGrade);
      if (teacherName.trim()) q = q.eq("student_teacher_name", teacherName.trim());

      if (type === "school_exam") {
        q = q
          .eq("year", Number(year))
          .eq("school_grade", schoolGrade)
          .eq("semester", semester)
          .eq("exam_kind", examKind);
      } else if (type === "mock_exam") {
        q = q.eq("year", Number(mockYear)).eq("school_grade", mockGrade).eq("month", Number(mockMonth));
      } else {
        if (fromDate) q = q.gte("exam_date", fromDate);
        if (toDate) q = q.lte("exam_date", toDate);
        if (title.trim()) q = q.ilike("title", `%${title.trim()}%`);
      }

      q = q.order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;

      setRows(data || []);
    } catch (e) {
      console.error(e);
      alert("조회 실패");
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (!canExport) return;

    const mapped = rows.map((r) => {
      const academyGrade = type === "academy_mock" ? gradeLabelFromScore(r.score) : r.grade_label ?? "";

      const base = {
        학생이름: r.student_name ?? "",
        학교: r.student_school ?? "",
        학년: r.student_grade ?? "",
        담당선생님: r.student_teacher_name ?? "",
        점수: r.score ?? "",
        등급: academyGrade ?? "",
        "이전 대비 점수": trendText(r.score_trend_symbol, r.score_delta),
        "이전 대비 등급": trendText(r.grade_trend_symbol, r.grade_delta),
      };

      if (type === "school_exam") {
        return { ...base, 유형: "내신", 연도: r.year ?? "", 학년선택: r.school_grade ?? "", 학기: r.semester ?? "", 시험: r.exam_kind ?? "" };
      }
      if (type === "mock_exam") {
        return { ...base, 유형: "모의고사", 연도: r.year ?? "", 학년선택: r.school_grade ?? "", 월: r.month ?? "" };
      }
      return { ...base, 유형: "기타 학원 모의고사", 날짜: r.exam_date ?? "", 종류: r.title ?? "" };
    });

    const ws = XLSX.utils.json_to_sheet(mapped);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scores");
    XLSX.writeFile(wb, `성적데이터_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ✅ A4 한 장 고정: PDF 렌더 영역을 고정 높이로 만들고 넘치는건 숨김
  // 860px 너비 기준 A4 비율로 대략 1216px 정도(실사용에서 가장 안정적인 값)
  const PDF_W = 860;
  const PDF_H = 1216; // 1장 고정 높이

  async function buildAndExportAcademyMockPdf(row) {
    if (!row) return;
    if (!row.student_id) {
      alert("student_scores_enriched 뷰에 student_id가 포함되어 있는지 확인해주세요.");
      return;
    }
    if (!row.exam_date || !row.title) {
      alert("academy_mock PDF는 exam_date와 title이 필요해요.");
      return;
    }

    setPdfLoadingId(row.id);
    try {
      // 1) 해당 회차 전체 응시자 (같은 exam_date + title)
      const { data: examAll, error: examErr } = await supabase
        .from("student_scores_enriched")
        .select("id, student_id, score, exam_date, title")
        .eq("type", "academy_mock")
        .eq("exam_date", row.exam_date)
        .eq("title", row.title);

      if (examErr) throw examErr;

      const stats = calcStats((examAll || []).map((x) => x.score));
      const myScore = Number(row.score);
      const deltaFromAvg = Number.isFinite(myScore) && Number.isFinite(stats.avg) ? myScore - stats.avg : null;

      const pos = positionBand(myScore, stats.sorted);
      const comment = buildComment({ band: pos.band, deltaFromAvg });

      // 2) 해당 학생 academy_mock 히스토리(회차 순)
      const { data: hist, error: histErr } = await supabase
        .from("student_scores_enriched")
        .select("id, exam_date, title, score, created_at")
        .eq("type", "academy_mock")
        .eq("student_id", row.student_id);

      if (histErr) throw histErr;

      const historyRaw = (hist || []).map((h) => ({
        ...h,
        roundNo: parseRoundNo(h.title),
        scoreNum: Number(h.score),
        gradeAbs: scoreToAbsoluteGrade(h.score),
        gradeLabel: gradeLabelFromScore(h.score),
      }));

      historyRaw.sort((a, b) => {
        const ar = a.roundNo;
        const br = b.roundNo;
        if (Number.isFinite(ar) && Number.isFinite(br) && ar !== br) return ar - br;
        const ad = (a.exam_date || "") > "" ? a.exam_date : "9999-12-31";
        const bd = (b.exam_date || "") > "" ? b.exam_date : "9999-12-31";
        if (ad !== bd) return ad.localeCompare(bd);
        return (a.created_at || "").localeCompare(b.created_at || "");
      });

      // ✅ 1장에 맞추기 위해 표는 최근 8개만(그래프는 샘플링해서 깔끔하게)
      const history = historyRaw;
      const historyRecent = history.slice(Math.max(0, history.length - 8));

      const deltasRecent = historyRecent.map((h, idx) => {
        const globalIdx = history.indexOf(h);
        if (globalIdx <= 0) return { scoreDelta: null, gradeDelta: null };
        const prev = history[globalIdx - 1];
        const sd = Number.isFinite(h.scoreNum) && Number.isFinite(prev.scoreNum) ? h.scoreNum - prev.scoreNum : null;
        const gd = Number.isFinite(h.gradeAbs) && Number.isFinite(prev.gradeAbs) ? h.gradeAbs - prev.gradeAbs : null;
        return { scoreDelta: sd, gradeDelta: gd };
      });

      const student = {
        name: row.student_name,
        school: row.student_school,
        grade: row.student_grade,
        teacher: row.student_teacher_name,
      };

      const exam = {
        exam_date: row.exam_date,
        title: row.title,
        roundNo: parseRoundNo(row.title),
        score: row.score,
        gradeLabel: gradeLabelFromScore(row.score),
      };

      // 그래프 포인트(회차 라벨)
      const pointsAll = history.map((h) => {
        const rno = parseRoundNo(h.title);
        return {
          xLabel: Number.isFinite(rno) ? `${rno}회` : (h.title || "").slice(0, 5),
          y: Number(h.score),
        };
      });
      const points = samplePoints(pointsAll, 18);

      setPdfModel({
        academyName: "산본 블라썸에듀",
        student,
        exam,
        stats,
        my: {
          score: myScore,
          gradeLabel: gradeLabelFromScore(myScore),
          deltaFromAvg,
          band: pos.band,
          comment,
        },
        chartPoints: points,
        table: {
          historyRecent,
          deltasRecent,
        },
      });

      await new Promise((r) => setTimeout(r, 80));

      const el = pdfRef.current;
      if (!el) throw new Error("PDF 영역 없음");

      // ✅ 1장 고정 캡처: 높이 제한 영역만 렌더된 상태라 캔버스도 1장 크기로 나옴
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      // A4에 꽉 맞게 (이미 1장 레이아웃이라 대부분 1장으로 딱 맞음)
      const y = (pageH - imgH) / 2; // 남는 공간 중앙정렬(거의 0에 가까움)
      pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);

      const roundText = exam.roundNo ? `${exam.roundNo}회` : safeFileName(exam.title);
      pdf.save(`학원모의_${safeFileName(student.name)}_${roundText}_${exam.exam_date}.pdf`);
    } catch (e) {
      console.error(e);
      alert("PDF 생성 실패");
    } finally {
      setPdfLoadingId(null);
    }
  }

  // =========================
  // ✅ PDF 내부 그래프 (SVG)
  // =========================
  function LineChart({ points, width = 800, height = 220, padding = 26 }) {
    const ys = points.map((p) => p.y).filter((v) => Number.isFinite(v));
    const minY = ys.length ? Math.min(...ys, 0) : 0;
    const maxY = ys.length ? Math.max(...ys, 100) : 100;

    const w = width;
    const h = height;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;

    const xStep = points.length <= 1 ? innerW : innerW / (points.length - 1);
    const yScale = (v) => {
      const t = (v - minY) / (maxY - minY || 1);
      return padding + innerH - t * innerH;
    };
    const xScale = (idx) => padding + idx * xStep;

    const d = points
      .map((p, i) => {
        const x = xScale(i);
        const y = yScale(p.y);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <svg width={w} height={h} style={{ display: "block", border: `1px solid ${COLORS.pdfLineSoft}`, borderRadius: 14, background: "#fff" }}>
        {[0, 25, 50, 75, 100].map((v) => {
          const y = yScale(v);
          return (
            <g key={v}>
              <line x1={padding} y1={y} x2={w - padding} y2={y} stroke="rgba(31,42,68,0.07)" />
              <text x={6} y={y + 4} fontSize="10" fill={COLORS.sub}>
                {v}
              </text>
            </g>
          );
        })}
        {points.length >= 2 ? <path d={d} fill="none" stroke={COLORS.blue} strokeWidth="2.8" /> : null}
        {points.map((p, i) => {
          const x = xScale(i);
          const y = yScale(p.y);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4.2" fill={COLORS.blue} />
              <text x={x} y={h - 10} fontSize="10" textAnchor="middle" fill={COLORS.sub}>
                {p.xLabel}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // =========================
  // UI
  // =========================
  return (
    <div style={{ maxWidth: 1500, margin: "26px auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>{headerTitle}</div>
          <div style={{ marginTop: 6, color: COLORS.sub }}>
            조건을 걸어 성적 데이터를 모아서 보고, 엑셀로 내보낼 수 있어요.
            {type === "academy_mock" ? (
              <div style={{ marginTop: 6, color: COLORS.sub }}>
                · <b>PDF</b>를 누르면 <b>1장 리포트</b>(요약+그래프+최근기록+로고)가 생성돼요.
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => nav(-1)} style={btnGhost}>
            뒤로
          </button>
          <button type="button" onClick={exportExcel} style={{ ...btnPrimary, opacity: canExport ? 1 : 0.45 }} disabled={!canExport}>
            엑셀 내보내기
          </button>
        </div>
      </div>

      {/* 타입 선택 */}
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <TypeChip active={type === "school_exam"} onClick={() => setType("school_exam")}>
          내신
        </TypeChip>
        <TypeChip active={type === "mock_exam"} onClick={() => setType("mock_exam")}>
          모의고사
        </TypeChip>
        <TypeChip active={type === "academy_mock"} onClick={() => setType("academy_mock")}>
          기타 학원 모의고사
        </TypeChip>
      </div>

      {/* 필터 */}
      <div style={{ marginTop: 16, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 14, background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
          <Field label="학생이름(부분검색)">
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} style={input} placeholder="예: 김민준" />
          </Field>

          <Field label="학교(부분검색)">
            <input value={studentSchool} onChange={(e) => setStudentSchool(e.target.value)} style={input} placeholder="예: 산본중" />
          </Field>

          <Field label="학년">
            <select value={studentGrade} onChange={(e) => setStudentGrade(e.target.value)} style={input}>
              <option value="">(전체)</option>
              {SCHOOL_GRADES_ALL.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          <Field label="담당선생님(정확히)">
            <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} style={input} placeholder="예: 조여정T" />
          </Field>

          {type === "school_exam" ? (
            <>
              <Field label="연도">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={input}>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="선택 학년(내신 입력 기준)">
                <select value={schoolGrade} onChange={(e) => setSchoolGrade(e.target.value)} style={input}>
                  {SCHOOL_GRADES_ALL.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="학기">
                <select value={semester} onChange={(e) => setSemester(e.target.value)} style={input}>
                  {SEMESTERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="시험">
                <select value={examKind} onChange={(e) => setExamKind(e.target.value)} style={input}>
                  {EXAM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          {type === "mock_exam" ? (
            <>
              <Field label="연도">
                <select value={mockYear} onChange={(e) => setMockYear(Number(e.target.value))} style={input}>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="학년(고1~고3)">
                <select value={mockGrade} onChange={(e) => setMockGrade(e.target.value)} style={input}>
                  {SCHOOL_GRADES_HIGH.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="월">
                <select value={mockMonth} onChange={(e) => setMockMonth(Number(e.target.value))} style={input}>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}

          {type === "academy_mock" ? (
            <>
              <Field label="날짜 from">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={input} />
              </Field>
              <Field label="날짜 to">
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={input} />
              </Field>
              <Field label="회차/종류(title, 부분검색)">
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="예: 모의고사 3회" />
              </Field>
              <div />
              <div />
              <div />
            </>
          ) : null}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={search} style={btnPrimary} disabled={loading}>
            {loading ? "조회 중…" : "조회"}
          </button>
        </div>
      </div>

      {/* 결과 */}
      <div style={{ marginTop: 16, border: `1px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "10px 12px", background: COLORS.soft, borderBottom: `1px solid ${COLORS.border}`, color: COLORS.sub, fontWeight: 800 }}>
          결과 {rows.length}건
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#fff" }}>
            <tr>
              <Th>학생</Th>
              <Th>학교</Th>
              <Th>학년</Th>
              <Th>담당</Th>
              <Th>점수</Th>
              <Th>등급</Th>
              <Th>이전 대비 점수</Th>
              <Th>이전 대비 등급</Th>
              <Th>기준</Th>
              {type === "academy_mock" ? <Th>PDF</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={type === "academy_mock" ? 10 : 9} style={{ padding: 14, color: COLORS.sub }}>
                  조회 결과가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const showGrade = type === "academy_mock" ? gradeLabelFromScore(r.score) : (r.grade_label || "-");
                return (
                  <tr key={r.id}>
                    <Td>{r.student_name}</Td>
                    <Td>{r.student_school}</Td>
                    <Td>{r.student_grade}</Td>
                    <Td>{r.student_teacher_name}</Td>
                    <Td>{fmtScore(r.score)}</Td>
                    <Td>{showGrade}</Td>
                    <Td>
                      {r.score_trend_symbol === "-" ? (
                        <span style={{ color: COLORS.sub }}>-</span>
                      ) : (
                        <span style={{ color: r.score_trend_symbol === "▲" ? COLORS.blue : COLORS.red, fontWeight: 900 }}>
                          {r.score_trend_symbol} {fmtDelta(r.score_delta)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {r.grade_trend_symbol === "-" ? (
                        <span style={{ color: COLORS.sub }}>-</span>
                      ) : (
                        <span style={{ color: r.grade_trend_symbol === "▲" ? COLORS.blue : COLORS.red, fontWeight: 900 }}>
                          {r.grade_trend_symbol} {fmtDelta(r.grade_delta)}
                        </span>
                      )}
                    </Td>
                    <Td style={{ color: COLORS.sub }}>
                      {type === "school_exam"
                        ? `${r.year} ${r.semester} ${r.exam_kind}`
                        : type === "mock_exam"
                        ? `${r.year}-${String(r.month).padStart(2, "0")}`
                        : `${r.exam_date} · ${r.title}`}
                    </Td>

                    {type === "academy_mock" ? (
                      <Td>
                        <button
                          type="button"
                          onClick={() => buildAndExportAcademyMockPdf(r)}
                          style={{
                            height: 32,
                            padding: "0 10px",
                            borderRadius: 10,
                            border: `1px solid ${COLORS.border}`,
                            background: "#fff",
                            color: COLORS.text,
                            fontWeight: 900,
                            cursor: "pointer",
                            opacity: pdfLoadingId === r.id ? 0.6 : 1,
                          }}
                          disabled={pdfLoadingId === r.id}
                        >
                          {pdfLoadingId === r.id ? "생성중…" : "PDF"}
                        </button>
                      </Td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ PDF 렌더 영역(화면 밖) */}
      <div style={{ position: "absolute", left: -99999, top: -99999, width: PDF_W }}>
        {pdfModel ? (
          <div
            ref={pdfRef}
            style={{
              width: PDF_W,
              height: PDF_H, // ✅ 1장 고정
              overflow: "hidden",
              background: "#fff",
              color: COLORS.text,
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
              border: "0",
            }}
          >
            {/* 헤더 */}
            <div
              style={{
                padding: "22px 26px 16px",
                background: `linear-gradient(180deg, ${COLORS.pdfTop} 0%, ${COLORS.pdfTop2} 100%)`,
                borderBottom: `1px solid ${COLORS.pdfLineSoft}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.2px" }}>
                    {pdfModel.academyName}
                  </div>
                  <div style={{ marginTop: 6, color: COLORS.sub, fontSize: 12 }}>
                    학원 모의고사 성적 리포트
                    <span
                      style={{
                        marginLeft: 10,
                        display: "inline-block",
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: COLORS.chipBg,
                        border: `1px solid ${COLORS.chipBd}`,
                        color: COLORS.blue,
                        fontWeight: 900,
                      }}
                    >
                      {pdfModel.exam.roundNo ? `모의고사 ${pdfModel.exam.roundNo}회` : pdfModel.exam.title}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", color: COLORS.sub, fontSize: 12, lineHeight: 1.5 }}>
                  <div><b>응시일</b> {pdfModel.exam.exam_date}</div>
                  <div>{new Date().toISOString().slice(0, 10)} 생성</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InfoRow label="학생이름" value={pdfModel.student.name} />
                <InfoRow label="담당선생님" value={pdfModel.student.teacher} />
                <InfoRow label="학교" value={pdfModel.student.school} />
                <InfoRow label="학년" value={pdfModel.student.grade} />
              </div>
            </div>

            {/* 본문 */}
            <div style={{ padding: "16px 26px 0" }}>
              {/* 요약 + 통계 */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
                <div style={pdfCard}>
                  <div style={pdfLabel}>이번 회차 요약</div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 12 }}>
                    <div style={{ fontSize: 42, fontWeight: 1100, letterSpacing: "-0.6px" }}>
                      {fmtScore(pdfModel.my.score)}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 1000, color: COLORS.blue }}>
                      {pdfModel.my.gradeLabel}
                    </div>
                    <span
                      style={{
                        marginLeft: 6,
                        display: "inline-block",
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "rgba(31,42,68,0.06)",
                        color: COLORS.text,
                        fontWeight: 1000,
                        fontSize: 12,
                      }}
                    >
                      내 위치: {pdfModel.my.band}
                    </span>
                  </div>

                  <div style={{ marginTop: 10, color: COLORS.sub, fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      <b>평균 대비</b> :{" "}
                      <span style={{ fontWeight: 1000, color: (pdfModel.my.deltaFromAvg || 0) >= 0 ? COLORS.blue : COLORS.red }}>
                        {pdfModel.my.deltaFromAvg === null ? "-" : fmtDelta(pdfModel.my.deltaFromAvg)}점
                      </span>
                    </div>
                    <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 14, background: COLORS.soft, border: `1px solid ${COLORS.pdfLineSoft}` }}>
                      <div style={{ fontSize: 11, color: COLORS.sub, fontWeight: 900, marginBottom: 6 }}>코멘트</div>
                      <div style={{ fontSize: 12.5, color: COLORS.text, fontWeight: 900, lineHeight: 1.5 }}>
                        {pdfModel.my.comment}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={pdfCard}>
                  <div style={pdfLabel}>이번 회차 전체 통계</div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <StatBox label="응시자" value={`${pdfModel.stats.count}명`} />
                    <StatBox label="평균" value={pdfModel.stats.avg === null ? "-" : `${fmtScore(pdfModel.stats.avg)}점`} />
                    <StatBox label="최고" value={pdfModel.stats.max === null ? "-" : `${fmtScore(pdfModel.stats.max)}점`} />
                    <StatBox label="최저" value={pdfModel.stats.min === null ? "-" : `${fmtScore(pdfModel.stats.min)}점`} />
                    <StatBox label="중앙값" value={pdfModel.stats.median === null ? "-" : `${fmtScore(pdfModel.stats.median)}점`} />
                    <div />
                  </div>

                  <div style={{ marginTop: 10, color: COLORS.sub, fontSize: 10.5, lineHeight: 1.5 }}>
                    · 내 위치(상/중/하)는 이번 회차 점수를 기준으로 상위 33% / 중간 33% / 하위 33%로 구분했어요.
                  </div>
                </div>
              </div>

              {/* 추이 그래프 + 최근 기록(간단) */}
              <div style={{ marginTop: 12, ...pdfCard }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                  <div>
                    <div style={pdfLabel}>점수 추이</div>
                    <div style={{ marginTop: 4, color: COLORS.sub, fontSize: 10.5 }}>
                      · 회차 순서로 정렬 · 점이 많으면 보기 좋게 일부만 표시
                    </div>
                  </div>
                  <div style={{ color: COLORS.sub, fontSize: 10.5 }}>
                    등급 기준: 90~100(1) … 0~19(9)
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <LineChart points={pdfModel.chartPoints || []} />
                </div>

                {/* 최근 기록(간단 표) */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: COLORS.sub, fontSize: 10.5, fontWeight: 900, marginBottom: 6 }}>
                    최근 기록(최근 8회)
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={pdfTh}>회차</th>
                        <th style={pdfTh}>점수</th>
                        <th style={pdfTh}>등급</th>
                        <th style={pdfTh}>등락</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pdfModel.table?.historyRecent || []).map((h, idx) => {
                        const d = (pdfModel.table?.deltasRecent || [])[idx] || {};
                        const sd = d.scoreDelta;

                        const rno = parseRoundNo(h.title);
                        const roundText = Number.isFinite(rno) ? `${rno}회` : (h.title || "-");

                        const sdSymbol = sd === null || sd === undefined ? "-" : sd > 0 ? "▲" : sd < 0 ? "▼" : "-";
                        const sdText = sdSymbol === "-" ? "-" : `${sdSymbol} ${fmtDelta(sd)}`;

                        return (
                          <tr key={h.id}>
                            <td style={pdfTd}>{roundText}</td>
                            <td style={pdfTd}>{fmtScore(h.score)}</td>
                            <td style={pdfTd}>{h.gradeLabel}</td>
                            <td style={pdfTd}>
                              <span style={{ fontWeight: 1000, color: sd > 0 ? COLORS.blue : sd < 0 ? COLORS.red : COLORS.sub }}>
                                {sdText}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 푸터(로고) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "12px 26px 16px",
                borderTop: `1px solid ${COLORS.pdfLineSoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: "#fff",
              }}
            >
              <div style={{ color: COLORS.sub, fontSize: 10 }}>
                © {new Date().getFullYear()} {pdfModel.academyName} · 내부용 리포트
              </div>
              <img src={blossomLogo} alt="logo" style={{ width: 52, height: 52, objectFit: "contain", opacity: 0.95 }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// =========================
// UI 컴포넌트
// =========================
function TypeChip({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(47,111,237,0.35)" : COLORS.border}`,
        background: active ? "#eef3ff" : "#fff",
        color: active ? COLORS.blue : COLORS.text,
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function Th({ children }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.sub, fontSize: 13 }}>
      {children}
    </th>
  );
}
function Td({ children }) {
  return <td style={{ padding: "10px 12px", borderBottom: `1px solid ${COLORS.border}`, color: COLORS.text }}>{children}</td>;
}
function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${COLORS.pdfLineSoft}`,
        background: "#fff",
      }}
    >
      <div style={{ minWidth: 86, color: COLORS.sub, fontSize: 11, fontWeight: 900 }}>{label}</div>
      <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 900 }}>{value || "-"}</div>
    </div>
  );
}
function StatBox({ label, value }) {
  return (
    <div style={{ padding: 10, borderRadius: 14, border: `1px solid ${COLORS.pdfLineSoft}`, background: COLORS.soft }}>
      <div style={{ color: COLORS.sub, fontSize: 10.5, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, color: COLORS.text, fontSize: 14, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const input = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  outline: "none",
  background: "#fff",
  color: COLORS.text,
};

const btnPrimary = {
  height: 36,
  padding: "0 14px",
  borderRadius: 12,
  border: "none",
  background: COLORS.blue,
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnGhost = {
  height: 36,
  padding: "0 14px",
  borderRadius: 12,
  border: `1px solid ${COLORS.border}`,
  background: "#fff",
  color: COLORS.text,
  fontWeight: 900,
  cursor: "pointer",
};

const pdfCard = {
  padding: 14,
  borderRadius: 16,
  border: `1px solid ${COLORS.pdfLineSoft}`,
  background: "#fff",
};

const pdfLabel = {
  fontSize: 12,
  color: COLORS.sub,
  fontWeight: 900,
};

const pdfTh = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: `1px solid ${COLORS.pdfLineSoft}`,
  color: COLORS.sub,
  fontSize: 10.8,
  background: COLORS.soft,
};

const pdfTd = {
  padding: "8px 10px",
  borderBottom: `1px solid ${COLORS.pdfLineSoft}`,
  color: COLORS.text,
  fontSize: 11,
};