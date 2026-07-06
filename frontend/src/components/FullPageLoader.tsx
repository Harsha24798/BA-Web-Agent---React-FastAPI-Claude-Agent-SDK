import { Spinner } from "./ui";

/** Centered, full-viewport loader shown while the app bootstraps (e.g. auth check on refresh). */
export function FullPageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <img src="/logo.png" alt="Centrics" className="h-10 w-auto" />
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Spinner /> Loading…
      </div>
    </div>
  );
}
