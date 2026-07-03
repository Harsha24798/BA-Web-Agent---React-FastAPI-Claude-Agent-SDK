import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui";

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const loc = useLocation();
  const active = loc.pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/projects" className="flex items-center gap-2 font-semibold text-slate-800">
              <span className="rounded-md bg-brand-500 px-2 py-1 text-xs text-white">BA</span>
              Agent · SRS Generator
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/projects">Projects</NavLink>
              {isAdmin && (
                <>
                  <NavLink to="/admin/users">Users</NavLink>
                  <NavLink to="/admin/models">Models</NavLink>
                  <NavLink to="/admin/master-prompt">Master Prompt</NavLink>
                  <NavLink to="/admin/tools">Tools</NavLink>
                  <NavLink to="/admin/template">Template</NavLink>
                </>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {user?.full_name} · <span className="capitalize">{user?.role}</span>
            </span>
            <Button variant="secondary" onClick={logout}>Logout</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
