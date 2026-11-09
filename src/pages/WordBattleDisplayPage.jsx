// src/pages/WordBattleDisplayPage.jsx
import { useEffect, useState } from "react";

const SLIDE_INTERVAL_MS = 5000;
const IMAGE_BASE = `${import.meta.env.BASE_URL}images/`;

const SLIDES = [
  {
    theme: "mock",
    category: "수능 영어 프로그램",
    title: "고2부터 수능 주까지",
    highlight: "매주 영어 모의고사",
    description:
      "고2부터 매주 모의고사에 응시할 수 있어요. 제한 시간 안에 문제를 풀며 수능 실전 감각을 쌓아갑니다.",
    image: "final-mock-exam-poster.jpg",
    imageAlt: "블라썸에듀 2025학년도 파이널 영어 모의고사 안내 대자보",
    caption: "2025학년도 파이널 모의고사 운영 사례",
  },
  {
    theme: "writing",
    category: "학교별 영어 내신 프로그램",
    title: "학교·학년별 기출을 분석해",
    highlight: "맞춤 서술형 변형 문제",
    description:
      "학교마다 어떤 유형이 나오고 지문이 어떻게 바뀌는지 살펴봐요. 그 경향을 반영해 만든 대비 문제를 제공합니다.",
    image: "school-writing-sample.png",
    imageAlt: "군포고 1학년 영어 기말 대비 낱말 배열형 서술형 문제",
    caption: "실제 제작 예시 · 군포고1 2학기 기말 대비",
  },
];

export default function WordBattleDisplayPage() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = SLIDES[activeSlide];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

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

  return (
    <main
      className={`academy-monitor academy-monitor--${slide.theme}`}
      onDoubleClick={toggleFullscreen}
    >
      <style>{`
        .academy-monitor {
          box-sizing: border-box;
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          align-items: center;
          gap: clamp(24px, 4vw, 80px);
          padding: clamp(24px, 4vw, 76px);
          background: var(--monitor-bg);
          color: #202c29;
          font-family: Pretendard, "Noto Sans KR", system-ui, sans-serif;
          text-align: left;
        }

        .academy-monitor--mock {
          --monitor-bg: #fff7e8;
          --monitor-accent: #93451c;
          --monitor-soft: #fae6ce;
        }

        .academy-monitor--writing {
          --monitor-bg: #eff8f2;
          --monitor-accent: #236247;
          --monitor-soft: #dceee2;
        }

        .academy-monitor .monitor-brand {
          margin: 0 0 clamp(18px, 3vw, 42px);
          font-size: clamp(16px, 1.45vw, 29px);
          font-weight: 800;
        }

        .academy-monitor .monitor-category {
          display: inline-block;
          margin-bottom: 16px;
          padding: 8px 16px;
          border-radius: 999px;
          background: var(--monitor-soft);
          color: var(--monitor-accent);
          font-size: clamp(15px, 1.4vw, 27px);
          font-weight: 800;
        }

        .academy-monitor .monitor-title {
          margin: 0;
          font-size: clamp(30px, 4.3vw, 88px);
          line-height: 1.16;
          letter-spacing: -0.06em;
          word-break: keep-all;
        }

        .academy-monitor .monitor-title strong {
          display: block;
          margin-top: 8px;
          color: var(--monitor-accent);
        }

        .academy-monitor .monitor-description {
          max-width: 28em;
          margin: 24px 0 0;
          color: #45534d;
          font-size: clamp(17px, 1.75vw, 34px);
          line-height: 1.55;
          word-break: keep-all;
        }

        .academy-monitor .monitor-counter {
          margin: 28px 0 0;
          color: var(--monitor-accent);
          font-size: clamp(14px, 1.15vw, 20px);
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        .academy-monitor .monitor-example {
          display: grid;
          justify-items: center;
          gap: 12px;
          min-width: 0;
          margin: 0;
        }

        .academy-monitor .monitor-example img {
          display: block;
          max-width: 100%;
          max-height: 72dvh;
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 8px 30px rgba(32, 44, 41, 0.12);
        }

        .academy-monitor .monitor-example figcaption {
          color: #45534d;
          font-size: clamp(14px, 1.15vw, 22px);
          font-weight: 700;
          text-align: center;
          word-break: keep-all;
        }

        .academy-monitor .monitor-fullscreen {
          position: fixed;
          right: 16px;
          bottom: 16px;
          min-width: 44px;
          min-height: 44px;
          border: 1px solid var(--monitor-accent);
          border-radius: 10px;
          background: #fff;
          color: var(--monitor-accent);
          font: inherit;
          font-size: 24px;
          cursor: pointer;
        }

        @media (max-width: 720px) {
          .academy-monitor {
            grid-template-columns: 1fr;
            gap: 24px;
            padding-bottom: 72px;
          }

          .academy-monitor .monitor-example img {
            max-height: 52dvh;
          }
        }
      `}</style>

      <section aria-labelledby="academy-monitor-title">
        <p className="monitor-brand">블라썸에듀 산본</p>
        <span className="monitor-category">{slide.category}</span>
        <h1 id="academy-monitor-title" className="monitor-title">
          {slide.title}
          <strong>{slide.highlight}</strong>
        </h1>
        <p className="monitor-description">{slide.description}</p>
        <p className="monitor-counter">
          {activeSlide + 1} / {SLIDES.length}
        </p>
      </section>

      <figure className="monitor-example">
        <img src={`${IMAGE_BASE}${slide.image}`} alt={slide.imageAlt} />
        <figcaption>{slide.caption}</figcaption>
      </figure>

      <button
        type="button"
        className="monitor-fullscreen"
        onClick={toggleFullscreen}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label="전체화면 전환"
        title="전체화면 전환"
      >
        ⛶
      </button>
    </main>
  );
}