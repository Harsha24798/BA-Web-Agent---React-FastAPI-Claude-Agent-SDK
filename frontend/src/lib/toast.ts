import { toast as sonner } from "sonner";

export const toast = {
  success: (msg: string) => sonner.success(msg),
  error: (msg: string) => sonner.error(msg),
  info: (msg: string) => sonner.message(msg),
};

/** Wrap an async action with success/error toasts. */
export async function withToast<T>(
  fn: () => Promise<T>,
  opts: { success?: string; error?: string } = {}
): Promise<T | undefined> {
  try {
    const r = await fn();
    if (opts.success) toast.success(opts.success);
    return r;
  } catch (e: any) {
    toast.error(opts.error ? `${opts.error}: ${e.message}` : e.message);
    return undefined;
  }
}
