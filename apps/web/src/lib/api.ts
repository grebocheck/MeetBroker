export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include"
  });
  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | T
    | null;
  if (!response.ok) {
    const error = (payload as { error?: Record<string, unknown> } | null)?.error;
    throw new ApiError(
      String(error?.code ?? "REQUEST_FAILED"),
      Array.isArray(error?.message)
        ? error.message.join(", ")
        : String(error?.message ?? "Request failed"),
      response.status,
      error?.details
    );
  }
  return payload as T;
}
