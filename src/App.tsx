import { Route, Routes } from 'react-router-dom'
import TopBar from './components/TopBar'
import { TeacherRoute, StudentRoute } from './components/ProtectedRoute'

import Home from './pages/Home'
import TeacherLogin from './pages/TeacherLogin'
import StudentLogin from './pages/StudentLogin'
import TeacherDashboard from './pages/TeacherDashboard'
import TeacherClassDetail from './pages/TeacherClassDetail'
import TeacherExamCreate from './pages/TeacherExamCreate'
import TeacherExamResults from './pages/TeacherExamResults'
import TeacherExamEdit from './pages/TeacherExamEdit'
import TeacherAllExams from './pages/TeacherAllExams'
import TeacherLessons from './pages/TeacherLessons'
import TeacherQuestionBankUpload from './pages/TeacherQuestionBankUpload'
import TeacherExamFromMatrix from './pages/TeacherExamFromMatrix'
import StudentDashboard from './pages/StudentDashboard'
import StudentLessons from './pages/StudentLessons'
import StudentExamTake from './pages/StudentExamTake'
import StudentResult from './pages/StudentResult'

export default function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/student/login" element={<StudentLogin />} />

        <Route
          path="/teacher/dashboard"
          element={
            <TeacherRoute>
              <TeacherDashboard />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classes/:classId"
          element={
            <TeacherRoute>
              <TeacherClassDetail />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classes/:classId/exams/new"
          element={
            <TeacherRoute>
              <TeacherExamCreate />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/exams"
          element={
            <TeacherRoute>
              <TeacherAllExams />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/exams/:examId/edit"
          element={
            <TeacherRoute>
              <TeacherExamEdit />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/exams/:examId/results"
          element={
            <TeacherRoute>
              <TeacherExamResults />
            </TeacherRoute>
          }
        />

        <Route
          path="/teacher/question-bank"
          element={
            <TeacherRoute>
              <TeacherQuestionBankUpload />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/classes/:classId/exams/new-from-matrix"
          element={
            <TeacherRoute>
              <TeacherExamFromMatrix />
            </TeacherRoute>
          }
        />
        <Route
          path="/teacher/lessons"
          element={
            <TeacherRoute>
              <TeacherLessons />
            </TeacherRoute>
          }
        />
        <Route
          path="/student/lessons"
          element={
            <StudentRoute>
              <StudentLessons />
            </StudentRoute>
          }
        />
        <Route
          path="/student/dashboard"
          element={
            <StudentRoute>
              <StudentDashboard />
            </StudentRoute>
          }
        />
        <Route
          path="/student/exams/:examId/take"
          element={
            <StudentRoute>
              <StudentExamTake />
            </StudentRoute>
          }
        />
        <Route
          path="/student/exams/:examId/result"
          element={
            <StudentRoute>
              <StudentResult />
            </StudentRoute>
          }
        />
      </Routes>
    </>
  )
}
