// src/pages/grades/ScoreQueryPage.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
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

  // 기타 필터
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");

  const canExport = rows.length > 0;

  const headerTitle = useMemo(() => {
    if (type === "school_exam") return "유형별 성적데이터 조회 · 내신";
    if (type === "mock_exam") return "유형별 성적데이터 조회 · 모의고사";
    return "유형별 성적데이터 조회 · 기타 학원 모의고사";
  }, [type]);

  async function search() {
    setLoading(true);
    try {
      let q = supabase.from("student_scores_enriched").select("*").eq("type", type);

      // 공통: 학생 정보 필터(뷰 컬럼명 기준)
      if (studentName.trim()) q = q.ilike("student_name", `%${studentName.trim()}%`);
      if (studentSchool.trim()) q = q.ilike("student_school", `%${studentSchool.trim()}%`);
      if (studentGrade) q = q.eq("student_grade", studentGrade);
      if (teacherName.trim()) q = q.eq("student_teacher_name", teacherName.trim());

      // 타입별 필터
      if (type === "school_exam") {
        q = q.eq("year", Number(year)).eq("school_grade", schoolGrade).eq("semester", semester).eq("exam_kind", examKind);
      } else if (type === "mock_exam") {
        q = q.eq("year", Number(mockYear)).eq("school_grade", mockGrade).eq("month", Number(mockMonth));
      } else {
        // academy_mock
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
      const base = {
        학생이름: r.student_name ?? "",
        학교: r.student_school ?? "",
        학년: r.student_grade ?? "",
        담당선생님: r.student_teacher_name ?? "",
        점수: r.score ?? "",
        등급: r.grade_label ?? "",
        "이전 대비 점수": trendText(r.score_trend_symbol, r.score_delta),
        "이전 대비 등급": trendText(r.grade_trend_symbol, r.grade_delta),
      };

      if (type === "school_exam") {
        return {
          ...base,
          유형: "내신",
          연도: r.year ?? "",
          학년선택: r.school_grade ?? "",
          학기: r.semester ?? "",
          시험: r.exam_kind ?? "",
        };
      }
      if (type === "mock_exam") {
        return {
          ...base,
          유형: "모의고사",
          연도: r.year ?? "",
          학년선택: r.school_grade ?? "",
          월: r.month ?? "",
        };
      }
      return {
        ...base,
        유형: "기타 학원 모의고사",
        날짜: r.exam_date ?? "",
        종류: r.title ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(mapped);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scores");

    const fileName = `성적데이터_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  return (
    <div style={{ maxWidth: 1500, margin: "26px auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>{headerTitle}</div>
          <div style={{ marginTop: 6, color: COLORS.sub }}>
            조건을 걸어 성적 데이터를 모아서 보고, 엑셀로 내보낼 수 있어요.
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

          {/* 타입별 */}
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
              <Field label="종류(부분검색)">
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} placeholder="예: 학원 모의" />
              </Field>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 14, color: COLORS.sub }}>
                  조회 결과가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <Td>{r.student_name}</Td>
                  <Td>{r.student_school}</Td>
                  <Td>{r.student_grade}</Td>
                  <Td>{r.student_teacher_name}</Td>
                  <Td>{fmtScore(r.score)}</Td>
                  <Td>{r.grade_label || "-"}</Td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
