import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "./WordBattle.css";

const POSTER = `${import.meta.env.BASE_URL}images/word-battle-result.png`;
const format = (value) => value.toLocaleString("ko-KR");

// Read in pages so results are not truncated by Supabase's row limit.
async function readRows(table, columns, configure, orderColumns) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    let query = configure(supabase.from(table).select(columns));
    for (const column of orderColumns) query = query.order(column);
    const { data, error } = await query.range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}

export default function WordBattleDisplayPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let version = 0;
    async function refresh() {
      const request = ++version;
      try {
        const [settingsResult, teams, members, entries] = await Promise.all([
          supabase.from("word_battle_settings").select("*").eq("id", 1).maybeSingle(),
          readRows("word_battle_teams", "id, name, color, sort_order", (q) => q, ["sort_order", "id"]),
          readRows("word_battle_members", "id, team_id", (q) => q.eq("is_active", true), ["id"]),
          readRows("word_battle_entries", "member_id, word_count, entry_date", (q) => q, ["member_id", "entry_date"]),
        ]);
        if (settingsResult.error) throw settingsResult.error;
        if (!alive || request !== version) return;
        setSnapshot({ settings: settingsResult.data || {}, teams, members, entries });
        setError("");
      } catch {
        if (alive && request === version) {
          setError("최종 기록을 불러오지 못했습니다. 연결을 확인해 주세요. 잠시 후 자동으로 다시 시도합니다.");
        }
      }
    }
    refresh();
    const channel = supabase.channel("word-battle-final-display")
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_settings" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_teams" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_entries" }, refresh)
      .subscribe();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Keep the existing display's rule: totals belong to active members' current teams.
  const results = useMemo(() => {
    if (!snapshot) return [];
    const teamByMember = new Map(snapshot.members.map((member) => [member.id, member.team_id]));
    const totals = new Map();
    snapshot.entries.forEach((entry) => {
      const teamId = teamByMember.get(entry.member_id);
      const count = Number(entry.word_count || 0);
      if (teamId !== undefined && Number.isFinite(count)) {
        totals.set(teamId, (totals.get(teamId) || 0) + count);
      }
    });
    const sorted = snapshot.teams.map((team) => ({ ...team, total: totals.get(team.id) || 0 }))
      .sort((a, b) => b.total - a.total);
    return sorted.map((team, index) => ({
      ...team,
      rank: sorted.findIndex((item) => item.total === team.total) + 1,
      tied: sorted.some((item, otherIndex) => otherIndex !== index && item.total === team.total),
    }));
  }, [snapshot]);

  async function fullScreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* Fullscreen is optional. */ }
  }

  const settings = snapshot?.settings || {};
  return (
    <main className="wb-final" onDoubleClick={fullScreen}>
      {error && <div className="wb-final-error" role="alert">{error}{snapshot && " (마지막으로 불러온 기록을 표시 중입니다.)"}</div>}
      <div className="wb-final-layout">
        <section className="wb-final-poster" aria-label="중3 단어대전 결과 발표 이미지">
          {posterFailed ? <p>결과 이미지를 찾을 수 없습니다.<br />public/images/word-battle-result.png 파일을 확인해 주세요.</p> :
            <img src={POSTER} alt="블라썸에듀 중3 단어대전 결과 발표 포스터" onError={() => setPosterFailed(true)} />}
        </section>
        <section className="wb-final-records" aria-labelledby="wb-final-title">
          <header className="wb-final-header">
            <span className="wb-final-eyebrow">BLOSSOM EDU · FINAL RESULTS</span>
            <h1 id="wb-final-title">{settings.event_title || "중3 단어대전"}<br /><em>최종 결과</em></h1>
            {(settings.start_date || settings.end_date) && <p className="wb-final-period">{settings.start_date} ~ {settings.end_date}</p>}
          </header>
          {!snapshot ? <p className="wb-final-status" role="status">{error ? "연결을 기다리는 중입니다." : "최종 기록을 불러오는 중입니다…"}</p> :
            !results.length ? <p className="wb-final-status">등록된 팀이 없습니다.</p> : <>
              <div className="wb-final-list">
                {results.map((team) => (
                  <article className={`wb-final-team ${team.rank === 1 && team.total > 0 ? "is-winner" : ""}`} key={team.id}
                    style={{ "--team-color": team.color || "#567564" }}>
                    <div className="wb-final-rank">{team.tied ? "공동 " : ""}{team.rank}위</div>
                    <div className="wb-final-team-name">{team.name}</div>
                    <div className="wb-final-count"><strong>{format(team.total)}</strong><span>단어</span></div>
                  </article>
                ))}
              </div>
              <div className="wb-final-total"><span>우리가 함께 쌓은 단어</span><b>{format(results.reduce((sum, team) => sum + team.total, 0))}<small> 단어</small></b></div>
            </>}
          <footer className="wb-final-footer">끝까지 함께한 여러분, 수고하셨습니다!</footer>
        </section>
      </div>
      <button type="button" className="wb-final-fullscreen" onClick={fullScreen} aria-label="전체화면 전환" title="전체화면 전환">⛶</button>
    </main>
  );
}
