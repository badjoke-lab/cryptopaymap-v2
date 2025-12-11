export type SafeFetchOptions = RequestInit & {
  retries?: number;
  retryDelayMs?: number;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function safeFetch<T>(input: RequestInfo | URL, options: SafeFetchOptions = {}): Promise<T> {
  const { retries = 2, retryDelayMs = 300, ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await wait(retryDelayMs);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Request failed");
}
