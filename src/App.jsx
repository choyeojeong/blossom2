// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import StudentsPage from "./pages/StudentsPage";

// ✅ 학생 상세 페이지
import StudentDetailPage from "./pages/StudentDetailPage";

// ✅ 강의관리
import LecturesPage from "./pages/LecturesPage";

// ✅ 일대일 시간표
import OneToOneScheduleSelectPage from "./pages/OneToOneScheduleSelectPage";
import OneToOneSchedulePage from "./pages/OneToOneSchedulePage";

// ✅ ✅ 새로 추가: 선생님 허브(시간표보기/날짜별할일보기)
import TeacherOneToOneHubPage from "./pages/TeacherOneToOneHubPage";
// ✅ ✅ 새로 추가: 날짜별 할일 보기(뼈대)
import OneToOneTodosPage from "./pages/OneToOneTodosPage";

// ✅ 독해 시간표
import ReadingSchedulePage from "./pages/ReadingSchedulePage";

// ✅ 출결현황
import AttendanceStatusPage from "./pages/AttendanceStatusPage";

// ✅ 키오스크
import KioskPage from "./pages/KioskPage";

// ✅ 성적관리
import GradesHomePage from "./pages/grades/GradesHomePage";
import GradesPage from "./pages/grades/GradesPage";
import StudentGradesPage from "./pages/grades/StudentGradesPage";
import ScoreQueryPage from "./pages/grades/ScoreQueryPage";

// ✅ 학부모 연락양식 (복구)
import ContactFormsPage from "./pages/ContactFormsPage";

import { isAuthed } from "./utils/auth";

/**
 * ✅ 전역 뒤로가기 버튼 (MainLayout 없이 App.jsx에서 한 번만 적용)
 * - 로그인(/), 대시보드(/dashboard)에서는 숨김
 * - 그 외 모든 페이지에서는 좌상단 고정 표시
 * - PWA 첫 진입 등 history가 없으면 /dashboard로 fallback
 */
function GlobalBackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const HIDE_PATHS = ["/", "/dashboard"];
  if (HIDE_PATHS.includes(pathname)) return null;

  function goBack() {
    if (window.history.length > 1) nav(-1);
    else nav("/dashboard", { replace: true });
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="뒤로가기"
      title="뒤로가기"
      style={{
        position: "fixed",
        zIndex: 999999,
        left: 12,
        top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        height: 36,
        minWidth: 36,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.92)",
        color: "#1f2a44",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      ←
    </button>
  );
}

function RequireAuth() {
  const loc = useLocation();
  if (!isAuthed())
    return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* ✅ 전역 뒤로가기 버튼: 라우트 전환과 무관하게 항상 동작 */}
      <GlobalBackButton />

      <Routes>
        {/* 공개 */}
        <Route path="/" element={<LoginPage />} />

        {/* 보호 */}
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* 학생관리 + 학생상세 */}
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:studentId" element={<StudentDetailPage />} />

          <Route path="/settings" element={<SettingsPage />} />

          {/* 강의관리 */}
          <Route path="/lectures" element={<LecturesPage />} />

          {/* ✅ 일대일 시간표 */}
          <Route path="/one-to-one" element={<OneToOneScheduleSelectPage />} />

          {/* ✅ 선생님 선택 후: 허브 페이지 (시간표보기 / 날짜별할일보기) */}
          <Route
            path="/one-to-one/:teacherName"
            element={<TeacherOneToOneHubPage />}
          />

          {/* ✅ 시간표보기: 기존 일대일시간표 페이지 */}
          <Route
            path="/one-to-one/:teacherName/schedule"
            element={<OneToOneSchedulePage />}
          />

          {/* ✅ 날짜별할일보기: 새 페이지(뼈대) */}
          <Route
            path="/one-to-one/:teacherName/todos"
            element={<OneToOneTodosPage />}
          />

          {/* 독해 시간표 */}
          <Route path="/reading" element={<ReadingSchedulePage />} />

          {/* 출결현황 */}
          <Route path="/attendance" element={<AttendanceStatusPage />} />

          {/* 키오스크 */}
          <Route path="/kiosk" element={<KioskPage />} />

          {/* 성적관리 */}
          <Route path="/grades" element={<GradesHomePage />} />
          <Route path="/grades/students" element={<GradesPage />} />
          <Route
            path="/grades/students/:studentId"
            element={<StudentGradesPage />}
          />
          <Route path="/grades/query" element={<ScoreQueryPage />} />

          {/* ✅ 학부모 연락양식 */}
          <Route path="/contact-forms" element={<ContactFormsPage />} />
        </Route>

        {/* 그 외 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
