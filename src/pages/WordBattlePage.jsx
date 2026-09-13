// src/pages/WordBattlePage.jsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../utils/supabaseClient";
import "./WordBattle.css";

const DEFAULT_SETTINGS = {
  id: 1,
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

export default function WordBattlePage() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [students, setStudents] = useState([]);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = dayjs().format("YYYY-MM-DD");

    if (today < DEFAULT_SETTINGS.start_date) {
      return DEFAULT_SETTINGS.start_date;
    }

    if (today > DEFAULT_SETTINGS.end_date) {
      return DEFAULT_SETTINGS.end_date;
    }

    return today;
  });

  const [counts, setCounts] = useState({});
  const [newNames, setNewNames] = useState({});
  const [studentChoices, setStudentChoices] = useState({});
  const [activeTab, setActiveTab] = useState("score");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const nextCounts = {};

    entries
      .filter((entry) => entry.entry_date === selectedDate)
      .forEach((entry) => {
        nextCounts[entry.member_id] = entry.word_count;
      });

    setCounts(nextCounts);
  }, [entries, selectedDate]);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [
        settingsResult,
        teamsResult,
        membersResult,
        entriesResult,
        studentsResult,
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
          .select("*")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("word_battle_entries")
          .select("*")
          .order("entry_date", { ascending: false }),

        supabase
          .from("students")
          .select("id, name, school, grade")
          .order("name"),
      ]);

      const results = [
        settingsResult,
        teamsResult,
        membersResult,
        entriesResult,
        studentsResult,
      ];

      const failedResult = results.find((result) => result.error);

      if (failedResult) {
        throw failedResult.error;
      }

      setSettings({
        ...DEFAULT_SETTINGS,
        ...(settingsResult.data || {}),
      });

      setTeams(teamsResult.data || []);
      setMembers(membersResult.data || []);
      setEntries(entriesResult.data || []);
      setStudents(studentsResult.data || []);
    } catch (loadError) {
      setError(
        `${
          loadError?.message || "데이터를 불러오지 못했습니다."
        } Supabase SQL을 먼저 실행했는지 확인해주세요.`
      );
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    const memberTotals = {};
    const teamTotals = {};

    entries.forEach((entry) => {
      memberTotals[entry.member_id] =
        (memberTotals[entry.member_id] || 0) +
        Number(entry.word_count || 0);
    });

    members.forEach((member) => {
      teamTotals[member.team_id] =
        (teamTotals[member.team_id] || 0) +
        (memberTotals[member.id] || 0);
    });

    return {
      memberTotals,
      teamTotals,
    };
  }, [entries, members]);

  function notify(text) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 2500);
  }

  async function saveSettings() {
    setBusy(true);
    setError("");

    const payload = {
      ...settings,
      id: 1,
      slide_seconds: Math.min(
        60,
        Math.max(3, Number(settings.slide_seconds) || 8)
      ),
      updated_at: new Date().toISOString(),
    };

    const { data, error: saveError } = await supabase
      .from("word_battle_settings")
      .upsert(payload)
      .select()
      .single();

    setBusy(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    setSettings(data);
    notify("화면 설정을 저장했습니다.");
  }

  async function saveTeam(team) {
    if (!team.name.trim()) {
      alert("팀 이름을 입력해주세요.");
      return;
    }

    const { error: saveError } = await supabase
      .from("word_battle_teams")
      .update({
        name: team.name.trim(),
        color: team.color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", team.id);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    notify("팀 설정을 저장했습니다.");
  }

  async function addMember(teamId) {
    const selectedStudentId = studentChoices[teamId] || "";

    const selectedStudent = students.find(
      (student) => student.id === selectedStudentId
    );

    const name = (
      selectedStudent?.name ||
      newNames[teamId] ||
      ""
    ).trim();

    if (!name) {
      alert("학생을 선택하거나 이름을 입력해주세요.");
      return;
    }

    const payload = {
      team_id: teamId,
      student_id: selectedStudent?.id || null,
      name,
      is_active: true,
    };

    const { data, error: addError } = await supabase
      .from("word_battle_members")
      .insert(payload)
      .select()
      .single();

    if (addError) {
      setError(addError.message);
      return;
    }

    setMembers((previousMembers) =>
      [...previousMembers, data].sort((first, second) =>
        first.name.localeCompare(second.name, "ko")
      )
    );

    setNewNames((previousNames) => ({
      ...previousNames,
      [teamId]: "",
    }));

    setStudentChoices((previousChoices) => ({
      ...previousChoices,
      [teamId]: "",
    }));

    notify(`${name} 학생을 등록했습니다.`);
  }

  async function removeMember(member) {
    const confirmed = window.confirm(
      `${member.name} 학생을 팀에서 삭제할까요?\n기존 누적 기록도 함께 삭제됩니다.`
    );

    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("word_battle_members")
      .delete()
      .eq("id", member.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMembers((previousMembers) =>
      previousMembers.filter((item) => item.id !== member.id)
    );

    setEntries((previousEntries) =>
      previousEntries.filter(
        (entry) => entry.member_id !== member.id
      )
    );

    notify("학생을 삭제했습니다.");
  }

  async function moveMember(member, nextTeamId) {
    const { error: moveError } = await supabase
      .from("word_battle_members")
      .update({
        team_id: nextTeamId,
      })
      .eq("id", member.id);

    if (moveError) {
      setError(moveError.message);
      return;
    }

    setMembers((previousMembers) =>
      previousMembers.map((item) =>
        item.id === member.id
          ? {
              ...item,
              team_id: nextTeamId,
            }
          : item
      )
    );

    notify("소속 팀을 변경했습니다.");
  }

  async function saveDailyScores() {
    if (
      selectedDate < settings.start_date ||
      selectedDate > settings.end_date
    ) {
      alert(
        `집계 기간(${settings.start_date} ~ ${settings.end_date}) 안의 날짜를 선택해주세요.`
      );
      return;
    }

    if (!members.length) {
      alert("먼저 팀에 학생을 등록해주세요.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const dailyRecords = members.map((member) => ({
        member_id: member.id,
        entry_date: selectedDate,
        word_count: Math.max(
          0,
          Number(counts[member.id]) || 0
        ),
      }));

      const { data, error: saveError } = await supabase
        .from("word_battle_entries")
        .upsert(dailyRecords, {
          onConflict: "member_id,entry_date",
        })
        .select();

      if (saveError) {
        throw saveError;
      }

      setEntries((previousEntries) => {
        const savedKeys = new Set(
          dailyRecords.map(
            (record) =>
              `${record.member_id}|${record.entry_date}`
          )
        );

        const otherEntries = previousEntries.filter(
          (entry) =>
            !savedKeys.has(
              `${entry.member_id}|${entry.entry_date}`
            )
        );

        return [...otherEntries, ...(data || [])];
      });

      notify(
        `${dayjs(selectedDate).format(
          "M월 D일"
        )} 기록을 저장했습니다.`
      );
    } catch (saveError) {
      setError(
        saveError?.message || "기록을 저장하지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const rows = [
      ["날짜", "팀", "학생", "통과 단어 수"],
    ];

    entries
      .slice()
      .sort((first, second) =>
        first.entry_date.localeCompare(second.entry_date)
      )
      .forEach((entry) => {
        const member = members.find(
          (item) => item.id === entry.member_id
        );

        const team = teams.find(
          (item) => item.id === member?.team_id
        );

        rows.push([
          entry.entry_date,
          team?.name || "",
          member?.name || "",
          entry.word_count,
        ]);
      });

    const csvContent =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map(
              (cell) =>
                `"${String(cell).replaceAll('"', '""')}"`
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `중3단어대전_${dayjs().format(
      "YYYYMMDD"
    )}.csv`;

    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="wb-loading">
        중3 단어대전 정보를 불러오는 중...
      </div>
    );
  }

  return (
    <main className="wb-admin">
      <header className="wb-admin-header">
        <div>
          <span className="wb-eyebrow">
            BLOSSOM EDU
          </span>

          <h1>중3 단어대전 관리</h1>

          <p>
            {settings.start_date} ~ {settings.end_date}
          </p>
        </div>

        <div className="wb-header-actions">
          <button
            type="button"
            className="wb-secondary"
            onClick={downloadCsv}
          >
            기록 CSV
          </button>

          <button
            type="button"
            onClick={() =>
              window.open(
                "/word-battle/display",
                "_blank"
              )
            }
          >
            모니터 화면 열기 ↗
          </button>
        </div>
      </header>

      <nav className="wb-tabs">
        <button
          type="button"
          className={
            activeTab === "score" ? "active" : ""
          }
          onClick={() => setActiveTab("score")}
        >
          오늘의 단어 입력
        </button>

        <button
          type="button"
          className={
            activeTab === "members" ? "active" : ""
          }
          onClick={() => setActiveTab("members")}
        >
          팀·구성원 관리
        </button>

        <button
          type="button"
          className={
            activeTab === "slides" ? "active" : ""
          }
          onClick={() => setActiveTab("slides")}
        >
          안내·규칙 편집
        </button>
      </nav>

      {message && (
        <div className="wb-toast">{message}</div>
      )}

      {error && (
        <div className="wb-error">{error}</div>
      )}

      {activeTab === "score" && (
        <>
          <section className="wb-summary-grid">
            {teams.map((team) => (
              <article
                className="wb-summary"
                key={team.id}
                style={{
                  borderTopColor: team.color,
                }}
              >
                <span>{team.name}</span>

                <strong>
                  {(
                    totals.teamTotals[team.id] || 0
                  ).toLocaleString()}
                </strong>

                <small>누적 단어</small>
              </article>
            ))}
          </section>

          <section className="wb-card">
            <div className="wb-card-title">
              <div>
                <h2>날짜별 통과 단어 수</h2>

                <p>
                  그날 시험에 통과한 단어 수를
                  학생별로 입력하세요. 같은 날짜는
                  다시 저장하면 수정됩니다.
                </p>
              </div>

              <input
                type="date"
                min={settings.start_date}
                max={settings.end_date}
                value={selectedDate}
                onChange={(event) =>
                  setSelectedDate(event.target.value)
                }
              />
            </div>

            <div className="wb-team-columns">
              {teams.map((team) => {
                const teamMembers = members.filter(
                  (member) =>
                    member.team_id === team.id
                );

                return (
                  <div
                    className="wb-score-team"
                    key={team.id}
                  >
                    <h3
                      style={{
                        color: team.color,
                      }}
                    >
                      {team.name}
                    </h3>

                    {teamMembers.map((member) => (
                      <label
                        className="wb-score-row"
                        key={member.id}
                      >
                        <span>
                          <b>{member.name}</b>

                          <small>
                            누적{" "}
                            {(
                              totals.memberTotals[
                                member.id
                              ] || 0
                            ).toLocaleString()}
                          </small>
                        </span>

                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          placeholder="0"
                          value={
                            counts[member.id] ?? ""
                          }
                          onChange={(event) =>
                            setCounts(
                              (previousCounts) => ({
                                ...previousCounts,
                                [member.id]:
                                  event.target.value,
                              })
                            )
                          }
                        />
                      </label>
                    ))}

                    {!teamMembers.length && (
                      <p className="wb-muted">
                        등록된 학생이 없습니다.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="wb-save-row">
              <button
                type="button"
                disabled={busy || !members.length}
                onClick={saveDailyScores}
              >
                {busy
                  ? "저장 중..."
                  : `${dayjs(selectedDate).format(
                      "M월 D일"
                    )} 기록 저장`}
              </button>
            </div>
          </section>
        </>
      )}

      {activeTab === "members" && (
        <section className="wb-team-columns">
          {teams.map((team) => {
            const teamMembers = members.filter(
              (member) => member.team_id === team.id
            );

            return (
              <article
                className="wb-card wb-team-card"
                key={team.id}
              >
                <div className="wb-team-editor">
                  <input
                    value={team.name}
                    onChange={(event) =>
                      setTeams((previousTeams) =>
                        previousTeams.map((item) =>
                          item.id === team.id
                            ? {
                                ...item,
                                name: event.target.value,
                              }
                            : item
                        )
                      )
                    }
                  />

                  <input
                    type="color"
                    value={team.color}
                    onChange={(event) =>
                      setTeams((previousTeams) =>
                        previousTeams.map((item) =>
                          item.id === team.id
                            ? {
                                ...item,
                                color:
                                  event.target.value,
                              }
                            : item
                        )
                      )
                    }
                  />

                  <button
                    type="button"
                    className="wb-small"
                    onClick={() => saveTeam(team)}
                  >
                    저장
                  </button>
                </div>

                <div className="wb-add-member">
                  <select
                    value={
                      studentChoices[team.id] || ""
                    }
                    onChange={(event) =>
                      setStudentChoices(
                        (previousChoices) => ({
                          ...previousChoices,
                          [team.id]:
                            event.target.value,
                        })
                      )
                    }
                  >
                    <option value="">
                      기존 학생에서 선택
                    </option>

                    {students
                      .filter(
                        (student) =>
                          !members.some(
                            (member) =>
                              member.student_id ===
                              student.id
                          )
                      )
                      .map((student) => (
                        <option
                          value={student.id}
                          key={student.id}
                        >
                          {student.name} ·{" "}
                          {student.school ||
                            "학교 미등록"}{" "}
                          {student.grade || ""}
                        </option>
                      ))}
                  </select>

                  <span>또는</span>

                  <input
                    placeholder="학생 이름 직접 입력"
                    value={newNames[team.id] || ""}
                    onChange={(event) =>
                      setNewNames(
                        (previousNames) => ({
                          ...previousNames,
                          [team.id]:
                            event.target.value,
                        })
                      )
                    }
                  />

                  <button
                    type="button"
                    onClick={() =>
                      addMember(team.id)
                    }
                  >
                    학생 추가
                  </button>
                </div>

                <div className="wb-member-list">
                  {teamMembers.map((member) => (
                    <div
                      className="wb-member"
                      key={member.id}
                    >
                      <span>
                        <b>{member.name}</b>

                        <small>
                          {(
                            totals.memberTotals[
                              member.id
                            ] || 0
                          ).toLocaleString()}
                          단어
                        </small>
                      </span>

                      <select
                        value={member.team_id}
                        onChange={(event) =>
                          moveMember(
                            member,
                            event.target.value
                          )
                        }
                      >
                        {teams.map((targetTeam) => (
                          <option
                            key={targetTeam.id}
                            value={targetTeam.id}
                          >
                            {targetTeam.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="wb-danger"
                        onClick={() =>
                          removeMember(member)
                        }
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {activeTab === "slides" && (
        <section className="wb-editor-grid">
          <article className="wb-card">
            <h2>1. 안내 화면</h2>

            <label>
              큰 제목
              <input
                value={settings.event_title}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    event_title:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              부제목
              <input
                value={settings.event_subtitle}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    event_subtitle:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              본문
              <textarea
                rows="6"
                value={settings.event_body}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    event_body:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              배경색
              <input
                type="color"
                value={settings.intro_bg}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    intro_bg:
                      event.target.value,
                  })
                }
              />
            </label>
          </article>

          <article className="wb-card">
            <h2>2. 규칙 화면</h2>

            <label>
              큰 제목
              <input
                value={settings.rules_title}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    rules_title:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              규칙 내용
              <textarea
                rows="10"
                value={settings.rules_body}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    rules_body:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              배경색
              <input
                type="color"
                value={settings.rules_bg}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    rules_bg:
                      event.target.value,
                  })
                }
              />
            </label>
          </article>

          <article className="wb-card">
            <h2>공통 설정</h2>

            <label>
              강조색
              <input
                type="color"
                value={settings.accent_color}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    accent_color:
                      event.target.value,
                  })
                }
              />
            </label>

            <div className="wb-date-pair">
              <label>
                시작일
                <input
                  type="date"
                  value={settings.start_date}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      start_date:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                종료일
                <input
                  type="date"
                  value={settings.end_date}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      end_date:
                        event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <label>
              화면 전환 시간(초)
              <input
                type="number"
                min="3"
                max="60"
                value={settings.slide_seconds}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    slide_seconds:
                      event.target.value,
                  })
                }
              />
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={saveSettings}
            >
              모든 화면 설정 저장
            </button>
          </article>
        </section>
      )}
    </main>
  );
}