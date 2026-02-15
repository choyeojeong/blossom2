// src/pages/CounselingPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  lineSoft: "rgba(31,42,68,0.08)",
  white: "#ffffff",
  blue: "#2f6fed",
  blueSoft: "rgba(47,111,237,0.10)",
  dangerSoft: "rgba(224,75,75,0.10)",
  danger: "#e04b4b",
};

function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export default function CounselingPage() {
  const navigate = useNavigate();

  // 템플릿
  const [types, setTypes] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [areas, setAreas] = useState([]);
  const [templatesByArea, setTemplatesByArea] = useState({});

  // 템플릿 추가 입력
  const [newTypeName, setNewTypeName] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaMax, setNewAreaMax] = useState(20);

  const [newCommentAreaId, setNewCommentAreaId] = useState("");
  const [newCommentText, setNewCommentText] = useState("");

  // 상담 기록
  const [sessions, setSessions] = useState([]);
  const [q, setQ] = useState("");
  const [pdfOpeningId, setPdfOpeningId] = useState(null);

  // 새 상담 입력 모달
  const [openNew, setOpenNew] = useState(false);
  const [newSession, setNewSession] = useState({
    student_name: "",
    student_school: "",
    student_grade: "",
    teacher_name: "",
    test_date: dayjs().format("YYYY-MM-DD"),
    // 일대일
    oto_weekday: 1,
    oto_arrival_time: "",
    oto_class_time: "",
    // 독해
    reading_weekday: 1,
    reading_teacher_name: "",
    reading_class_time: "",
  });

  const filteredSessions = useMemo(() => {
    const qq = (q || "").trim();
    if (!qq) return sessions;
    return sessions.filter((s) =>
      `${s.student_name || ""} ${s.student_school || ""} ${s.student_grade || ""} ${s.test_type_name || ""}`
        .toLowerCase()
        .includes(qq.toLowerCase())
    );
  }, [sessions, q]);

  async function loadTypes() {
    const { data, error } = await supabase
      .from("counsel_test_types")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) return alert("레벨테스트 종류 로드 실패: " + error.message);
    setTypes(data || []);
    if (!selectedTypeId && data?.[0]?.id) setSelectedTypeId(data[0].id);
  }

  async function loadAreasAndTemplates(typeId) {
    if (!typeId) {
      setAreas([]);
      setTemplatesByArea({});
      return;
    }

    const { data: a, error: e1 } = await supabase
      .from("counsel_areas")
      .select("*")
      .eq("test_type_id", typeId)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (e1) return alert("영역 로드 실패: " + e1.message);

    setAreas(a || []);
    if (!newCommentAreaId && a?.[0]?.id) setNewCommentAreaId(a[0].id);

    if (!a?.length) {
      setTemplatesByArea({});
      return;
    }

    const areaIds = a.map((x) => x.id);
    const { data: t, error: e2 } = await supabase
      .from("counsel_comment_templates")
      .select("*")
      .in("area_id", areaIds)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (e2) return alert("코멘트 템플릿 로드 실패: " + e2.message);

    const grouped = {};
    for (const row of t || []) {
      if (!grouped[row.area_id]) grouped[row.area_id] = [];
      grouped[row.area_id].push(row);
    }
    setTemplatesByArea(grouped);
  }

  async function loadSessions() {
    const { data, error } = await supabase
      .from("v_counsel_sessions_summary")
      .select("*")
      .order("test_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return alert("상담 기록 로드 실패: " + error.message);
    setSessions(data || []);
  }

  useEffect(() => {
    loadTypes();
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAreasAndTemplates(selectedTypeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeId]);

  // ====== PDF 다시받기 ======
  async function openPdfFromPath(sessionId, path) {
    if (!path) return;

    setPdfOpeningId(sessionId);
    try {
      // 1) Private 버킷일 때: Signed URL 먼저 시도
      const { data: signed, error: e1 } = await supabase.storage
        .from("counseling_pdfs")
        .createSignedUrl(path, 60 * 10); // 10분

      if (!e1 && signed?.signedUrl) {
        window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // 2) Public 버킷일 때: Public URL fallback
      const { data: pub } = supabase.storage
        .from("counseling_pdfs")
        .getPublicUrl(path);

      const url = pub?.publicUrl;
      if (!url) throw new Error("PDF 링크 생성 실패(버킷 설정 확인 필요)");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert("PDF 다시받기 실패: " + (e?.message || String(e)));
    } finally {
      setPdfOpeningId(null);
    }
  }

  // ===== 템플릿: 종류 =====
  async function addType() {
    const name = (newTypeName || "").trim();
    if (!name) return alert("레벨테스트 종류 이름을 입력해주세요.");
    const { error } = await supabase.from("counsel_test_types").insert({ name });
    if (error) return alert("추가 실패: " + error.message);
    setNewTypeName("");
    await loadTypes();
  }

  async function renameType(typeId, currentName) {
    const next = prompt("종류 이름 수정", currentName || "");
    if (!next) return;
    const name = next.trim();
    if (!name) return;
    const { error } = await supabase
      .from("counsel_test_types")
      .update({ name })
      .eq("id", typeId);
    if (error) return alert("수정 실패: " + error.message);
    await loadTypes();
  }

  async function deleteType(typeId) {
    if (
      !confirm(
        "이 레벨테스트 종류를 삭제할까요?\n(해당 종류의 영역/코멘트 템플릿도 함께 삭제됩니다)"
      )
    )
      return;
    const { error } = await supabase
      .from("counsel_test_types")
      .delete()
      .eq("id", typeId);
    if (error) return alert("삭제 실패: " + error.message);
    setSelectedTypeId("");
    await loadTypes();
  }

  // ===== 템플릿: 영역 =====
  async function addArea() {
    if (!selectedTypeId) return alert("먼저 레벨테스트 종류를 선택해주세요.");
    const name = (newAreaName || "").trim();
    if (!name) return alert("영역 이름을 입력해주세요.");

    const max = safeNum(newAreaMax, NaN);
    if (!Number.isFinite(max) || max < 0)
      return alert("총점(max_score)을 숫자로 입력해주세요.");

    const order_index = (areas?.[areas.length - 1]?.order_index ?? -1) + 1;

    const { error } = await supabase.from("counsel_areas").insert({
      test_type_id: selectedTypeId,
      name,
      max_score: Math.floor(max),
      order_index,
    });
    if (error) return alert("추가 실패: " + error.message);

    setNewAreaName("");
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function updateArea(areaId, patch) {
    const { error } = await supabase
      .from("counsel_areas")
      .update(patch)
      .eq("id", areaId);
    if (error) return alert("영역 수정 실패: " + error.message);
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function deleteArea(areaId, name) {
    if (
      !confirm(
        `영역 "${name}" 을 삭제할까요?\n(해당 영역의 코멘트 템플릿도 함께 삭제됩니다)`
      )
    )
      return;
    const { error } = await supabase
      .from("counsel_areas")
      .delete()
      .eq("id", areaId);
    if (error) return alert("영역 삭제 실패: " + error.message);
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function moveArea(areaId, dir) {
    const idx = areas.findIndex((a) => a.id === areaId);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= areas.length) return;

    const a1 = areas[idx];
    const a2 = areas[swapIdx];

    const { error: e1 } = await supabase
      .from("counsel_areas")
      .update({ order_index: a2.order_index })
      .eq("id", a1.id);
    if (e1) return alert("순서 변경 실패: " + e1.message);

    const { error: e2 } = await supabase
      .from("counsel_areas")
      .update({ order_index: a1.order_index })
      .eq("id", a2.id);
    if (e2) return alert("순서 변경 실패: " + e2.message);

    await loadAreasAndTemplates(selectedTypeId);
  }

  // ===== 템플릿: 코멘트 =====
  async function addCommentTemplate() {
    if (!newCommentAreaId) return alert("코멘트 템플릿을 추가할 영역을 선택해주세요.");
    const content = (newCommentText || "").trim();
    if (!content) return alert("코멘트 내용을 입력해주세요.");

    const list = templatesByArea[newCommentAreaId] || [];
    const order_index = (list?.[list.length - 1]?.order_index ?? -1) + 1;

    const { error } = await supabase.from("counsel_comment_templates").insert({
      area_id: newCommentAreaId,
      content,
      order_index,
    });
    if (error) return alert("추가 실패: " + error.message);

    setNewCommentText("");
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function editCommentTemplate(tid, currentText) {
    const next = prompt("코멘트 수정", currentText || "");
    if (!next) return;
    const content = next.trim();
    if (!content) return;
    const { error } = await supabase
      .from("counsel_comment_templates")
      .update({ content })
      .eq("id", tid);
    if (error) return alert("코멘트 수정 실패: " + error.message);
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function deleteCommentTemplate(tid) {
    if (!confirm("이 코멘트를 삭제할까요?")) return;
    const { error } = await supabase
      .from("counsel_comment_templates")
      .delete()
      .eq("id", tid);
    if (error) return alert("코멘트 삭제 실패: " + error.message);
    await loadAreasAndTemplates(selectedTypeId);
  }

  async function moveComment(areaId, tid, dir) {
    const list = templatesByArea[areaId] || [];
    const idx = list.findIndex((x) => x.id === tid);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const t1 = list[idx];
    const t2 = list[swapIdx];

    const { error: e1 } = await supabase
      .from("counsel_comment_templates")
      .update({ order_index: t2.order_index })
      .eq("id", t1.id);
    if (e1) return alert("순서 변경 실패: " + e1.message);

    const { error: e2 } = await supabase
      .from("counsel_comment_templates")
      .update({ order_index: t1.order_index })
      .eq("id", t2.id);
    if (e2) return alert("순서 변경 실패: " + e2.message);

    await loadAreasAndTemplates(selectedTypeId);
  }

  // ===== 새 상담 생성 =====
  function openNewSessionModal() {
    if (!selectedTypeId) return alert("먼저 레벨테스트 종류를 선택해주세요.");
    setNewSession((p) => ({
      ...p,
      test_date: dayjs().format("YYYY-MM-DD"),
    }));
    setOpenNew(true);
  }

  async function createNewSession() {
    if (!selectedTypeId) return alert("레벨테스트 종류를 선택해주세요.");
    const s = newSession;

    if (!(s.student_name || "").trim()) return alert("학생 이름을 입력해주세요.");
    if (!(s.teacher_name || "").trim())
      return alert("담당 선생님 성함을 입력해주세요.");

    // 요일: 월~토만
    if (![1, 2, 3, 4, 5, 6].includes(Number(s.oto_weekday)))
      return alert("일대일 요일은 월~토만 선택해주세요.");
    if (![1, 2, 3, 4, 5, 6].includes(Number(s.reading_weekday)))
      return alert("독해 요일은 월~토만 선택해주세요.");

    const payload = {
      student_name: (s.student_name || "").trim(),
      student_school: (s.student_school || "").trim() || null,
      student_grade: (s.student_grade || "").trim() || null,
      teacher_name: (s.teacher_name || "").trim() || null,
      test_type_id: selectedTypeId,
      test_date: s.test_date || dayjs().format("YYYY-MM-DD"),

      oto_weekday: Number(s.oto_weekday),
      oto_arrival_time: s.oto_arrival_time || null,
      oto_class_time: s.oto_class_time || null,

      reading_weekday: Number(s.reading_weekday),
      reading_teacher_name: (s.reading_teacher_name || "").trim() || null,
      reading_class_time: s.reading_class_time || null,
    };

    const { data, error } = await supabase
      .from("counsel_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error) return alert("새 상담 생성 실패: " + error.message);

    // 영역 점수 기본행(0점)
    const rows = (areas || []).map((a) => ({
      session_id: data.id,
      area_id: a.id,
      score: 0,
      max_score_snapshot: a.max_score,
    }));

    if (rows.length) {
      const { error: e2 } = await supabase.from("counsel_session_scores").upsert(rows, {
        onConflict: "session_id,area_id",
      });
      if (e2) return alert("영역 점수 초기화 실패: " + e2.message);
    }

    setOpenNew(false);
    await loadSessions();
    navigate(`/counseling/${data.id}`);
  }

  // ===== 스타일 =====
  const wrap = {
    minHeight: "100vh",
    padding:
      "calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 18px)",
    background: `linear-gradient(${COLORS.bgTop}, ${COLORS.bgBottom})`,
    color: COLORS.text,
  };

  const h1 = { margin: 0, fontSize: 20, letterSpacing: -0.2 };
  const sub = { marginTop: 6, color: COLORS.sub, fontSize: 13 };

  const sectionTitle = {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: 900,
  };
  const row = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  };
  const input = {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    outline: "none",
    minWidth: 220,
  };
  const select = { ...input, minWidth: 220 };
  const btn = {
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.blueSoft,
    cursor: "pointer",
    fontWeight: 900,
  };
  const btnDanger = { ...btn, background: COLORS.dangerSoft, color: COLORS.text };
  const smallBtn = {
    height: 30,
    padding: "0 10px",
    borderRadius: 10,
    border: `1px solid ${COLORS.line}`,
    background: "rgba(255,255,255,0.65)",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 12,
  };

  const table = {
    width: "100%",
    borderCollapse: "collapse",
    borderTop: `1px solid ${COLORS.line}`,
    marginTop: 10,
    background: "transparent",
  };
  const th = {
    textAlign: "left",
    fontSize: 12,
    color: COLORS.sub,
    padding: "10px 8px",
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    fontWeight: 900,
  };
  const td = {
    padding: "10px 8px",
    borderBottom: `1px solid ${COLORS.lineSoft}`,
    fontSize: 13,
    verticalAlign: "top",
  };

  // ===== 모달 =====
  const modalBg = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.30)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "0 12px calc(env(safe-area-inset-bottom) + 12px)",
    zIndex: 50,
  };

  const modal = {
    width: "min(900px, 100%)",
    background: "#ffffff",
    borderRadius: 16,
    border: `1px solid ${COLORS.lineSoft}`,
    padding: 14,
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const modalTitle = { fontSize: 15, fontWeight: 900, marginBottom: 10 };
  const fieldLabel = {
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 900,
    marginBottom: 6,
  };
  const input2 = { ...input, minWidth: 160 };

  return (
    <div style={wrap}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={h1}>상담관리</h1>
          <div style={sub}>
            템플릿(종류/영역/코멘트) 관리 + 신규 상담 기록 + PDF 저장/다시받기
          </div>
        </div>

        <button style={btn} onClick={openNewSessionModal}>
          + 새 상담
        </button>
      </div>

      {/* 템플릿 관리 */}
      <div style={sectionTitle}>1) 레벨테스트 종류</div>

      <div style={row}>
        <select
          style={select}
          value={selectedTypeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {!types.length && <option value="">(먼저 종류를 추가하세요)</option>}
        </select>

        {selectedTypeId && (
          <>
            <button
              style={smallBtn}
              onClick={() => {
                const cur = types.find((x) => x.id === selectedTypeId);
                renameType(selectedTypeId, cur?.name || "");
              }}
            >
              이름수정
            </button>
            <button style={smallBtn} onClick={() => deleteType(selectedTypeId)}>
              삭제
            </button>
          </>
        )}

        <input
          style={input}
          placeholder="종류 추가 (예: 예비중)"
          value={newTypeName}
          onChange={(e) => setNewTypeName(e.target.value)}
        />
        <button style={btn} onClick={addType}>
          종류 추가
        </button>
      </div>

      <div style={{ ...sectionTitle, marginTop: 14 }}>
        2) 영역(총점) — 수정/삭제/순서
      </div>

      <div style={row}>
        <input
          style={input}
          placeholder="영역명 (예: 단어)"
          value={newAreaName}
          onChange={(e) => setNewAreaName(e.target.value)}
        />
        <input
          style={{ ...input, minWidth: 140 }}
          type="number"
          placeholder="총점"
          value={newAreaMax}
          onChange={(e) => setNewAreaMax(e.target.value)}
        />
        <button style={btn} onClick={addArea}>
          영역 추가
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          borderTop: `1px solid ${COLORS.lineSoft}`,
          paddingTop: 10,
        }}
      >
        {!areas.length ? (
          <div style={{ color: COLORS.sub, fontSize: 13 }}>
            영역이 아직 없습니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {areas.map((a, idx) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 14,
                  border: `1px solid ${COLORS.lineSoft}`,
                  background: "rgba(255,255,255,0.70)",
                }}
              >
                <div style={{ fontWeight: 900 }}>
                  {a.name}{" "}
                  <span style={{ color: COLORS.sub, fontWeight: 700 }}>
                    ({a.max_score}점)
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginLeft: "auto",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={smallBtn}
                    disabled={idx === 0}
                    onClick={() => moveArea(a.id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    style={smallBtn}
                    disabled={idx === areas.length - 1}
                    onClick={() => moveArea(a.id, +1)}
                  >
                    ▼
                  </button>
                  <button
                    style={smallBtn}
                    onClick={() => {
                      const nn = prompt("영역명 수정", a.name || "");
                      if (!nn) return;
                      updateArea(a.id, { name: nn.trim() });
                    }}
                  >
                    이름수정
                  </button>
                  <button
                    style={smallBtn}
                    onClick={() => {
                      const mm = prompt("총점 수정", String(a.max_score ?? 0));
                      if (mm == null) return;
                      const n = safeNum(mm, NaN);
                      if (!Number.isFinite(n) || n < 0)
                        return alert("총점을 숫자로 입력해주세요.");
                      updateArea(a.id, { max_score: Math.floor(n) });
                    }}
                  >
                    총점수정
                  </button>
                  <button style={smallBtn} onClick={() => deleteArea(a.id, a.name)}>
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...sectionTitle, marginTop: 16 }}>
        3) 객관식 코멘트 — 수정/삭제/순서
      </div>
      <div style={row}>
        <select
          style={select}
          value={newCommentAreaId}
          onChange={(e) => setNewCommentAreaId(e.target.value)}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {!areas.length && <option value="">(먼저 영역을 추가하세요)</option>}
        </select>

        <input
          style={{ ...input, minWidth: 360 }}
          placeholder="코멘트 문장 추가"
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
        />
        <button style={btn} onClick={addCommentTemplate}>
          코멘트 추가
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        {areas.map((a) => {
          const list = templatesByArea[a.id] || [];
          return (
            <div
              key={a.id}
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${COLORS.lineSoft}`,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                {a.name}{" "}
                <span style={{ color: COLORS.sub, fontWeight: 700 }}>
                  ({list.length}개)
                </span>
              </div>

              {!list.length ? (
                <div style={{ color: COLORS.sub, fontSize: 13, marginTop: 8 }}>
                  코멘트 없음
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {list.map((t, idx) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        padding: "8px 10px",
                        borderRadius: 14,
                        border: `1px solid ${COLORS.lineSoft}`,
                        background: "rgba(255,255,255,0.65)",
                      }}
                    >
                      <div style={{ fontSize: 13, lineHeight: 1.35, flex: 1 }}>
                        {t.content}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          style={smallBtn}
                          disabled={idx === 0}
                          onClick={() => moveComment(a.id, t.id, -1)}
                        >
                          ▲
                        </button>
                        <button
                          style={smallBtn}
                          disabled={idx === list.length - 1}
                          onClick={() => moveComment(a.id, t.id, +1)}
                        >
                          ▼
                        </button>
                        <button
                          style={smallBtn}
                          onClick={() => editCommentTemplate(t.id, t.content)}
                        >
                          수정
                        </button>
                        <button
                          style={smallBtn}
                          onClick={() => deleteCommentTemplate(t.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 상담 기록 */}
      <div style={sectionTitle}>2) 상담 기록</div>
      <div style={row}>
        <input
          style={{ ...input, minWidth: 320 }}
          placeholder="검색: 학생/학교/학년/종류"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button style={btn} onClick={loadSessions}>
          새로고침
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>날짜</th>
              <th style={th}>학생</th>
              <th style={th}>종류</th>
              <th style={th}>총점</th>
              <th style={th}>PDF</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((s) => (
              <tr key={s.id}>
                <td style={td}>{dayjs(s.test_date).format("YYYY-MM-DD")}</td>
                <td style={td}>
                  <div style={{ fontWeight: 900 }}>{s.student_name}</div>
                  <div style={{ color: COLORS.sub, fontSize: 12 }}>
                    {(s.student_school || "-")} / {(s.student_grade || "-")}
                  </div>
                </td>
                <td style={td}>{s.test_type_name}</td>
                <td style={td}>
                  <span style={{ fontWeight: 900 }}>{s.total_score}</span>
                  <span style={{ color: COLORS.sub }}>
                    {" "}
                    / {s.total_max_score}
                  </span>
                </td>

                {/* ✅ PDF 다시받기 버튼 */}
                <td style={td}>
                  {s.pdf_path ? (
                    <button
                      style={{ ...btn, height: 34, padding: "0 10px" }}
                      onClick={() => openPdfFromPath(s.id, s.pdf_path)}
                      disabled={pdfOpeningId === s.id}
                      title="저장된 PDF를 다시 엽니다"
                    >
                      {pdfOpeningId === s.id ? "여는중…" : "PDF 다시받기"}
                    </button>
                  ) : (
                    <span style={{ color: COLORS.sub }}>-</span>
                  )}
                </td>

                <td style={td}>
                  <button
                    style={{ ...btn, height: 34, padding: "0 10px" }}
                    onClick={() => navigate(`/counseling/${s.id}`)}
                  >
                    열기
                  </button>
                </td>
              </tr>
            ))}
            {!filteredSessions.length && (
              <tr>
                <td style={td} colSpan={6}>
                  <div style={{ color: COLORS.sub }}>상담 기록이 없습니다.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 새 상담 모달 */}
      {openNew && (
        <div style={modalBg} onClick={() => setOpenNew(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={modalTitle}>새 상담 정보 입력</div>
              <button style={smallBtn} onClick={() => setOpenNew(false)}>
                닫기
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <div style={{ flex: "1 1 240px" }}>
                <div style={fieldLabel}>학생 이름 *</div>
                <input
                  style={{ ...input2, width: "100%" }}
                  value={newSession.student_name}
                  onChange={(e) =>
                    setNewSession((p) => ({ ...p, student_name: e.target.value }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 240px" }}>
                <div style={fieldLabel}>학교</div>
                <input
                  style={{ ...input2, width: "100%" }}
                  value={newSession.student_school}
                  onChange={(e) =>
                    setNewSession((p) => ({
                      ...p,
                      student_school: e.target.value,
                    }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <div style={fieldLabel}>학년</div>
                <input
                  style={{ ...input2, width: "100%" }}
                  value={newSession.student_grade}
                  onChange={(e) =>
                    setNewSession((p) => ({ ...p, student_grade: e.target.value }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <div style={fieldLabel}>담당 선생님 *</div>
                <input
                  style={{ ...input2, width: "100%" }}
                  value={newSession.teacher_name}
                  onChange={(e) =>
                    setNewSession((p) => ({ ...p, teacher_name: e.target.value }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <div style={fieldLabel}>테스트 날짜</div>
                <input
                  style={{ ...input2, width: "100%" }}
                  type="date"
                  value={newSession.test_date}
                  onChange={(e) =>
                    setNewSession((p) => ({ ...p, test_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                borderTop: `1px solid ${COLORS.lineSoft}`,
                paddingTop: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                일대일 수업 정보
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: "1 1 140px" }}>
                  <div style={fieldLabel}>요일</div>
                  <select
                    style={{ ...input2, width: "100%" }}
                    value={newSession.oto_weekday}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        oto_weekday: Number(e.target.value),
                      }))
                    }
                  >
                    <option value={1}>월</option>
                    <option value={2}>화</option>
                    <option value={3}>수</option>
                    <option value={4}>목</option>
                    <option value={5}>금</option>
                    <option value={6}>토</option>
                  </select>
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <div style={fieldLabel}>등원시간 (HH:MM)</div>
                  <input
                    style={{ ...input2, width: "100%" }}
                    type="time"
                    value={newSession.oto_arrival_time}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        oto_arrival_time: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <div style={fieldLabel}>수업시간 (HH:MM)</div>
                  <input
                    style={{ ...input2, width: "100%" }}
                    type="time"
                    value={newSession.oto_class_time}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        oto_class_time: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                borderTop: `1px solid ${COLORS.lineSoft}`,
                paddingTop: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                독해 수업 정보
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: "1 1 140px" }}>
                  <div style={fieldLabel}>요일</div>
                  <select
                    style={{ ...input2, width: "100%" }}
                    value={newSession.reading_weekday}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        reading_weekday: Number(e.target.value),
                      }))
                    }
                  >
                    <option value={1}>월</option>
                    <option value={2}>화</option>
                    <option value={3}>수</option>
                    <option value={4}>목</option>
                    <option value={5}>금</option>
                    <option value={6}>토</option>
                  </select>
                </div>
                <div style={{ flex: "1 1 220px" }}>
                  <div style={fieldLabel}>독해 선생님 성함</div>
                  <input
                    style={{ ...input2, width: "100%" }}
                    value={newSession.reading_teacher_name}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        reading_teacher_name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <div style={fieldLabel}>수업시간 (HH:MM)</div>
                  <input
                    style={{ ...input2, width: "100%" }}
                    type="time"
                    value={newSession.reading_class_time}
                    onChange={(e) =>
                      setNewSession((p) => ({
                        ...p,
                        reading_class_time: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button style={btnDanger} onClick={() => setOpenNew(false)}>
                취소
              </button>
              <button style={btn} onClick={createNewSession}>
                생성 후 입력으로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 14 }} />
    </div>
  );
}