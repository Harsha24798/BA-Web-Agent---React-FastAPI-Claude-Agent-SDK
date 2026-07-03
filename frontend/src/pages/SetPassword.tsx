import { FormEvent, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";
import { toast } from "../lib/toast";
import { Button, Card, Input, Label } from "../components/ui";

export default function SetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/auth/set-password", { token, password });
      toast.success("Password set. Please sign in.");
      nav("/login");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-lg font-semibold">Set your password</h1>
        {!token ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            Missing token. Please use the link from your email.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>New password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Set password"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </Card>
    </div>
  );
}
