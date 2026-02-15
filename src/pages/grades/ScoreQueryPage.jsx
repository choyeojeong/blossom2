// src/pages/grades/ScoreQueryPage.jsx
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "../../utils/supabaseClient";

import blossomLogo from "../../assets/blossom-logo.png";

const COLORS = {
  text: "#1f2a44",
  sub: "#5d6b82",
  border: "#e3e8f3",
  soft: "#f7f9fc",
  blue: "#2f6fed",
  red: "#e04b4b",

  pdfTop: "#eef4ff",
  pdfTop2: "#f7f9fc",
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

// ✅ 절대평가 등급 (academy_mock)
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

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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

  // ✅ 리포트 렌더
  const [exportLoadingId, setExportLoadingId] = useState(null);
  const [exportMode, setExportMode] = useState(null); // "pdf" | "png"
  const [reportModel, setReportModel] = useState(null);
  const reportRef = useRef(null);

  async function search() {
    setLoading(true);
    try {
      let q = supabase.from("student_scores_enriched").select("*").eq("type", type);

      if (studentName.trim()) q = q.ilike("student_name", `%${studentName.trim()}%`);
      if (studentSchool.trim()) q = q.ilike("student_school", `%${studentSchool.trim()}%`);
      if (studentGrade) q = q.eq("student_grade", studentGrade);
      if (teacherName.trim()) q = q.eq("student_teacher_name", teacherName.trim());

      if (type === "school_exam") {
        q = q.eq("year", Number(year)).eq("school_grade", schoolGrade).eq("semester", semester).eq("exam_kind", examKind);
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

      if (type === "school_exam") return { ...base, 유형: "내신", 연도: r.year ?? "", 학년선택: r.school_grade ?? "", 학기: r.semester ?? "", 시험: r.exam_kind ?? "" };
      if (type === "mock_exam") return { ...base, 유형: "모의고사", 연도: r.year ?? "", 학년선택: r.school_grade ?? "", 월: r.month ?? "" };
      return { ...base, 유형: "기타 학원 모의고사", 날짜: r.exam_date ?? "", 종류: r.title ?? "" };
    });

    const ws = XLSX.utils.json_to_sheet(mapped);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scores");
    XLSX.writeFile(wb, `성적데이터_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const REPORT_W = 860;
  const REPORT_H = 1216;

  async function exportAcademyMockReport(row, mode /* "pdf" | "png" */) {
    if (!row) return;
    if (!row.student_id) {
      alert("student_scores_enriched 뷰에 student_id가 포함되어 있는지 확인해주세요.");
      return;
    }
    if (!row.title) {
      alert("academy_mock 리포트는 title(회차)이 필요해요.");
      return;
    }

    setExportLoadingId(row.id);
    setExportMode(mode);
    try {
      // ✅ 통계: 회차(title) 기준 + (가능하면 연도 제한)
      let qExam = supabase
        .from("student_scores_enriched")
        .select("id, student_id, score, exam_date, title")
        .eq("type", "academy_mock")
        .eq("title", row.title);

      const y = String(row.exam_date || "").slice(0, 4);
      if (y) qExam = qExam.gte("exam_date", `${y}-01-01`).lte("exam_date", `${y}-12-31`);

      const { data: examAll, error: examErr } = await qExam;
      if (examErr) throw examErr;

      const stats = calcStats((examAll || []).map((x) => x.score));
      const myScore = Number(row.score);
      const deltaFromAvg = Number.isFinite(myScore) && Number.isFinite(stats.avg) ? myScore - stats.avg : null;

      // 학생 히스토리(회차 순)
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

      const history = historyRaw;
      const historyRecent = history.slice(Math.max(0, history.length - 8));

      const deltasRecent = historyRecent.map((h) => {
        const globalIdx = history.indexOf(h);
        if (globalIdx <= 0) return { scoreDelta: null };
        const prev = history[globalIdx - 1];
        const sd = Number.isFinite(h.scoreNum) && Number.isFinite(prev.scoreNum) ? h.scoreNum - prev.scoreNum : null;
        return { scoreDelta: sd };
      });

      const student = {
        name: row.student_name,
        school: row.student_school,
        grade: row.student_grade,
        teacher: row.student_teacher_name,
      };

      const exam = {
        exam_date: row.exam_date || (examAll?.map((x) => x.exam_date).sort().slice(-1)[0] || ""),
        title: row.title,
        roundNo: parseRoundNo(row.title),
        score: row.score,
        gradeLabel: gradeLabelFromScore(row.score),
      };

      // ✅ 그래프: 50회차 이상 대비
      // - 선(path)은 전체 데이터를 사용
      // - 점(dot)은 너무 많으면 간격으로만 찍기
      // - x라벨도 간격으로만 표시
      const pointsAll = history.map((h, idx) => {
        const rno = parseRoundNo(h.title);
        return {
          idx,
          xLabel: Number.isFinite(rno) ? `${rno}회` : (h.title || "").slice(0, 6),
          y: Number(h.score),
        };
      });

      setReportModel({
        academyName: "산본 블라썸에듀",
        student,
        exam,
        stats,
        my: {
          score: myScore,
          gradeLabel: gradeLabelFromScore(myScore),
          deltaFromAvg,
        },
        chartPointsAll: pointsAll,
        table: { historyRecent, deltasRecent },
      });

      await new Promise((r) => setTimeout(r, 80));

      const el = reportRef.current;
      if (!el) throw new Error("리포트 영역 없음");

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const roundText = exam.roundNo ? `${exam.roundNo}회` : safeFileName(exam.title);
      const baseName = `학원모의_${safeFileName(student.name)}_${roundText}_${exam.exam_date || "날짜없음"}`;

      if (mode === "png") {
        const dataUrl = canvas.toDataURL("image/png");
        downloadDataUrl(dataUrl, `${baseName}.png`);
        return;
      }

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const yPos = (pageH - imgH) / 2;
      pdf.addImage(imgData, "PNG", 0, yPos, imgW, imgH);
      pdf.save(`${baseName}.pdf`);
    } catch (e) {
      console.error(e);
      alert(mode === "png" ? "이미지 생성 실패" : "PDF 생성 실패");
    } finally {
      setExportLoadingId(null);
      setExportMode(null);
    }
  }

  // =========================
  // ✅ 리포트 그래프 (50회차 대비)
  // =========================
  function LineChartMany({ points, width = 800, height = 230, padding = 26 }) {
    const pts = (points || []).filter((p) => Number.isFinite(p.y));
    const n = pts.length;

    // y축은 0~100 고정이 제일 보기 좋음
    const minY = 0;
    const maxY = 100;

    const w = width;
    const h = height;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;

    const xStep = n <= 1 ? innerW : innerW / (n - 1);
    const yScale = (v) => {
      const t = (v - minY) / (maxY - minY || 1);
      return padding + innerH - t * innerH;
    };
    const xScale = (idx) => padding + idx * xStep;

    const d = pts
      .map((p, i) => {
        const x = xScale(i);
        const y = yScale(p.y);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    // ✅ 점/라벨 간격 자동
    // - 1~15개: 전부
    // - 16~30개: 2개마다
    // - 31~60개: 5개마다
    // - 61개 이상: 10개마다
    let step = 1;
    if (n > 15) step = 2;
    if (n > 30) step = 5;
    if (n > 60) step = 10;

    const showIdx = new Set();
    for (let i = 0; i < n; i += step) showIdx.add(i);
    showIdx.add(0);
    if (n > 0) showIdx.add(n - 1);

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

        {n >= 2 ? <path d={d} fill="none" stroke={COLORS.blue} strokeWidth="2.8" /> : null}

        {pts.map((p, i) => {
          if (!showIdx.has(i)) return null;
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

  return (
    <div style={{ maxWidth: 1500, margin: "26px auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>{headerTitle}</div>
          <div style={{ marginTop: 6, color: COLORS.sub }}>
            조건을 걸어 성적 데이터를 모아서 보고, 엑셀로 내보낼 수 있어요.
            {type === "academy_mock" ? (
              <div style={{ marginTop: 6, color: COLORS.sub }}>
                · 우측 다운로드 버튼으로 <b>PDF</b> 또는 <b>이미지(PNG)</b>로 저장할 수 있어요(카톡 전송용).
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
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="예: 모의고사 6회차" />
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
              {type === "academy_mock" ? <Th>다운로드</Th> : null}
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
                const showGrade = type === "academy_mock" ? gradeLabelFromScore(r.score) : r.grade_label || "-";
                const busy = exportLoadingId === r.id;

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
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button type="button" onClick={() => exportAcademyMockReport(r, "pdf")} style={{ ...miniBtn, opacity: busy ? 0.55 : 1 }} disabled={busy}>
                            {busy && exportMode === "pdf" ? "PDF…" : "PDF"}
                          </button>
                          <button type="button" onClick={() => exportAcademyMockReport(r, "png")} style={{ ...miniBtn, opacity: busy ? 0.55 : 1 }} disabled={busy}>
                            {busy && exportMode === "png" ? "IMG…" : "IMG"}
                          </button>
                        </div>
                      </Td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ 리포트 렌더 영역(화면 밖) */}
      <div style={{ position: "absolute", left: -99999, top: -99999, width: REPORT_W }}>
        {reportModel ? (
          <div
            ref={reportRef}
            style={{
              width: REPORT_W,
              height: REPORT_H,
              overflow: "hidden",
              background: "#fff",
              color: COLORS.text,
              fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
              position: "relative",
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
                  <div style={{ fontSize: 20, fontWeight: 1000, letterSpacing: "-0.2px" }}>{reportModel.academyName}</div>
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
                      {reportModel.exam.roundNo ? `모의고사 ${reportModel.exam.roundNo}회` : reportModel.exam.title}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "right", color: COLORS.sub, fontSize: 12, lineHeight: 1.5 }}>
                  <div>
                    <b>응시일</b> {reportModel.exam.exam_date || "-"}
                  </div>
                  <div>{new Date().toISOString().slice(0, 10)} 생성</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <InfoRow label="학생이름" value={reportModel.student.name} />
                <InfoRow label="담당선생님" value={reportModel.student.teacher} />
                <InfoRow label="학교" value={reportModel.student.school} />
                <InfoRow label="학년" value={reportModel.student.grade} />
              </div>
            </div>

            {/* 본문 */}
            <div style={{ padding: "16px 26px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
                <div style={pdfCard}>
                  <div style={pdfLabel}>이번 회차 요약</div>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 42, fontWeight: 1100, letterSpacing: "-0.6px" }}>{fmtScore(reportModel.my.score)}</div>
                    <div style={{ fontSize: 16, fontWeight: 1000, color: COLORS.blue }}>{reportModel.my.gradeLabel}</div>
                  </div>

                  <div style={{ marginTop: 10, color: COLORS.sub, fontSize: 12, lineHeight: 1.6 }}>
                    <div>
                      <b>평균 대비</b> :{" "}
                      <span style={{ fontWeight: 1000, color: (reportModel.my.deltaFromAvg || 0) >= 0 ? COLORS.blue : COLORS.red }}>
                        {reportModel.my.deltaFromAvg === null ? "-" : `${fmtDelta(reportModel.my.deltaFromAvg)}점`}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={pdfCard}>
                  <div style={pdfLabel}>이번 회차 전체 통계</div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <StatBox label="응시자" value={`${reportModel.stats.count}명`} />
                    <StatBox label="평균" value={reportModel.stats.avg === null ? "-" : `${fmtScore(reportModel.stats.avg)}점`} />
                    <StatBox label="최고" value={reportModel.stats.max === null ? "-" : `${fmtScore(reportModel.stats.max)}점`} />
                    <StatBox label="최저" value={reportModel.stats.min === null ? "-" : `${fmtScore(reportModel.stats.min)}점`} />
                    <StatBox label="중앙값" value={reportModel.stats.median === null ? "-" : `${fmtScore(reportModel.stats.median)}점`} />
                    <div />
                  </div>
                  <div style={{ marginTop: 10, color: COLORS.sub, fontSize: 10.5, lineHeight: 1.5 }}>
                    · 통계는 <b>회차(title)</b> 기준으로 집계됩니다(응시일이 달라도 같은 회차면 포함).
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, ...pdfCard }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
                  <div>
                    <div style={pdfLabel}>점수 추이</div>
                    <div style={{ marginTop: 4, color: COLORS.sub, fontSize: 10.5 }}>· 회차 순서로 정렬 · 회차가 많으면 라벨/점은 간격으로 표시</div>
                  </div>
                  <div style={{ color: COLORS.sub, fontSize: 10.5 }}>등급 기준: 90~100(1) … 0~19(9)</div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <LineChartMany points={reportModel.chartPointsAll || []} />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ color: COLORS.sub, fontSize: 10.5, fontWeight: 900, marginBottom: 6 }}>최근 기록(최근 8회)</div>
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
                      {(reportModel.table?.historyRecent || []).map((h, idx) => {
                        const d = (reportModel.table?.deltasRecent || [])[idx] || {};
                        const sd = d.scoreDelta;
                        const rno = parseRoundNo(h.title);
                        const roundText = Number.isFinite(rno) ? `${rno}회` : h.title || "-";
                        const sdSymbol = sd === null || sd === undefined ? "-" : sd > 0 ? "▲" : sd < 0 ? "▼" : "-";
                        const sdText = sdSymbol === "-" ? "-" : `${sdSymbol} ${fmtDelta(sd)}`;

                        return (
                          <tr key={h.id}>
                            <td style={pdfTd}>{roundText}</td>
                            <td style={pdfTd}>{fmtScore(h.score)}</td>
                            <td style={pdfTd}>{h.gradeLabel}</td>
                            <td style={pdfTd}>
                              <span style={{ fontWeight: 1000, color: sd > 0 ? COLORS.blue : sd < 0 ? COLORS.red : COLORS.sub }}>{sdText}</span>
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
                © {new Date().getFullYear()} {reportModel.academyName} · 내부용 리포트
              </div>
              <img src={blossomLogo} alt="logo" style={{ width: 52, height: 52, objectFit: "contain", opacity: 0.95 }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// UI 컴포넌트
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
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: `1px solid ${COLORS.pdfLineSoft}`, background: "#fff" }}>
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

const miniBtn = {
  height: 32,
  padding: "0 10px",
  borderRadius: 10,
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