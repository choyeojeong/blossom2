// src/pages/WordBattleDisplayPage.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "./WordBattle.css";

const FALLBACK_SETTINGS = {
  event_title: "중3 단어대전",
  event_subtitle: "단어를 쌓고, 팀의 기록을 높여라!",
  event_body:
    "2026. 9. 14. ~ 10. 31.\n매일의 통과가 우리 팀의 점수가 됩니다.",
  rules_title: "중3 단어대전 규칙",
  rules_body:
    "1. 단어시험에 통과한 범위의 단어만 인정됩니다.\n2. 학생별 통과 단어 수를 매일 누적합니다.\n3. 대전 종료일까지 가장 많은 단어를 쌓은 팀이 우승합니다.\n4. 정직하게, 끝까지, 함께 도전합니다!",
  intro_bg: "#173f8a",
  rules_bg: "#0f6b5d",
  accent_color: "#ffd34e",
  slide_seconds: 8,
  start_date: "2026-09-14",
  end_date: "2026-10-31",
};

export default function WordBattleDisplayPage() {
  const [settings, setSettings] = useState(
    FALLBACK_SETTINGS
  );

  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [slide, setSlide] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    refresh();

    const channel = supabase
      .channel("word-battle-display")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "word_battle_settings",
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "word_battle_teams",
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "word_battle_members",
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "word_battle_entries",
        },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const seconds = Math.max(
      3,
      Number(settings.slide_seconds) || 8
    );

    const timer = window.setInterval(() => {
      setSlide((currentSlide) => {
        return (currentSlide + 1) % 3;
      });
    }, seconds * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [settings.slide_seconds]);

  async function refresh() {
    const [
      settingsResult,
      teamsResult,
      membersResult,
      entriesResult,
    ] = await Promise.all([
      supabase
        .from("word_battle_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle(),

      supabase
        .from("word_battle_teams")
        .select("*")
        .order("sort_order"),

      supabase
        .from("word_battle_members")
        .select("id, team_id")
        .eq("is_active", true),

      supabase
        .from("word_battle_entries")
        .select("member_id, word_count"),
    ]);

    const results = [
      settingsResult,
      teamsResult,
      membersResult,
      entriesResult,
    ];

    const failedResult = results.find(
      (result) => result.error
    );

    if (failedResult) {
      setError(
        "단어대전 정보를 불러오지 못했습니다. 관리자에게 알려주세요."
      );
      return;
    }

    setError("");

    setSettings({
      ...FALLBACK_SETTINGS,
      ...(settingsResult.data || {}),
    });

    setTeams(teamsResult.data || []);
    setMembers(membersResult.data || []);
    setEntries(entriesResult.data || []);
  }

  const teamTotals = useMemo(() => {
    const memberTotals = {};
    const nextTeamTotals = {};

    entries.forEach((entry) => {
      memberTotals[entry.member_id] =
        (memberTotals[entry.member_id] || 0) +
        Number(entry.word_count || 0);
    });

    members.forEach((member) => {
      nextTeamTotals[member.team_id] =
        (nextTeamTotals[member.team_id] || 0) +
        (memberTotals[member.id] || 0);
    });

    return nextTeamTotals;
  }, [entries, members]);

  const maximumTotal = Math.max(
    1,
    ...teams.map(
      (team) => teamTotals[team.id] || 0
    )
  );

  const leaderIds = teams
    .filter((team) => {
      const total = teamTotals[team.id] || 0;

      return (
        total === maximumTotal &&
        maximumTotal > 0
      );
    })
    .map((team) => team.id);

  async function toggleFullScreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // 브라우저가 전체화면을 허용하지 않은 경우
    }
  }

  return (
    <main
      className="wb-display"
      style={{
        "--accent": settings.accent_color,
      }}
      onDoubleClick={toggleFullScreen}
    >
      {error && (
        <div className="wb-display-error">
          {error}
        </div>
      )}

      {/* 첫 번째 화면: 안내 */}
      <section
        className={`wb-slide wb-intro ${
          slide === 0 ? "shown" : ""
        }`}
        style={{
          background: settings.intro_bg,
        }}
      >
        <div className="wb-orb one" />
        <div className="wb-orb two" />

        <div className="wb-slide-inner">
          <span className="wb-display-brand">
            SANBON BLOSSOM EDU
          </span>

          <h1>{settings.event_title}</h1>

          <h2>{settings.event_subtitle}</h2>

          <p>{settings.event_body}</p>
        </div>
      </section>

      {/* 두 번째 화면: 규칙 */}
      <section
        className={`wb-slide wb-rules ${
          slide === 1 ? "shown" : ""
        }`}
        style={{
          background: settings.rules_bg,
        }}
      >
        <div className="wb-slide-inner">
          <span className="wb-display-brand">
            WORD BATTLE · 2026
          </span>

          <h1>{settings.rules_title}</h1>

          <div className="wb-rules-text">
            {settings.rules_body}
          </div>
        </div>
      </section>

      {/* 세 번째 화면: 막대그래프 */}
      <section
        className={`wb-slide wb-chart-slide ${
          slide === 2 ? "shown" : ""
        }`}
      >
        <div className="wb-chart-head">
          <div>
            <span className="wb-display-brand dark">
              LIVE SCORE
            </span>

            <h1>팀별 누적 단어 현황</h1>
          </div>

          <p>
            {settings.start_date} —{" "}
            {settings.end_date}
          </p>
        </div>

        <div className="wb-bars">
          {teams.map((team, index) => {
            const total =
              teamTotals[team.id] || 0;

            const width =
              total > 0
                ? Math.max(
                    8,
                    (total / maximumTotal) * 100
                  )
                : 0;

            return (
              <div
                className="wb-bar-row"
                key={team.id}
              >
                <div className="wb-rank">
                  {leaderIds.includes(team.id)
                    ? "👑"
                    : index + 1}
                </div>

                <div className="wb-team-name">
                  {team.name}
                </div>

                <div className="wb-track">
                  <div
                    className="wb-fill"
                    style={{
                      width: `${width}%`,
                      background: team.color,
                    }}
                  >
                    <span>
                      {total.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="wb-unit">
                  단어
                </div>
              </div>
            );
          })}
        </div>

        <div className="wb-chart-footer">
          매일의 통과가 우리 팀의 기록이 됩니다.
        </div>
      </section>

      <button
        type="button"
        className="wb-fullscreen"
        onClick={toggleFullScreen}
        aria-label="전체화면 전환"
        title="전체화면"
      >
        ⛶
      </button>

      <div className="wb-dots">
        {[0, 1, 2].map((slideNumber) => (
          <button
            type="button"
            key={slideNumber}
            className={
              slide === slideNumber
                ? "active"
                : ""
            }
            onClick={() =>
              setSlide(slideNumber)
            }
            aria-label={`${
              slideNumber + 1
            }번 화면`}
          />
        ))}
      </div>
    </main>
  );
}