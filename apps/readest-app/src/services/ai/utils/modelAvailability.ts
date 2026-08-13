/**
 * Provider model-list responses intentionally stay untyped at this boundary.
 * The health check must prove that the application-controlled model is
 * available to the configured account; an HTTP 200 alone is not sufficient.
 */
export const responseContainsModel = async (
  response: Response,
  modelId: string,
): Promise<boolean> => {
  if (!response.ok) return false;

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload || typeof payload !== 'object') return false;
  const records =
    (payload as { data?: unknown; models?: unknown }).data ??
    (payload as { models?: unknown }).models;
  if (!Array.isArray(records)) return false;

  return records.some((record) => {
    if (!record || typeof record !== 'object') return false;
    const value = record as { id?: unknown; name?: unknown; model?: unknown };
    return [value.id, value.name, value.model].some(
      (candidate) => typeof candidate === 'string' && candidate.trim() === modelId,
    );
  });
};
