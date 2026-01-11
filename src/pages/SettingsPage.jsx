import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
  const nav = useNavigate();

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: 20 }}>
      <h1>설정</h1>
      <p style={{ color: "#666" }}>
        여기에 나중에 학원/선생님/시간표 설정을 붙일 거야.
      </p>

      <button
        type="button"
        onClick={() => nav(-1)}
        style={{ padding: "10px 14px", borderRadius: 10 }}
      >
        뒤로가기
      </button>
    </div>
  );
}
