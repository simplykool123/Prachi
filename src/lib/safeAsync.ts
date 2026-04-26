/**
 * Wraps any async fn in try/catch.
 * Returns [data, null] on success or [null, error] on failure.
 * Logs errors to the console so they're always traceable.
 *
 * Use for data-loading operations where a toast is not needed
 * (the caller decides how to surface the error).
 */
export async function safeAsync<T>(
  fn: () => Promise<T>
): Promise<[T | null, Error | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[safeAsync]', error);
    return [null, error];
  }
}
