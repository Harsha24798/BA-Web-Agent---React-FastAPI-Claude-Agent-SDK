import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "./auth/guards";
import { FullPageLoader } from "./components/FullPageLoader";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SetPassword from "./pages/SetPassword";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import AudioTranscript from "./pages/AudioTranscript";

// Admin pages are lazy-loaded so regular users never download them or the heavy markdown editor.
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminModels = lazy(() => import("./pages/AdminModels"));
const AdminMasterPrompt = lazy(() => import("./pages/AdminMasterPrompt"));
const AdminTools = lazy(() => import("./pages/AdminTools"));
const AdminTemplate = lazy(() => import("./pages/AdminTemplate"));
const Settings = lazy(() => import("./pages/Settings"));

function Admin({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <Suspense fallback={<FullPageLoader />}>
        {children}
      </Suspense>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
      <Route path="/audio" element={<RequireAuth><AudioTranscript /></RequireAuth>} />

      <Route path="/admin/users" element={<Admin><AdminUsers /></Admin>} />
      <Route path="/admin/models" element={<Admin><AdminModels /></Admin>} />
      <Route path="/admin/master-prompt" element={<Admin><AdminMasterPrompt /></Admin>} />
      <Route path="/admin/tools" element={<Admin><AdminTools /></Admin>} />
      <Route path="/admin/template" element={<Admin><AdminTemplate /></Admin>} />
      <Route path="/admin/settings" element={<Admin><Settings /></Admin>} />

      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
