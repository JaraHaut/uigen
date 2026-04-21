import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Prevent "server-only" from throwing in the test environment
vi.mock("server-only", () => ({}));

// --- Mock next/headers cookies ---
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// --- Mock jose ---
// SignJWT is a builder; each method returns `this` and `sign` resolves the token.
const mockSign = vi.fn().mockResolvedValue("mock-jwt-token");
const mockJwtBuilder = {
  setProtectedHeader: vi.fn().mockReturnThis(),
  setExpirationTime: vi.fn().mockReturnThis(),
  setIssuedAt: vi.fn().mockReturnThis(),
  sign: mockSign,
};
vi.mock("jose", () => ({
  SignJWT: vi.fn(() => mockJwtBuilder),
  jwtVerify: vi.fn(),
}));

// Import after mocks are in place
import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";
import { jwtVerify } from "jose";

const COOKIE_NAME = "auth-token";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no cookie present
  mockCookieStore.get.mockReturnValue(undefined);
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
describe("createSession", () => {
  test("signs a JWT and stores it as an httpOnly cookie", async () => {
    await createSession("user-1", "user@example.com");

    // The JWT builder should have been called with session data
    expect(mockJwtBuilder.setProtectedHeader).toHaveBeenCalledWith({ alg: "HS256" });
    expect(mockJwtBuilder.setExpirationTime).toHaveBeenCalledWith("7d");
    expect(mockJwtBuilder.setIssuedAt).toHaveBeenCalled();
    expect(mockSign).toHaveBeenCalled();

    // Cookie should be set with the returned token
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      COOKIE_NAME,
      "mock-jwt-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    );
  });

  test("cookie expires in ~7 days", async () => {
    const before = Date.now();
    await createSession("user-1", "user@example.com");
    const after = Date.now();

    const [, , options] = mockCookieStore.set.mock.calls[0];
    const expiresMs = (options.expires as Date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------
describe("getSession", () => {
  test("returns null when no auth cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload when the JWT is valid", async () => {
    const payload = { userId: "user-1", email: "user@example.com", expiresAt: new Date() };
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as never);

    const session = await getSession();
    expect(session).toEqual(payload);
    expect(jwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
  });

  test("returns null when the JWT is invalid/expired", async () => {
    mockCookieStore.get.mockReturnValue({ value: "bad-token" });
    vi.mocked(jwtVerify).mockRejectedValue(new Error("invalid signature"));

    const session = await getSession();
    expect(session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteSession
// ---------------------------------------------------------------------------
describe("deleteSession", () => {
  test("deletes the auth cookie", async () => {
    await deleteSession();
    expect(mockCookieStore.delete).toHaveBeenCalledWith(COOKIE_NAME);
  });
});

// ---------------------------------------------------------------------------
// verifySession
// ---------------------------------------------------------------------------
describe("verifySession", () => {
  // Helper: build a NextRequest that carries a cookie
  function makeRequest(token?: string): NextRequest {
    const req = new NextRequest("http://localhost/api/test");
    if (token) {
      // NextRequest reads cookies from the Cookie header
      const headers = new Headers({ Cookie: `${COOKIE_NAME}=${token}` });
      return new NextRequest("http://localhost/api/test", { headers });
    }
    return req;
  }

  test("returns null when no auth cookie is present in the request", async () => {
    const result = await verifySession(makeRequest());
    expect(result).toBeNull();
  });

  test("returns session payload for a valid request cookie", async () => {
    const payload = { userId: "user-2", email: "other@example.com", expiresAt: new Date() };
    vi.mocked(jwtVerify).mockResolvedValue({ payload } as never);

    const result = await verifySession(makeRequest("valid-token"));
    expect(result).toEqual(payload);
  });

  test("returns null when request cookie JWT verification fails", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("jwt expired"));

    const result = await verifySession(makeRequest("expired-token"));
    expect(result).toBeNull();
  });
});
