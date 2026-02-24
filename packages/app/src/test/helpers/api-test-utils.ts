/**
 * API route test utilities.
 * Helpers for creating mock Request objects and admin auth context.
 */

export function createMockRequest(
  method: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
    searchParams?: Record<string, string>;
  } = {}
): Request {
  const url = new URL(options.url || "http://localhost:3000/api/test");
  if (options.searchParams) {
    for (const [k, v] of Object.entries(options.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const init: RequestInit = {
    method,
    headers: new Headers({
      "Content-Type": "application/json",
      ...options.headers,
    }),
  };

  if (options.body && !["GET", "HEAD"].includes(method.toUpperCase())) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(url.toString(), init);
}

export function createMockAdminRequest(
  method: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
    searchParams?: Record<string, string>;
    adminId?: string;
    role?: string;
  } = {}
): Request {
  return createMockRequest(method, {
    ...options,
    headers: {
      authorization: `Bearer admin-test-token`,
      ...options.headers,
    },
  });
}

export function createMockUserRequest(
  method: string,
  address: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
    searchParams?: Record<string, string>;
  } = {}
): Request {
  return createMockRequest(method, {
    ...options,
    headers: {
      authorization: `Bearer user-test-token`,
      "x-auth-address": address,
      ...options.headers,
    },
  });
}

/** Extract JSON body from a NextResponse-like object */
export async function extractJson(response: Response | { body: unknown }) {
  if ("json" in response && typeof response.json === "function") {
    return response.json();
  }
  return (response as { body: unknown }).body;
}
