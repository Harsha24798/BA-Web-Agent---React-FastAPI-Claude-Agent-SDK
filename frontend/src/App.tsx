import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "./auth/guards";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SetPassword from "./pages/SetPassword";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import AdminUsers from "./pages/AdminUsers";
import AdminModels from "./pages/AdminModels";
import AdminMasterPrompt from "./pages/AdminMasterPrompt";
import AdminTools from "./pages/AdminTools";
import AdminTemplate from "./pages/AdminTemplate";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />

      <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
      <Route path="/admin/models" element={<RequireAdmin><AdminModels /></RequireAdmin>} />
      <Route path="/admin/master-prompt" element={<RequireAdmin><AdminMasterPrompt /></RequireAdmin>} />
      <Route path="/admin/tools" element={<RequireAdmin><AdminTools /></RequireAdmin>} />
      <Route path="/admin/template" element={<RequireAdmin><AdminTemplate /></RequireAdmin>} />

      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
