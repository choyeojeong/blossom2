// src/pages/ContactFormsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { useNavigate } from "react-router-dom";

const COLORS = {
  bgTop: "#eef4ff",
  bgBottom: "#f7f9fc",
  text: "#1f2a44",
  sub: "#5d6b82",
  line: "#d9e3f7",
  white: "#ffffff",
  blue: "#4c8dff",
  blueSoft: "#eaf2ff",
  red: "#e04444",
  redSoft: "#ffecec",

  // 연초록(섹션 헤더용)
  green: "#16a34a",
  greenSoft: "#eaffef",
  greenLine: "#bfe8cc",
};

function clampInt(v, { min = 1, max = 9999 } = {}) {
  const n = Number(String(v).replace(/[^\d-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

export default function ContactFormsPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // 추가/수정 폼
  const [editingId, setEditingId] = useState(null); // null이면 새로 추가
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sortOrder, setSortOrder] = useState(""); // 숫자 입력 (문자열로 관리)

  // 펼치기(아코디언) 상태
  const [openId, setOpenId] = useState(null);

  // 복사 완료 표시(토스트)
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimerRef = useRef(null);

  const isEditing = useMemo(() => editingId !== null, [editingId]);

  const maxOrder = useMemo(() => {
    return rows.reduce((m, r) => {
      const v = typeof r.sort_order === "number" ? r.sort_order : 0;
      return Math.max(m, v);
    }, 0);
  }, [rows]);

  useEffect(() => {
    load();
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("contact_templates")
        .select("id, title, body, created_at, updated_at, sort_order")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const list = data || [];
      setRows(list);

      // sort_order가 비어있는 데이터가 섞여있으면, 화면 기준으로 1..N을 채워서 저장(1회)
      const hasNull = list.some((r) => r.sort_order === null || r.sort_order === undefined);
      if (hasNull && list.length) {
        const normalized = list.map((r, idx) => ({ id: r.id, sort_order: idx + 1 }));
        await supabase.from("contact_templates").upsert(normalized, { onConflict: "id" });

        const { data: data2 } = await supabase
          .from("contact_templates")
          .select("id, title, body, created_at, updated_at, sort_order")
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("updated_at", { ascending: false });

        setRows(data2 || []);
      }
    } catch (e) {
      setErr(e?.message || "불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setSortOrder(String((maxOrder || 0) + 1)); // 새로추가 기본값
  }

  // rows가 로드된 직후, 추가 폼 기본 sort_order 자동 세팅
  useEffect(() => {
    if (!editingId) {
      setSortOrder((prev) => (prev ? prev : String((maxOrder || 0) + 1)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxOrder]);

  function startEdit(row) {
    setEditingId(row.id);
    setTitle(row.title || "");
    setBody(row.body || "");
    setSortOrder(
      row.sort_order === null || row.sort_order === undefined ? "" : String(row.sort_order)
    );

    // 목록이 상단이므로, 수정 시 폼(아래)로 내려가게
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }, 0);
  }

  async function saveTemplate() {
    const t = (title || "").trim();
    const b = (body || "").trim();
    const so = clampInt(sortOrder, { min: 1, max: 9999 });

    if (!t) {
      setErr("제목을 입력해 주세요.");
      return;
    }
    if (!b) {
      setErr("예시 양식을 입력해 주세요.");
      return;
    }
    if (so === null) {
      setErr("순서를 숫자로 입력해 주세요. (예: 1, 2, 3)");
      return;
    }

    try {
      setErr("");

      if (editingId) {
        const { error } = await supabase
          .from("contact_templates")
          .update({ title: t, body: b, sort_order: so })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contact_templates").insert([
          { title: t, body: b, sort_order: so },
        ]);
        if (error) throw error;
      }

      await load();
      setEditingId(null);
      setTitle("");
      setBody("");
      setSortOrder("");
    } catch (e) {
      setErr(e?.message || "저장에 실패했습니다.");
    }
  }

  async function removeTemplate(id) {
    if (!window.confirm("이 양식을 삭제할까요?")) return;
    try {
      setErr("");
      const { error } = await supabase.from("contact_templates").delete().eq("id", id);
      if (error) throw error;

      await load();
      if (editingId === id) {
        setEditingId(null);
        setTitle("");
        setBody("");
        setSortOrder("");
      }
      if (openId === id) setOpenId(null);
    } catch (e) {
      setErr(e?.message || "삭제에 실패했습니다.");
    }
  }

  async function copyTemplate(row) {
    try {
      await navigator.clipboard.writeText(row.body || "");
      setCopiedId(row.id);

      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedId(null), 1200);
    } catch (e) {
      setErr("복사에 실패했습니다. (브라우저 권한/HTTPS 여부 확인)");
    }
  }

  function toggleOpen(id) {
    setOpenId((cur) => (cur === id ? null : id));
  }

  const copiedRowTitle = useMemo(() => {
    if (!copiedId) return "";
    const r = rows.find((x) => x.id === copiedId);
    return r?.title || "";
  }, [copiedId, rows]);

  return (
    <div style={styles.page}>
      {/* 좌상단 뒤로가기 */}
      <button type="button" onClick={() => nav(-1)} style={styles.backBtn}>
        ←
      </button>

      {/* 복사 토스트: 접혀 있어도 무조건 보이게 */}
      {copiedId && (
        <div style={styles.toast} role="status" aria-live="polite">
          <div style={styles.toastTitle}>복사 완료!</div>
          <div style={styles.toastSub}>{copiedRowTitle ? `"${copiedRowTitle}"` : ""}</div>
        </div>
      )}

      <div style={styles.wrap}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>학부모 연락 예시 양식</h1>
            {/* ✅ 안내문구 추가 */}
            <div style={styles.helperNote}>[ ] 부분을 수정하여 사용하세요</div>
          </div>

          <div style={styles.headerBtns}>
            <button type="button" onClick={load} style={styles.ghostBtn}>
              새로고침
            </button>
          </div>
        </div>

        {/* 목록(상단) */}
        <div style={styles.section}>
          <div style={styles.sectionHeaderGreen}>
            <div>
              <div style={styles.sectionEyebrow}>TEMPLATES</div>
              <div style={styles.sectionHeaderTitle}>저장된 양식</div>
            </div>
            <div style={styles.sectionHeaderRight}>
              <div style={styles.countPill}>{loading ? "불러오는 중…" : `${rows.length}개`}</div>
            </div>
          </div>

          <div style={styles.list}>
            {loading ? (
              <div style={styles.empty}>불러오는 중…</div>
            ) : rows.length === 0 ? (
              <div style={styles.empty}>아직 저장된 양식이 없습니다. 아래에서 등록해 주세요.</div>
            ) : (
              rows.map((r) => {
                const isOpen = openId === r.id;

                return (
                  <div key={r.id} style={styles.item}>
                    <div style={styles.itemRow}>
                      <div style={styles.itemOrder} title="정렬 순서">
                        #{typeof r.sort_order === "number" ? r.sort_order : "-"}
                      </div>

                      <div style={styles.itemTitle} title={r.title}>
                        {r.title}
                      </div>

                      <div style={styles.itemRowBtns}>
                        <button type="button" onClick={() => startEdit(r)} style={styles.ghostBtn}>
                          수정
                        </button>

                        <button
                          type="button"
                          onClick={() => removeTemplate(r.id)}
                          style={styles.deleteBtn}
                        >
                          삭제
                        </button>

                        <button type="button" onClick={() => copyTemplate(r)} style={styles.copyBtn}>
                          복사하기
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleOpen(r.id)}
                          style={styles.iconBtn}
                          aria-label={isOpen ? "접기" : "펼치기"}
                          title={isOpen ? "접기" : "펼치기"}
                        >
                          {isOpen ? "▴" : "▾"}
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={styles.itemOpenArea}>
                        <textarea readOnly value={r.body || ""} rows={6} style={styles.itemBody} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 추가/수정 영역(하단) */}
        <div style={styles.section}>
          <div style={styles.sectionHeaderGreen}>
            <div>
              <div style={styles.sectionEyebrow}>{isEditing ? "EDIT" : "NEW"}</div>
              <div style={styles.sectionHeaderTitle}>{isEditing ? "양식 수정" : "양식 추가"}</div>
            </div>

            <div style={styles.sectionHeaderRight}>
              {isEditing && (
                <button type="button" onClick={resetForm} style={styles.ghostBtn}>
                  취소
                </button>
              )}
            </div>
          </div>

          <div style={styles.form}>
            {/* 순서 입력 */}
            <div style={styles.field}>
              <div style={styles.label}>순서</div>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                inputMode="numeric"
                placeholder={`예) 1 (현재 추천: ${(maxOrder || 0) + 1})`}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>제목</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) 결석 안내 / 보강 안내 / 상담 요청"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>예시 양식</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                style={styles.textarea}
              />
            </div>

            {err && <div style={styles.error}>{err}</div>}

            <div style={styles.formBtns}>
              <button type="button" onClick={saveTemplate} style={styles.primaryBtn}>
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${COLORS.bgTop} 0%, ${COLORS.bgBottom} 100%)`,
    color: COLORS.text,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR"',
    position: "relative",
  },

  backBtn: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top, 0px) + 12px)",
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    fontWeight: 900,
    cursor: "pointer",
    zIndex: 10,
  },

  toast: {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    top: "calc(env(safe-area-inset-top, 0px) + 12px)",
    zIndex: 9999,
    background: COLORS.white,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 999,
    padding: "10px 14px",
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    maxWidth: "min(92vw, 700px)",
  },
  toastTitle: { fontWeight: 900, color: COLORS.blue, whiteSpace: "nowrap" },
  toastSub: {
    fontSize: 12,
    color: COLORS.sub,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  wrap: {
    width: "min(1100px, 96vw)",
    margin: "0 auto",
    padding: "24px 14px 60px",
  },

  headerRow: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  h1: { margin: 0, fontSize: 26, letterSpacing: -0.2 },

  // ✅ 제목 아래 안내문구(작게)
  helperNote: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.sub,
    fontWeight: 700,
  },

  headerBtns: { display: "flex", gap: 10 },

  section: {
    marginTop: 18,
    borderTop: `1px solid ${COLORS.line}`,
    paddingTop: 16,
  },

  sectionHeaderGreen: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${COLORS.greenLine}`,
    background: COLORS.greenSoft,
    marginBottom: 12,
  },

  sectionEyebrow: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: COLORS.green,
    fontWeight: 900,
  },

  sectionHeaderTitle: { fontSize: 18, fontWeight: 950, marginTop: 2 },
  sectionHeaderRight: { display: "flex", alignItems: "center", gap: 10 },

  countPill: {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
    border: `1px solid ${COLORS.greenLine}`,
    background: "#ffffff",
    color: COLORS.green,
    display: "flex",
    alignItems: "center",
    fontWeight: 900,
    fontSize: 12,
  },

  form: { display: "grid", gap: 10 },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, color: COLORS.sub },

  input: {
    width: "100%",
    height: 42,
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
    background: COLORS.white,
  },

  textarea: {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    padding: 12,
    outline: "none",
    fontSize: 14,
    lineHeight: 1.5,
    resize: "vertical",
    background: COLORS.white,
  },

  error: {
    padding: "10px 12px",
    borderRadius: 12,
    background: COLORS.redSoft,
    color: COLORS.red,
    fontSize: 13,
  },

  formBtns: { display: "flex", gap: 10, justifyContent: "flex-start" },

  primaryBtn: {
    height: 42,
    padding: "0 16px",
    borderRadius: 12,
    border: `1px solid ${COLORS.blue}`,
    background: COLORS.blue,
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  ghostBtn: {
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    cursor: "pointer",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  list: { display: "grid", gap: 14 },
  empty: { padding: "10px 0", color: COLORS.sub, fontSize: 13 },

  item: {
    borderTop: `1px solid ${COLORS.line}`,
    paddingTop: 14,
  },

  itemRow: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: 10,
    alignItems: "center",
  },

  itemOrder: {
    minWidth: 54,
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 12,
    color: COLORS.sub,
  },

  itemTitle: {
    fontSize: 15,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },

  itemRowBtns: {
    display: "flex",
    gap: 10,
    flexWrap: "nowrap",
    alignItems: "center",
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${COLORS.line}`,
    background: COLORS.white,
    cursor: "pointer",
    fontWeight: 900,
    lineHeight: "36px",
    textAlign: "center",
    padding: 0,
  },

  itemOpenArea: { marginTop: 10 },

  itemBody: {
    width: "100%",
    borderRadius: 12,
    border: `1px solid ${COLORS.line}`,
    padding: 12,
    fontSize: 13,
    lineHeight: 1.5,
    background: COLORS.white,
    resize: "vertical",
  },

  copyBtn: {
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${COLORS.blue}`,
    background: COLORS.blueSoft,
    color: COLORS.blue,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  deleteBtn: {
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    border: `1px solid ${COLORS.red}`,
    background: COLORS.redSoft,
    color: COLORS.red,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
