import { useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import "./WordBattle.css";

const FALLBACK = { event_title: "중3 단어대전", event_subtitle: "단어를 쌓고, 팀의 기록을 높여라!", event_body: "2026. 9. 14. ~ 10. 31.", rules_title: "중3 단어대전 규칙", rules_body: "단어시험에 통과한 범위의 단어만 인정됩니다.", intro_bg: "#173f8a", rules_bg: "#0f6b5d", accent_color: "#ffd34e", slide_seconds: 8 };

export default function WordBattleDisplayPage() {
  const [settings, setSettings] = useState(FALLBACK);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [slide, setSlide] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    refresh();
    const channel = supabase.channel("word-battle-display")
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_settings" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_teams" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "word_battle_entries" }, refresh)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % 3), Math.max(3, Number(settings.slide_seconds) || 8) * 1000);
    return () => window.clearInterval(timer);
  }, [settings.slide_seconds]);

  async function refresh() {
    const [settingsRes, teamsRes, membersRes, entriesRes] = await Promise.all([
      supabase.from("word_battle_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("word_battle_teams").select("*").order("sort_order"),
      supabase.from("word_battle_members").select("id, team_id").eq("is_active", true),
      supabase.from("word_battle_entries").select("member_id, word_count"),
    ]);
    const failed = [settingsRes, teamsRes, membersRes, entriesRes].find((result) => result.error);
    if (failed) return setError("단어대전 정보를 불러오지 못했습니다. 관리자에게 알려주세요.");
    setError("");
    setSettings({ ...FALLBACK, ...(settingsRes.data || {}) });
    setTeams(teamsRes.data || []);
    setMembers(membersRes.data || []);
    setEntries(entriesRes.data || []);
  }

  const totals = useMemo(() => {
    const byMember = {};
    entries.forEach((entry) => { byMember[entry.member_id] = (byMember[entry.member_id] || 0) + Number(entry.word_count || 0); });
    const byTeam = {};
    members.forEach((member) => { byTeam[member.team_id] = (byTeam[member.team_id] || 0) + (byMember[member.id] || 0); });
    return byTeam;
  }, [entries, members]);
  const max = Math.max(1, ...teams.map((team) => totals[team.id] || 0));
  const leaders = teams.filter((team) => (totals[team.id] || 0) === max && max > 0).map((team) => team.id);

  async function fullScreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* 브라우저가 전체화면을 막은 경우 버튼은 그대로 둔다. */ }
  }

  const sharedStyle = { "--accent": settings.accent_color };
  return (
    <main className="wb-display" style={sharedStyle} onDoubleClick={fullScreen}>
      {error && <div className="wb-display-error">{error}</div>}
      <section className={`wb-slide wb-intro ${slide === 0 ? "shown" : ""}`} style={{ background: settings.intro_bg }}>
        <div className="wb-orb one"/><div className="wb-orb two"/>
        <div className="wb-slide-inner"><span className="wb-display-brand">SANBON BLOSSOM EDU</span><h1>{settings.event_title}</h1><h2>{settings.event_subtitle}</h2><p>{settings.event_body}</p></div>
      </section>
      <section className={`wb-slide wb-rules ${slide === 1 ? "shown" : ""}`} style={{ background: settings.rules_bg }}>
        <div className="wb-slide-inner"><span className="wb-display-brand">WORD BATTLE · 2026</span><h1>{settings.rules_title}</h1><div className="wb-rules-text">{settings.rules_body}</div></div>
      </section>
      <section className={`wb-slide wb-chart-slide ${slide === 2 ? "shown" : ""}`}>
        <div className="wb-chart-head"><div><span className="wb-display-brand dark">LIVE SCORE</span><h1>팀별 누적 단어 현황</h1></div><p>{settings.start_date} — {settings.end_date}</p></div>
        <div className="wb-vertical-bars">{teams.map((team, index) => {
          const total = totals[team.id] || 0;
          const height = total > 0 ? Math.max(10, (total / max) * 100) : 0;
          return <div className="wb-bar-column" key={team.id}>
            <div className="wb-column-rank">{leaders.includes(team.id) ? "👑 현재 1위" : `${index + 1}팀`}</div>
            <div className="wb-vertical-track">
              <div className="wb-vertical-fill" style={{ height: `${height}%`, background: team.color }}>
                <strong>{total.toLocaleString()}</strong>
              </div>
            </div>
            <div className="wb-column-name" style={{ color: team.color }}>{team.name}</div>
            <div className="wb-column-unit">누적 {total.toLocaleString()}단어</div>
          </div>;
        })}</div>
        <div className="wb-chart-footer">매일의 통과가 우리 팀의 기록이 됩니다.</div>
      </section>
      <button className="wb-fullscreen" onClick={fullScreen}>⛶</button>
      <div className="wb-dots">{[0,1,2].map((n) => <button key={n} className={slide === n ? "active" : ""} onClick={() => setSlide(n)} aria-label={`${n + 1}번 화면`} />)}</div>
    </main>
  );
}
