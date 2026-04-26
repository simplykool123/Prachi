import { useState } from 'react';
import { useToast } from '../components/ui/Toast';

/**
 * Wraps an async operation with:
 *  - loading state (prevents duplicate submissions when button is disabled={saving})
 *  - automatic try/catch with console.error + toast.error on failure
 *  - optional success toast on completion
 *
 * Returns `{ saving, run }`.
 * Multiple independent actions in one component each get their own hook instance.
 */
export function useAsyncAction() {
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function run<T = void>(
    fn: () => Promise<T>,
    opts?: { success?: string; errorPrefix?: string }
  ): Promise<T | null> {
    setSaving(true);
    try {
      const data = await fn();
      if (opts?.success) toast.success(opts.success);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[useAsyncAction]', error);
      const userMsg = opts?.errorPrefix
        ? `${opts.errorPrefix}: ${error.message}`
        : 'An error occurred. Please try again.';
      toast.error(userMsg);
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { saving, run };
}
