import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiPost } from "../lib/api";
import { toast } from "../lib/toast";
import { Button, Card, Input, Label } from "../components/ui";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost("/auth/register", { full_name: fullName, email });
      setDone(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 inline-block rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-bold text-white">BA Agent</div>
          <h1 className="text-lg font-semibold">Create an account</h1>
        </div>
        {done ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
              Request received! An admin will review your account. You'll get an email with a link to
              set your password once approved.
            </div>
            <Link to="/login" className="text-sm text-brand-600 hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Full name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Submitting…" : "Register"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
