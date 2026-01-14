// src/pages/grades/StudentGradesPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "../../utils/supabaseClient";

const COLORS = {
  text: "#1f2a44",
  sub: "#5d6b82",
  border: "#e3e8f3",
  soft: "#f7f9fc",
  blue: "#2f6fed",
  red: "#e04b4b",
};

const YEARS = [2024, 2025, 2026, 2027, 2028];
const SCHOOL_GRADES_ALL = ["중1", "중2", "중3", "고1", "고2", "고3"];
const SCHOOL_GRADES_HIGH = ["고1", "고2", "고3"];
const SEMESTERS = ["1학기", "2학기"];
const EXAM_KINDS = ["중간", "기말"];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function fmtScore(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  // 소수 둘째 자리까지
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

// 간단 SVG 라인차트(0~100 고정)
function LineChart({ points, height = 160, title }) {
  const w = 860;
  const h = height;
  const padL = 40;
  const padR = 14;
  const padT = 18;
  const padB = 28;

  const safe = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : null);
  const ys = points.map((p) => safe(p.y)).filter((v) => v !== null);
  const has = ys.length > 0;

  const yMin = 0;
  const yMax = 100;

  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xFor = (i) => padL + (points.length <= 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
  const yFor = (y) => padT + ((yMax - y) * innerH) / (yMax - yMin);

  const poly = has
    ? points
        .map((p, i) => {
          const y = safe(p.y);
          if (y === null) return null;
          return `${xFor(i)},${yFor(y)}`;
        })
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div style={{ marginTop: 10 }}>
      {title ? (
        <div style={{ fontWeight: 800, marginBottom: 6, color: COLORS.text }}>{title}</div>
      ) : null}

      <svg width={w} height={h} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, background: "#fff" }}>
        {[0, 50, 100].map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke={COLORS.border} strokeWidth="1" />
              <text x={10} y={y + 4} fontSize="12" fill={COLORS.sub}>
                {tick}
              </text>
            </g>
          );
        })}

        {has && points.length >= 2 ? (
          <polyline
            points={poly}
            fill="none"
            stroke={COLORS.blue}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {has
          ? points.map((p, i) => {
              const y = safe(p.y);
              if (y === null) return null;
              return <circle key={i} cx={xFor(i)} cy={yFor(y)} r="3.5" fill={COLORS.blue} />;
            })
          : null}

        {points.map((p, i) => (
          <text key={i} x={xFor(i)} y={h - 10} textAnchor="middle" fontSize="11" fill={COLORS.sub}>
            {p.xLabel}
          </text>
        ))}

        {!has ? (
          <text x={w / 2} y={h / 2} textAnchor="middle" fontSize="14" fill={COLORS.sub}>
            데이터가 없습니다
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function SectionTitle({ title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginTop: 26 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.text }}>{title}</div>
      {right}
    </div>
  );
}

function TrendCell({ symbol, delta }) {
  if (!symbol || symbol === "-") return <span style={{ color: COLORS.sub }}>-</span>;
  const isUp = symbol === "▲";
  const color = isUp ? COLORS.blue : COLORS.red;
  return (
    <span style={{ color, fontWeight: 900 }}>
      {symbol} {fmtDelta(delta)}
    </span>
  );
}

export default function StudentGradesPage() {
  const nav = useNavigate();
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [student, setStudent] = useState(null);

  const [schoolRows, setSchoolRows] = useState([]);
  const [mockRows, setMockRows] = useState([]);
  const [academyRows, setAcademyRows] = useState([]);

  // PDF 체크
  const [pdfParts, setPdfParts] = useState({
    school: true,
    mock: true,
    academy: true,
  });
  const exportRef = useRef(null);

  // 내신 입력 폼
  const [fSchool, setFSchool] = useState({
    year: 2026,
    school_grade: "중2",
    semester: "1학기",
    exam_kind: "중간",
    score: "",
    grade_label: "",
  });

  // 모의 입력 폼
  const [fMock, setFMock] = useState({
    year: 2026,
    school_grade: "고1",
    month: 6,
    score: "",
  });

  // 기타 입력 폼
  const [fAcademy, setFAcademy] = useState({
    exam_date: new Date().toISOString().slice(0, 10),
    title: "",
    score: "",
  });

  const isHigh = useMemo(() => {
    const g = (student?.grade || "").trim();
    return ["고1", "고2", "고3"].includes(g);
  }, [student?.grade]);

  useEffect(() => {
    (async () => {
      await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function loadAll() {
    setLoading(true);
    try {
      // ✅ students 실제 컬럼명으로 조회
      const { data: s, error: se } = await supabase
        .from("students")
        .select("id,name,school,grade,teacher_name,phone_digits,first_lesson_date")
        .eq("id", studentId)
        .single();
      if (se) throw se;
      setStudent(s);

      // 폼 기본값을 학생 학년에 맞게 조정
      setFSchool((p) => ({
        ...p,
        school_grade: SCHOOL_GRADES_ALL.includes(s.grade) ? s.grade : p.school_grade,
      }));
      setFMock((p) => ({
        ...p,
        school_grade: SCHOOL_GRADES_HIGH.includes(s.grade) ? s.grade : p.school_grade,
      }));

      await loadScores();
    } catch (e) {
      console.error(e);
      alert("학생 정보를 불러오지 못했습니다.");
      nav(-1);
    } finally {
      setLoading(false);
    }
  }

  async function loadScores() {
    const { data, error } = await supabase
      .from("student_scores_enriched")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("성적 데이터를 불러오지 못했습니다.");
      return;
    }

    const all = data || [];
    setSchoolRows(all.filter((r) => r.type === "school_exam"));
    setMockRows(all.filter((r) => r.type === "mock_exam"));
    setAcademyRows(all.filter((r) => r.type === "academy_mock"));
  }

  function parseNumericOrNull(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    if (Number.isNaN(n)) return null;
    return n;
  }

  async function saveSchoolExam() {
    if (!fSchool.year || !fSchool.school_grade || !fSchool.semester || !fSchool.exam_kind) {
      alert("연도/학년/학기/시험을 모두 선택해줘.");
      return;
    }
    const score = parseNumericOrNull(fSchool.score);
    if (score === null) {
      alert("점수를 입력해줘. (소수 가능)");
      return;
    }

    const payload = {
      student_id: studentId,
      type: "school_exam",
      year: Number(fSchool.year),
      school_grade: fSchool.school_grade,
      semester: fSchool.semester,
      exam_kind: fSchool.exam_kind,
      score,
      grade_label: (fSchool.grade_label || "").trim() || null,
    };

    setSaving(true);
    try {
      // ✅ partial unique index(WHERE type=...) 매칭 실패 방지:
      //    type 포함 일반 unique로 바꾼 경우에 맞춰 onConflict도 type 포함으로
      const { error } = await supabase.from("student_scores").upsert(payload, {
        onConflict: "student_id,type,year,school_grade,semester,exam_kind",
      });
      if (error) throw error;

      setFSchool((p) => ({ ...p, score: "" }));
      await loadScores();
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function saveMockExam() {
    if (!isHigh) return;
    if (!fMock.year || !fMock.school_grade || !fMock.month) {
      alert("연도/학년/월을 모두 선택해줘.");
      return;
    }
    const score = parseNumericOrNull(fMock.score);
    if (score === null) {
      alert("점수를 입력해줘. (소수 가능)");
      return;
    }

    const payload = {
      student_id: studentId,
      type: "mock_exam",
      year: Number(fMock.year),
      school_grade: fMock.school_grade,
      month: Number(fMock.month),
      score,
    };

    setSaving(true);
    try {
      // ✅ type 포함 onConflict
      const { error } = await supabase.from("student_scores").upsert(payload, {
        onConflict: "student_id,type,year,school_grade,month",
      });
      if (error) throw error;

      setFMock((p) => ({ ...p, score: "" }));
      await loadScores();
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function saveAcademyMock() {
    if (!fAcademy.exam_date) {
      alert("날짜를 선택해줘.");
      return;
    }
    if (!(fAcademy.title || "").trim()) {
      alert("모의고사 종류를 입력해줘.");
      return;
    }
    const score = parseNumericOrNull(fAcademy.score);
    if (score === null) {
      alert("점수를 입력해줘. (소수 가능)");
      return;
    }

    const payload = {
      student_id: studentId,
      type: "academy_mock",
      exam_date: fAcademy.exam_date,
      title: fAcademy.title.trim(),
      score,
    };

    setSaving(true);
    try {
      // ✅ type 포함 onConflict (DB를 type 포함 unique로 정리한 경우)
      const { error } = await supabase.from("student_scores").upsert(payload, {
        onConflict: "student_id,type,exam_date,title",
      });
      if (error) throw error;

      setFAcademy((p) => ({ ...p, score: "" }));
      await loadScores();
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteScore(row) {
    if (!confirm("삭제할까요?")) return;
    try {
      const { error } = await supabase.from("student_scores").delete().eq("id", row.id);
      if (error) throw error;
      await loadScores();
    } catch (e) {
      console.error(e);
      alert("삭제 실패");
    }
  }

  const schoolChartPoints = useMemo(() => {
    const asc = [...schoolRows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return asc.map((r) => ({
      xLabel: `${r.year ?? ""}${r.semester ? ` ${r.semester}` : ""}${r.exam_kind ? ` ${r.exam_kind}` : ""}`.trim() || "-",
      y: Number(r.score),
    }));
  }, [schoolRows]);

  const mockChartPoints = useMemo(() => {
    const asc = [...mockRows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return asc.map((r) => ({
      xLabel: `${r.year ?? ""}-${String(r.month ?? "").padStart(2, "0")}`,
      y: Number(r.score),
    }));
  }, [mockRows]);

  const academyChartPoints = useMemo(() => {
    const asc = [...academyRows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return asc.map((r) => ({
      xLabel: (r.exam_date || "").slice(5) || "-",
      y: Number(r.score),
    }));
  }, [academyRows]);

  async function exportPdf() {
    const any = Object.values(pdfParts).some(Boolean);
    if (!any) {
      alert("PDF에 포함할 영역을 하나 이상 선택해줘.");
      return;
    }
    if (!exportRef.current) return;

    const prevScrollY = window.scrollY;
    window.scrollTo(0, 0);

    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let y = 0;
      let remaining = imgH;

      pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
      remaining -= pageH;

      while (remaining > 0) {
        pdf.addPage();
        y = -(imgH - remaining);
        pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
        remaining -= pageH;
      }

      const safeName = (student?.name || "학생").replace(/[\\/:*?"<>|]/g, "_");
      const fileName = `성적표_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
    } catch (e) {
      console.error(e);
      alert("PDF 생성 실패");
    } finally {
      window.scrollTo(0, prevScrollY);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "40px auto", padding: 20, color: COLORS.sub }}>
        불러오는 중…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "26px auto", padding: 20 }}>
      {/* 상단 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>
            {student?.name || "학생"} 성적
          </div>
          <div style={{ color: COLORS.sub, marginTop: 6 }}>
            {student?.school || "-"} · {student?.grade || "-"} · {student?.teacher_name || "-"}
            {student?.phone_digits ? ` · ${student.phone_digits}` : ""}
            {student?.first_lesson_date ? ` · 첫수업 ${student.first_lesson_date}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => nav(-1)} style={btnGhost}>
            뒤로
          </button>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <label style={chkLabel}>
              <input
                type="checkbox"
                checked={pdfParts.school}
                onChange={(e) => setPdfParts((p) => ({ ...p, school: e.target.checked }))}
              />
              내신
            </label>
            <label style={chkLabel}>
              <input
                type="checkbox"
                checked={pdfParts.mock}
                onChange={(e) => setPdfParts((p) => ({ ...p, mock: e.target.checked }))}
              />
              모의
            </label>
            <label style={chkLabel}>
              <input
                type="checkbox"
                checked={pdfParts.academy}
                onChange={(e) => setPdfParts((p) => ({ ...p, academy: e.target.checked }))}
              />
              기타
            </label>
            <button type="button" onClick={exportPdf} style={btnPrimary}>
              PDF 내보내기
            </button>
          </div>
        </div>
      </div>

      {/* ===================== 내신 ===================== */}
      <SectionTitle
        title="내신"
        right={
          <button type="button" onClick={saveSchoolExam} disabled={saving} style={btnPrimary}>
            저장
          </button>
        }
      />

      <div style={formGrid}>
        <Field label="연도">
          <select value={fSchool.year} onChange={(e) => setFSchool((p) => ({ ...p, year: Number(e.target.value) }))} style={input}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>

        <Field label="학년">
          <select value={fSchool.school_grade} onChange={(e) => setFSchool((p) => ({ ...p, school_grade: e.target.value }))} style={input}>
            {SCHOOL_GRADES_ALL.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="학기">
          <select value={fSchool.semester} onChange={(e) => setFSchool((p) => ({ ...p, semester: e.target.value }))} style={input}>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="시험">
          <select value={fSchool.exam_kind} onChange={(e) => setFSchool((p) => ({ ...p, exam_kind: e.target.value }))} style={input}>
            {EXAM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>

        <Field label="점수 (필수)">
          <input
            value={fSchool.score}
            onChange={(e) => setFSchool((p) => ({ ...p, score: e.target.value }))}
            style={input}
            inputMode="decimal"
            placeholder="예: 89.5"
          />
        </Field>

        <Field label="등급 (선택)">
          <input
            value={fSchool.grade_label}
            onChange={(e) => setFSchool((p) => ({ ...p, grade_label: e.target.value }))}
            style={input}
            placeholder="예: 3 또는 A"
          />
        </Field>
      </div>

      <ScoresTable
        rows={schoolRows}
        onDelete={deleteScore}
        columns={[
          { key: "meta", title: "시험", render: (r) => `${r.year} ${r.semester} ${r.exam_kind}` },
          { key: "score", title: "점수", render: (r) => fmtScore(r.score) },
          { key: "grade_label", title: "등급", render: (r) => (r.grade_label ? r.grade_label : "-") },
          {
            key: "score_delta",
            title: "전 시험 대비 점수",
            render: (r) => <TrendCell symbol={r.score_trend_symbol} delta={r.score_delta} />,
          },
          {
            key: "grade_delta",
            title: "전 시험 대비 등급",
            render: (r) => <TrendCell symbol={r.grade_trend_symbol} delta={r.grade_delta} />,
          },
        ]}
      />

      <LineChart points={schoolChartPoints} title="내신 점수 변동 (0-100)" />

      {/* ===================== 모의고사 ===================== */}
      {isHigh ? (
        <>
          <SectionTitle
            title="모의고사"
            right={
              <button type="button" onClick={saveMockExam} disabled={saving} style={btnPrimary}>
                저장
              </button>
            }
          />

          <div style={formGrid4}>
            <Field label="연도">
              <select value={fMock.year} onChange={(e) => setFMock((p) => ({ ...p, year: Number(e.target.value) }))} style={input}>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="학년(고1~고3)">
              <select value={fMock.school_grade} onChange={(e) => setFMock((p) => ({ ...p, school_grade: e.target.value }))} style={input}>
                {SCHOOL_GRADES_HIGH.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="월">
              <select value={fMock.month} onChange={(e) => setFMock((p) => ({ ...p, month: Number(e.target.value) }))} style={input}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </Field>

            <Field label="점수 (필수)">
              <input
                value={fMock.score}
                onChange={(e) => setFMock((p) => ({ ...p, score: e.target.value }))}
                style={input}
                inputMode="decimal"
                placeholder="예: 92.25"
              />
            </Field>
          </div>

          <ScoresTable
            rows={mockRows}
            onDelete={deleteScore}
            columns={[
              { key: "meta", title: "시험", render: (r) => `${r.year}-${String(r.month).padStart(2, "0")}` },
              { key: "score", title: "점수", render: (r) => fmtScore(r.score) },
              {
                key: "score_delta",
                title: "이전 대비",
                render: (r) => <TrendCell symbol={r.score_trend_symbol} delta={r.score_delta} />,
              },
            ]}
          />

          <LineChart points={mockChartPoints} title="모의고사 점수 변동 (0-100)" />
        </>
      ) : null}

      {/* ===================== 기타 학원 모의고사 ===================== */}
      <SectionTitle
        title="기타 학원 모의고사"
        right={
          <button type="button" onClick={saveAcademyMock} disabled={saving} style={btnPrimary}>
            저장
          </button>
        }
      />

      <div style={formGrid3}>
        <Field label="날짜">
          <input
            type="date"
            value={fAcademy.exam_date}
            onChange={(e) => setFAcademy((p) => ({ ...p, exam_date: e.target.value }))}
            style={input}
          />
        </Field>

        <Field label="종류 (필수)">
          <input
            value={fAcademy.title}
            onChange={(e) => setFAcademy((p) => ({ ...p, title: e.target.value }))}
            style={input}
            placeholder="예: 학원 모의고사 1"
          />
        </Field>

        <Field label="점수 (필수)">
          <input
            value={fAcademy.score}
            onChange={(e) => setFAcademy((p) => ({ ...p, score: e.target.value }))}
            style={input}
            inputMode="decimal"
            placeholder="예: 78.5"
          />
        </Field>
      </div>

      <ScoresTable
        rows={academyRows}
        onDelete={deleteScore}
        columns={[
          { key: "meta", title: "시험", render: (r) => `${r.exam_date} · ${r.title}` },
          { key: "score", title: "점수", render: (r) => fmtScore(r.score) },
          {
            key: "score_delta",
            title: "이전 대비",
            render: (r) => <TrendCell symbol={r.score_trend_symbol} delta={r.score_delta} />,
          },
        ]}
      />

      <LineChart points={academyChartPoints} title="기타 모의고사 점수 변동 (0-100)" />

      {/* ===================== PDF Export 전용 렌더(숨김) ===================== */}
      <div
        ref={exportRef}
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          width: 900,
          padding: 22,
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>성적표</div>
        <div style={{ borderTop: `2px solid ${COLORS.border}`, margin: "10px 0 14px 0" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
          <div>
            <b>이름:</b> {student?.name || "-"}
          </div>
          <div>
            <b>담당:</b> {student?.teacher_name || "-"}
          </div>
          <div>
            <b>학교:</b> {student?.school || "-"}
          </div>
          <div>
            <b>학년:</b> {student?.grade || "-"}
          </div>
          <div>
            <b>연락처:</b> {student?.phone_digits || "-"}
          </div>
          <div>
            <b>첫수업일:</b> {student?.first_lesson_date || "-"}
          </div>
        </div>

        {pdfParts.school ? (
          <>
            <div style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>내신</div>
            <ExportTable
              rows={schoolRows}
              columns={[
                { title: "시험", render: (r) => `${r.year} ${r.semester} ${r.exam_kind}` },
                { title: "점수", render: (r) => fmtScore(r.score) },
                { title: "등급", render: (r) => (r.grade_label ? r.grade_label : "-") },
                { title: "전 시험 대비 점수", render: (r) => (r.score_trend_symbol === "-" ? "-" : `${r.score_trend_symbol} ${fmtDelta(r.score_delta)}`) },
                { title: "전 시험 대비 등급", render: (r) => (r.grade_trend_symbol === "-" ? "-" : `${r.grade_trend_symbol} ${fmtDelta(r.grade_delta)}`) },
              ]}
            />
            <LineChart points={schoolChartPoints} title="내신 점수 변동 (0-100)" />
          </>
        ) : null}

        {pdfParts.mock && isHigh ? (
          <>
            <div style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>모의고사</div>
            <ExportTable
              rows={mockRows}
              columns={[
                { title: "시험", render: (r) => `${r.year}-${String(r.month).padStart(2, "0")}` },
                { title: "점수", render: (r) => fmtScore(r.score) },
                { title: "이전 대비", render: (r) => (r.score_trend_symbol === "-" ? "-" : `${r.score_trend_symbol} ${fmtDelta(r.score_delta)}`) },
              ]}
            />
            <LineChart points={mockChartPoints} title="모의고사 점수 변동 (0-100)" />
          </>
        ) : null}

        {pdfParts.academy ? (
          <>
            <div style={{ marginTop: 18, fontSize: 16, fontWeight: 900 }}>기타 학원 모의고사</div>
            <ExportTable
              rows={academyRows}
              columns={[
                { title: "시험", render: (r) => `${r.exam_date} · ${r.title}` },
                { title: "점수", render: (r) => fmtScore(r.score) },
                { title: "이전 대비", render: (r) => (r.score_trend_symbol === "-" ? "-" : `${r.score_trend_symbol} ${fmtDelta(r.score_delta)}`) },
              ]}
            />
            <LineChart points={academyChartPoints} title="기타 모의고사 점수 변동 (0-100)" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ScoresTable({ rows, columns, onDelete }) {
  return (
    <div style={{ marginTop: 12, border: `1px solid ${COLORS.border}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: COLORS.soft }}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={th}>
                {c.title}
              </th>
            ))}
            <th style={th}>관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} style={{ padding: 14, color: COLORS.sub }}>
                기록이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.key} style={td}>
                    {c.render(r)}
                  </td>
                ))}
                <td style={td}>
                  <button type="button" onClick={() => onDelete(r)} style={btnDanger}>
                    삭제
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExportTable({ rows, columns }) {
  return (
    <div style={{ marginTop: 10, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ background: "#f3f6ff" }}>
          <tr>
            {columns.map((c, i) => (
              <th key={i} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${COLORS.border}` }}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 10, color: COLORS.sub }}>
                기록이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c, i) => (
                  <td key={i} style={{ padding: "8px 10px", borderBottom: `1px solid ${COLORS.border}` }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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

const formGrid = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 10,
};

const formGrid4 = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const formGrid3 = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const input = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: `1px solid ${COLORS.border}`,
  outline: "none",
  background: "#fff",
  color: COLORS.text,
};

const th = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 13,
  color: COLORS.sub,
};

const td = {
  padding: "10px 12px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 14,
  color: COLORS.text,
  verticalAlign: "middle",
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

const btnDanger = {
  height: 30,
  padding: "0 10px",
  borderRadius: 10,
  border: `1px solid rgba(224,75,75,0.35)`,
  background: "#fff",
  color: COLORS.red,
  fontWeight: 900,
  cursor: "pointer",
};

const chkLabel = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  color: COLORS.text,
  fontWeight: 800,
  fontSize: 13,
};
