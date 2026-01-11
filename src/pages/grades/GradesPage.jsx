// src/pages/grades/GradesPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../utils/supabaseClient";

const COLORS = {
  blue: "#2f6fed",
  border: "#e3e8f3",
  sub: "#5d6b82",
};

export default function GradesPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("students")
      .select(`
        id,
        name,
        school,
        grade,
        teacher_name,
        student_score_averages (
          avg_school_exam,
          avg_mock_exam
        )
      `)
      .order("name");

    setRows(data || []);
  }

  const filtered = rows.filter((r) =>
    [r.name, r.school, r.grade, r.teacher_name]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1400, margin: "30px auto", padding: 20 }}>
      <h1>학생별 성적관리</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="이름 / 학교 / 학년 / 담당선생님 검색"
        style={searchStyle}
      />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["학생이름","학교","학년","담당","내신평균","모의평균"].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td style={tdStyle}>
                <span
                  onClick={() => nav(`/grades/students/${r.id}`)}
                  style={{ color: COLORS.blue, textDecoration: "underline", cursor: "pointer" }}
                >
                  {r.name}
                </span>
              </td>
              <td style={tdStyle}>{r.school}</td>
              <td style={tdStyle}>{r.grade}</td>
              <td style={tdStyle}>{r.teacher_name}</td>
              <td style={tdStyle}>
                {r.student_score_averages?.avg_school_exam?.toFixed(1) ?? "-"}
              </td>
              <td style={tdStyle}>
                {r.student_score_averages?.avg_mock_exam?.toFixed(1) ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const searchStyle = {
  width: "100%",
  padding: 12,
  margin: "20px 0",
  fontSize: 15,
  borderRadius: 10,
  border: "1px solid #e3e8f3",
};

const thStyle = {
  textAlign: "left",
  padding: 10,
  borderBottom: "2px solid #e3e8f3",
};

const tdStyle = {
  padding: 10,
  borderBottom: "1px solid #eef1f7",
};
