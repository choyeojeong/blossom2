const POSTER = `${import.meta.env.BASE_URL}images/final-mock-exam-poster.jpg`;

export default function WordBattleDisplayPage() {
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
    <main className="mock-exam-display" onDoubleClick={toggleFullscreen}>
      <style>{`
        .mock-exam-display {
          box-sizing: border-box;
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.55fr);
          align-items: center;
          gap: clamp(24px, 5vw, 96px);
          padding: clamp(28px, 5vw, 96px);
          background: #142a22;
          color: #fff8eb;
          font-family: Pretendard, "Noto Sans KR", sans-serif;
          text-align: left;
        }

        .mock-exam-display .mock-exam-brand {
          margin: 0 0 32px;
          color: #f4d396;
          font-size: clamp(17px, 1.7vw, 32px);
          font-weight: 700;
        }

        .mock-exam-display h1 {
          margin: 0;
          color: inherit;
          font-size: clamp(36px, 5.2vw, 104px);
          line-height: 1.18;
          letter-spacing: -0.055em;
          word-break: keep-all;
        }

        .mock-exam-display h1 strong {
          display: block;
          margin-top: 8px;
          color: #f4d396;
        }

        .mock-exam-display .mock-exam-description {
          margin: 28px 0 0;
          color: #e4ece5;
          font-size: clamp(18px, 2vw, 36px);
          line-height: 1.5;
          word-break: keep-all;
        }

        .mock-exam-display figure {
          display: grid;
          justify-items: center;
          gap: 14px;
          margin: 0;
        }

        .mock-exam-display img {
          display: block;
          max-width: 100%;
          max-height: 73dvh;
          width: auto;
          height: auto;
          border-radius: 12px;
        }

        .mock-exam-display figcaption {
          color: #e4ece5;
          font-size: clamp(14px, 1.2vw, 22px);
          text-align: center;
        }

        .mock-exam-display .mock-exam-fullscreen {
          position: fixed;
          right: 16px;
          bottom: 16px;
          min-width: 44px;
          min-height: 44px;
          border: 1px solid #e4ece5;
          border-radius: 10px;
          background: #142a22;
          color: #fff8eb;
          font-size: 24px;
          cursor: pointer;
        }

        @media (max-width: 720px) {
          .mock-exam-display {
            grid-template-columns: 1fr;
            padding-bottom: 72px;
          }

          .mock-exam-display img {
            max-height: 60dvh;
          }
        }
      `}</style>

      <section aria-labelledby="mock-exam-title">
        <p className="mock-exam-brand">블라썸에듀 산본 · 수능 영어 프로그램</p>
        <h1 id="mock-exam-title">
          고2부터 수능 주까지
          <strong>매주 영어 모의고사</strong>
        </h1>
        <p className="mock-exam-description">
          고2부터 매주 모의고사에 응시할 수 있어요.
          <br />
          시간 안에 문제를 풀며 수능 실전 감각을 쌓아갑니다.
        </p>
      </section>

      <figure>
        <img src={POSTER} alt="블라썸에듀 2025학년도 파이널 영어 모의고사 안내 대자보" />
        <figcaption>2025학년도 파이널 모의고사 운영 사례</figcaption>
      </figure>

      <button
        type="button"
        className="mock-exam-fullscreen"
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