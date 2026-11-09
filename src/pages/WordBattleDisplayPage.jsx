// src/pages/WordBattleDisplayPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";

const MONITOR_TABLE = "academy_monitor_content";

const STORAGE_KEY = "blossom-academy-monitor-slides-v1";
const SLIDE_INTERVAL_MS = 10000;
const IMAGE_BASE = `${import.meta.env.BASE_URL}images/`;

const DEFAULT_SLIDES = [
  {
    id: "mock-exam",
    category: "수능 영어 프로그램",
    title: "고2부터 수능 주까지",
    highlight: "매주 영어 모의고사",
    description:
      "고2부터 수능 주까지 매주 응시할 수 있습니다. 제한 시간 안에 문제를 풀며 수능 영어 실전 감각을 기릅니다.",
    background: "#fff7e8",
    image: `${IMAGE_BASE}final-mock-exam-poster.jpg`,
  },
  {
    id: "school-writing",
    category: "학교별 영어 내신 프로그램",
    title: "학교·학년별 기출 경향을 반영한",
    highlight: "맞춤 서술형 변형 문제",
    description:
      "학교·학년별 영어 기출문항의 출제 유형, 지문 변형 방식, 답안 작성 조건을 분석해 해당 학교 시험에 맞춘 서술형 대비 문항을 제작·제공합니다.",
    background: "#eff8f2",
    image: `${IMAGE_BASE}school-writing-sample.png`,
  },
];

function loadSlides() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {
    // Fall back to the initial slides if browser storage is unavailable.
  }
  return DEFAULT_SLIDES;
}

async function prepareImage(file) {
  const source = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = source;
    await image.decode();

    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function SlideEditor({ slides, initialIndex, onSave, onCancel }) {
  const [draft, setDraft] = useState(slides);
  const [index, setIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slide = draft[index];

  function updateSlide(id, fields) {
    setDraft((current) =>
      current.map((item) => (item.id === id ? { ...item, ...fields } : item))
    );
  }

  function addSlide() {
    setDraft([
      ...draft,
      {
        id: crypto.randomUUID(),
        category: "",
        title: "",
        highlight: "",
        description: "",
        background: "#f3f7ff",
        image: "",
      },
    ]);
    setIndex(draft.length);
  }

  function deleteSlide() {
    const next = draft.filter((item) => item.id !== slide.id);
    setDraft(next);
    setIndex(Math.min(index, next.length - 1));
  }

  async function changeImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setBusy(true);

    try {
      const image = await prepareImage(file);
      updateSlide(slide.id, { image });
    } catch {
      setError("사진을 열 수 없습니다. JPG, PNG 또는 WebP 파일을 선택해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;

    const missingTitle = draft.findIndex(
      (item) => !item.title.trim() && !item.highlight.trim()
    );
    if (missingTitle >= 0) {
      setIndex(missingTitle);
      setError(`${missingTitle + 1}번 화면의 제목 또는 강조 문구를 입력해 주세요.`);
      return;
    }

    setError("");
    setBusy(true);
    try {
      await onSave(draft, index);
    } catch (error) {
      setError(error.message || "공용 화면을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="monitor-editor-overlay">
      <form
        className="monitor-editor"
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitor-editor-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
        }}
      >
        <h2 id="monitor-editor-title">학원 모니터 편집</h2>
        <p>화면을 선택해 수정한 뒤 저장해 주세요. 저장한 변경 사항은 모든 학원 모니터에 적용됩니다.</p>

        <fieldset disabled={busy}>
          <label>
            편집할 화면
            <select
              autoFocus
              value={index}
              onChange={(event) => {
                setIndex(Number(event.target.value));
                setError("");
              }}
            >
              {draft.map((item, number) => (
                <option key={item.id} value={number}>
                  {number + 1}. {item.highlight || item.title || "새 안내 화면"}
                </option>
              ))}
            </select>
          </label>

          <div className="monitor-editor-actions">
            <button type="button" onClick={addSlide}>화면 추가</button>
            <button type="button" onClick={deleteSlide} disabled={draft.length === 1}>
              선택한 화면 삭제
            </button>
          </div>

          <label>
            분류 문구
            <input
              value={slide.category}
              onChange={(event) => updateSlide(slide.id, { category: event.target.value })}
            />
          </label>
          <label>
            제목
            <input
              value={slide.title}
              onChange={(event) => updateSlide(slide.id, { title: event.target.value })}
            />
          </label>
          <label>
            강조 문구
            <input
              value={slide.highlight}
              onChange={(event) => updateSlide(slide.id, { highlight: event.target.value })}
            />
          </label>
          <label>
            본문
            <textarea
              rows={4}
              value={slide.description}
              onChange={(event) => updateSlide(slide.id, { description: event.target.value })}
            />
          </label>
          <label>
            배경색
            <input
              type="color"
              value={slide.background}
              onChange={(event) => updateSlide(slide.id, { background: event.target.value })}
            />
          </label>
          <label>
            사진 바꾸기
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={changeImage} />
          </label>

          {slide.image && (
            <div className="monitor-editor-actions">
              <img className="monitor-thumbnail" src={slide.image} alt="선택한 사진 미리보기" />
              <button type="button" onClick={() => updateSlide(slide.id, { image: "" })}>
                사진 제거
              </button>
            </div>
          )}
        </fieldset>

        {busy && <p role="status">처리 중입니다.</p>}
        {error && <p role="alert" className="monitor-error">{error}</p>}

        <div className="monitor-editor-actions">
          <button type="button" onClick={onCancel} disabled={busy}>취소</button>
          <button type="submit" disabled={busy}>저장</button>
        </div>
      </form>
    </div>
  );
}

export default function WordBattleDisplayPage() {
  const [slides, setSlides] = useState(DEFAULT_SLIDES);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [browserCopy] = useState(() => {
    const saved = loadSlides();
    return saved === DEFAULT_SLIDES ? null : saved;
  });
  const [importing, setImporting] = useState(false);
  const [revision, setRevision] = useState(null);
  const [syncError, setSyncError] = useState("");

  const slide = slides[activeIndex] ?? slides[0];

  useEffect(() => {
    if (editing) return;

    let stopped = false;
    let timer;

    async function refresh() {
      try {
        const { data: version, error: versionError } = await supabase
          .from(MONITOR_TABLE).select("revision").eq("id", 1).single();

        if (versionError) throw versionError;
        if (stopped) return;

        if (version.revision !== revision) {
          const { data, error } = await supabase
            .from(MONITOR_TABLE).select("slides, revision").eq("id", 1).single();

          if (error) throw error;
          if (stopped) return;

          const nextSlides = data.slides ?? DEFAULT_SLIDES;
          setSlides(nextSlides);
          setActiveIndex((current) => Math.min(current, nextSlides.length - 1));
          setRevision(data.revision);
        }

        setSyncError("");
      } catch {
        if (!stopped) {
          setSyncError("공용 화면에 연결하지 못했습니다. 잠시 후 다시 확인합니다.");
        }
      } finally {
        if (!stopped) timer = window.setTimeout(refresh, 15000);
      }
    }

    refresh();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [editing, revision]);

  useEffect(() => {
    if (editing || slides.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [editing, slides.length]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn("전체화면 전환에 실패했습니다.", error);
    }
  }

  async function saveSlides(nextSlides, nextIndex) {
    const nextRevision = crypto.randomUUID();
    const { data, error } = await supabase
      .from(MONITOR_TABLE)
      .update({ slides: nextSlides, revision: nextRevision })
      .eq("id", 1)
      .eq("revision", revision)
      .select("revision")
      .maybeSingle();

    if (error) throw new Error(`공용 화면을 저장하지 못했습니다. ${error.message}`);
    if (!data) {
      throw new Error(
        "저장 권한이 없거나 다른 컴퓨터에서 먼저 저장했습니다. " +
        "편집 내용을 따로 보관한 뒤 다시 로그인하거나 최신 화면을 확인해 주세요."
      );
    }

    setRevision(data.revision);
    setImporting(false);
    setSlides(nextSlides);
    setActiveIndex(nextIndex);
    setEditing(false);
  }

  return (
    <main
      className="academy-monitor"
      style={{ backgroundColor: slide.background }}
    >
      <style>{`
        .academy-monitor {
          box-sizing: border-box;
          min-height: 100vh;
          min-height: 100dvh;
          padding: clamp(24px, 4vw, 76px);
          padding-bottom: max(76px, 4vw);
          display: grid;
          align-content: center;
          color: #202c29;
          font-family: Pretendard, "Noto Sans KR", system-ui, sans-serif;
          text-align: left;
        }

        .academy-monitor .monitor-content {
          display: grid;
          align-items: center;
          gap: clamp(24px, 4vw, 80px);
          padding: clamp(20px, 3vw, 54px);
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.9);
        }

        .academy-monitor .monitor-content.has-image {
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
        }

        .academy-monitor .monitor-brand {
          margin: 0 0 clamp(16px, 2vw, 34px);
          font-size: clamp(16px, 1.45vw, 28px);
          font-weight: 800;
        }

        .academy-monitor .monitor-category {
          display: inline-block;
          margin-bottom: 14px;
          padding: 7px 14px;
          border-radius: 999px;
          background: #e9f1eb;
          color: #265b43;
          font-size: clamp(14px, 1.3vw, 24px);
          font-weight: 800;
        }

        .academy-monitor .monitor-title {
          margin: 0;
          font-size: clamp(30px, 4.1vw, 84px);
          line-height: 1.16;
          letter-spacing: -0.055em;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }

        .academy-monitor .monitor-title strong {
          display: block;
          color: #265b43;
        }

        .academy-monitor .monitor-description {
          max-width: 29em;
          margin: 20px 0 0;
          color: #45534d;
          font-size: clamp(17px, 1.65vw, 32px);
          line-height: 1.55;
          word-break: keep-all;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .academy-monitor .monitor-image {
          display: block;
          justify-self: center;
          max-width: 100%;
          max-height: 68dvh;
          border-radius: 12px;
          box-shadow: 0 8px 26px rgba(32, 44, 41, 0.14);
        }

        .academy-monitor .monitor-toolbar {
          position: fixed;
          right: 16px;
          bottom: 16px;
          display: flex;
          gap: 8px;
        }

        .academy-monitor button {
          padding: 9px 14px;
          border: 1px solid #c5d3ca;
          border-radius: 9px;
          background: #fff;
          color: #265b43;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }

        .academy-monitor button:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .academy-monitor .monitor-editor-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(32, 44, 41, 0.28);
        }

        .academy-monitor .monitor-editor {
          box-sizing: border-box;
          width: min(100%, 620px);
          max-height: calc(100dvh - 32px);
          overflow: auto;
          padding: clamp(16px, 4vw, 28px);
          border-radius: 16px;
          background: #fff;
        }

        .academy-monitor .monitor-editor h2 {
          margin: 0;
        }

        .academy-monitor .monitor-editor fieldset {
          display: grid;
          gap: 12px;
          min-width: 0;
          margin: 0;
          padding: 0;
          border: 0;
        }

        .academy-monitor .monitor-editor label {
          display: grid;
          gap: 5px;
          font-weight: 700;
        }

        .academy-monitor .monitor-editor input,
        .academy-monitor .monitor-editor select,
        .academy-monitor .monitor-editor textarea {
          box-sizing: border-box;
          max-width: 100%;
          padding: 7px;
          border: 1px solid #c5d3ca;
          border-radius: 7px;
          font: inherit;
          font-weight: 400;
        }

        .academy-monitor .monitor-editor input[type="color"] {
          width: 64px;
          height: 40px;
          padding: 3px;
          cursor: pointer;
        }

        .academy-monitor .monitor-editor-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }

        .academy-monitor .monitor-thumbnail {
          max-width: 100px;
          max-height: 100px;
          object-fit: contain;
        }

        .academy-monitor .monitor-error {
          color: #a22626;
        }

        @media (max-width: 720px) {
          .academy-monitor .monitor-content.has-image {
            grid-template-columns: 1fr;
          }

          .academy-monitor .monitor-image {
            max-height: 48dvh;
          }
        }
      `}</style>

      <div
        className={`monitor-content${slide.image ? " has-image" : ""}`}
        onDoubleClick={toggleFullscreen}
      >
        <section aria-labelledby="academy-monitor-title">
          <p className="monitor-brand">블라썸에듀 산본</p>
          {slide.category && <span className="monitor-category">{slide.category}</span>}
          <h1 id="academy-monitor-title" className="monitor-title">
            {slide.title}
            {slide.highlight && <strong>{slide.highlight}</strong>}
          </h1>
          {slide.description && <p className="monitor-description">{slide.description}</p>}
        </section>

        {slide.image && (
          <img
            className="monitor-image"
            src={slide.image}
            alt={`${slide.highlight || slide.title} 관련 이미지`}
          />
        )}
      </div>

      <div className="monitor-toolbar">
        {syncError && <span role="status">{syncError}</span>}
        <button
          type="button"
          disabled={!revision || Boolean(syncError)}
          onClick={() => {
            setImporting(false);
            setEditing(true);
          }}
        >
          화면 편집
        </button>
        {browserCopy && (
          <button
            type="button"
            disabled={!revision || Boolean(syncError)}
            onClick={() => {
              if (!window.confirm(
                "이 브라우저의 편집본을 불러옵니다. 저장하면 공용 화면이 이 편집본으로 교체됩니다."
              )) return;

              setImporting(true);
              setEditing(true);
            }}
          >
            이 브라우저의 화면 가져오기
          </button>
        )}
        <button type="button" onClick={toggleFullscreen}>전체화면</button>
      </div>

      {editing && (
        <SlideEditor
          slides={importing ? browserCopy : slides}
          initialIndex={importing ? 0 : activeIndex}
          onSave={saveSlides}
          onCancel={() => setEditing(false)}
        />
      )}
    </main>
  );
}
