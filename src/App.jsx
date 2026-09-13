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

import StudentDetailPage from "./pages/StudentDetailPage";
import LecturesPage from "./pages/LecturesPage";

import OneToOneScheduleSelectPage from "./pages/OneToOneScheduleSelectPage";
import OneToOneSchedulePage from "./pages/OneToOneSchedulePage";
import TeacherOneToOneHubPage from "./pages/TeacherOneToOneHubPage";
import OneToOneTodosPage from "./pages/OneToOneTodosPage";

import ReadingSchedulePage from "./pages/ReadingSchedulePage";

import KioskPage from "./pages/KioskPage";

import GradesHomePage from "./pages/grades/GradesHomePage";
import GradesPage from "./pages/grades/GradesPage";
import StudentGradesPage from "./pages/grades/StudentGradesPage";
import ScoreQueryPage from "./pages/grades/ScoreQueryPage";

import ContactFormsPage from "./pages/ContactFormsPage";

import CounselingPage from "./pages/CounselingPage";
import CounselingSessionPage from "./pages/CounselingSessionPage";

import WordTestPage from "./pages/WordTestPage";

// 중3 단어대전
import WordBattlePage from "./pages/WordBattlePage";
import WordBattleDisplayPage from "./pages/WordBattleDisplayPage";

import { isAuthed } from "./utils/auth";

function GlobalBackButton() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const HIDE_PATHS = [
    "/",
    "/dashboard",
    "/word-battle/display",
  ];

  if (HIDE_PATHS.includes(pathname)) return null;

  function goBack() {
    if (window.history.length > 1) {
      nav(-1);
    } else {
      nav("/dashboard", { replace: true });
    }
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
  const location = useLocation();

  if (!isAuthed()) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

   return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalBackButton />

      <Routes>
        {/* 공개 페이지 */}
        <Route path="/" element={<LoginPage />} />

        {/* 학생 모니터용 공개 페이지 */}
        <Route
          path="/word-battle/display"
          element={<WordBattleDisplayPage />}
        />

        {/* 로그인 필요 페이지 */}
        <Route element={<RequireAuth />}>
          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/students"
            element={<StudentsPage />}
          />

          <Route
            path="/students/:studentId"
            element={<StudentDetailPage />}
          />

          <Route
            path="/settings"
            element={<SettingsPage />}
          />

          <Route
            path="/lectures"
            element={<LecturesPage />}
          />

          <Route
            path="/one-to-one"
            element={<OneToOneScheduleSelectPage />}
          />

          <Route
            path="/one-to-one/:teacherName"
            element={<TeacherOneToOneHubPage />}
          />

          <Route
            path="/one-to-one/:teacherName/schedule"
            element={<OneToOneSchedulePage />}
          />

          <Route
            path="/one-to-one/:teacherName/todos"
            element={<OneToOneTodosPage />}
          />

          <Route
            path="/reading"
            element={<ReadingSchedulePage />}
          />

          <Route
            path="/kiosk"
            element={<KioskPage />}
          />

          <Route
            path="/grades"
            element={<GradesHomePage />}
          />

          <Route
            path="/grades/students"
            element={<GradesPage />}
          />

          <Route
            path="/grades/students/:studentId"
            element={<StudentGradesPage />}
          />

          <Route
            path="/grades/query"
            element={<ScoreQueryPage />}
          />

          <Route
            path="/contact-forms"
            element={<ContactFormsPage />}
          />

          <Route
            path="/counseling"
            element={<CounselingPage />}
          />

          <Route
            path="/counseling/:sessionId"
            element={<CounselingSessionPage />}
          />

          <Route
            path="/word-tests"
            element={<WordTestPage />}
          />

          {/* 중3 단어대전 관리자 화면 */}
          <Route
            path="/word-battle"
            element={<WordBattlePage />}
          />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}