// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
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

function RequireAuth() {
  const loc = useLocation();
  if (!isAuthed())
    return <Navigate to="/" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
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

          {/* 일대일 시간표 */}
          <Route path="/one-to-one" element={<OneToOneScheduleSelectPage />} />
          <Route
            path="/one-to-one/:teacherName"
            element={<OneToOneSchedulePage />}
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
