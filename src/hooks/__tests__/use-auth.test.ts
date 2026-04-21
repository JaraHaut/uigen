import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// Mock next/navigation router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock server actions
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// Mock anon-work-tracker
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no anonymous work
  mockGetAnonWorkData.mockReturnValue(null);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("useAuth — initial state", () => {
  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth — signIn", () => {
  test("sets isLoading to true while request is in-flight then false after", async () => {
    // Resolve after we observe the loading state
    let resolve!: (v: any) => void;
    mockSignIn.mockReturnValue(new Promise((r) => (resolve = r)));
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-1" } as any);

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signIn("user@test.com", "pass");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve({ success: false });
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("returns the action result on failure", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" } as any);

    const { result } = renderHook(() => useAuth());
    let returned: any;

    await act(async () => {
      returned = await result.current.signIn("bad@test.com", "wrong");
    });

    expect(returned).toEqual({ success: false, error: "Invalid credentials" });
  });

  test("returns the action result on success", async () => {
    mockSignIn.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "p1" }] as any);

    const { result } = renderHook(() => useAuth());
    let returned: any;

    await act(async () => {
      returned = await result.current.signIn("user@test.com", "pass");
    });

    expect(returned).toEqual({ success: true });
  });

  test("does not navigate when sign-in fails", async () => {
    mockSignIn.mockResolvedValue({ success: false } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("navigates to existing project after successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "proj-42" }] as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-42");
  });

  test("creates a new project and navigates when user has no projects", async () => {
    mockSignIn.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-proj" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/new-proj");
  });

  test("saves anonymous work to a new project and navigates after sign-in", async () => {
    const anonMessages = [{ role: "user", content: "hello" }];
    const anonFs = { "/": {}, "/App.tsx": "export default () => <div/>" };

    mockSignIn.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFs });
    mockCreateProject.mockResolvedValue({ id: "saved-proj" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages, data: anonFs })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/saved-proj");
    // Should skip getProjects when anon work is present
    expect(mockGetProjects).not.toHaveBeenCalled();
  });

  test("ignores anonymous work when messages array is empty", async () => {
    mockSignIn.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing" }] as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p");
    });

    // Falls through to existing projects path
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing");
  });

  test("sets isLoading to false even when action throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("u@t.com", "p").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe("useAuth — signUp", () => {
  test("sets isLoading to true while request is in-flight", async () => {
    let resolve!: (v: any) => void;
    mockSignUp.mockReturnValue(new Promise((r) => (resolve = r)));
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "n" } as any);

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signUp("u@t.com", "p");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => resolve({ success: false }));
    expect(result.current.isLoading).toBe(false);
  });

  test("returns the action result on failure", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email taken" } as any);

    const { result } = renderHook(() => useAuth());
    let returned: any;

    await act(async () => {
      returned = await result.current.signUp("taken@test.com", "pw");
    });

    expect(returned).toEqual({ success: false, error: "Email taken" });
  });

  test("navigates to existing project after successful sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "existing-p" }] as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "pw");
    });

    expect(mockPush).toHaveBeenCalledWith("/existing-p");
  });

  test("creates a new project and navigates when user has no projects after sign-up", async () => {
    mockSignUp.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });

  test("saves anonymous work after successful sign-up", async () => {
    const anonMessages = [{ role: "user", content: "build a button" }];
    const anonFs = { "/": {} };

    mockSignUp.mockResolvedValue({ success: true } as any);
    mockGetAnonWorkData.mockReturnValue({ messages: anonMessages, fileSystemData: anonFs });
    mockCreateProject.mockResolvedValue({ id: "from-anon" } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@test.com", "pw");
    });

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages, data: anonFs })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/from-anon");
  });

  test("does not navigate when sign-up fails", async () => {
    mockSignUp.mockResolvedValue({ success: false } as any);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("u@t.com", "p");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("sets isLoading to false even when action throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Server down"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("u@t.com", "p").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });
});
