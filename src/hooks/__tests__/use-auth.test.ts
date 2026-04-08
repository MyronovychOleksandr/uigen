import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignIn = vi.mocked(signInAction);
const mockSignUp = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

const SUCCESS = { success: true };
const FAILURE = { success: false, error: "Invalid credentials" };

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-project-id" } as any);
  });

  test("initializes with isLoading false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });

  describe("signIn", () => {
    test("sets isLoading true during execution and false after", async () => {
      let resolveSignIn!: (value: any) => void;
      mockSignIn.mockReturnValue(new Promise((res) => (resolveSignIn = res)));

      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.signIn("user@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn(FAILURE);
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("returns the result from signInAction", async () => {
      mockSignIn.mockResolvedValue(FAILURE);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signIn("user@example.com", "wrong");
      });

      expect(returnValue).toEqual(FAILURE);
    });

    test("calls signInAction with provided credentials", async () => {
      mockSignIn.mockResolvedValue(FAILURE);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "mypassword");
      });

      expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "mypassword");
    });

    test("does not navigate on failed sign in", async () => {
      mockSignIn.mockResolvedValue(FAILURE);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "wrong");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("resets isLoading to false even when signInAction throws", async () => {
      mockSignIn.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "password").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    describe("post sign-in navigation", () => {
      test("creates project from anon work and navigates when anon messages exist", async () => {
        mockSignIn.mockResolvedValue(SUCCESS);
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ id: "1", role: "user", content: "Hello" }],
          fileSystemData: { "/App.jsx": { type: "file", content: "export default () => <div/>" } },
        });
        mockCreateProject.mockResolvedValue({ id: "anon-project-id" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from "),
          messages: [{ id: "1", role: "user", content: "Hello" }],
          data: { "/App.jsx": { type: "file", content: "export default () => <div/>" } },
        });
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
        expect(mockGetProjects).not.toHaveBeenCalled();
      });

      test("skips anon work and fetches projects when anon messages array is empty", async () => {
        mockSignIn.mockResolvedValue(SUCCESS);
        mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
        mockGetProjects.mockResolvedValue([{ id: "existing-id" }] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password");
        });

        expect(mockCreateProject).not.toHaveBeenCalled();
        expect(mockClearAnonWork).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/existing-id");
      });

      test("navigates to first existing project when no anon work", async () => {
        mockSignIn.mockResolvedValue(SUCCESS);
        mockGetProjects.mockResolvedValue([
          { id: "first-project" },
          { id: "second-project" },
        ] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password");
        });

        expect(mockCreateProject).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/first-project");
      });

      test("creates new project and navigates when no anon work and no existing projects", async () => {
        mockSignIn.mockResolvedValue(SUCCESS);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "brand-new-id" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
        expect(mockPush).toHaveBeenCalledWith("/brand-new-id");
        expect(mockClearAnonWork).not.toHaveBeenCalled();
      });
    });
  });

  describe("signUp", () => {
    test("sets isLoading true during execution and false after", async () => {
      let resolveSignUp!: (value: any) => void;
      mockSignUp.mockReturnValue(new Promise((res) => (resolveSignUp = res)));

      const { result } = renderHook(() => useAuth());

      act(() => {
        result.current.signUp("user@example.com", "password123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp(FAILURE);
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("returns the result from signUpAction", async () => {
      const signUpFailure = { success: false, error: "Email already registered" };
      mockSignUp.mockResolvedValue(signUpFailure);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signUp("existing@example.com", "password");
      });

      expect(returnValue).toEqual(signUpFailure);
    });

    test("calls signUpAction with provided credentials", async () => {
      mockSignUp.mockResolvedValue(FAILURE);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("newuser@example.com", "securepass");
      });

      expect(mockSignUp).toHaveBeenCalledWith("newuser@example.com", "securepass");
    });

    test("does not navigate on failed sign up", async () => {
      mockSignUp.mockResolvedValue(FAILURE);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("user@example.com", "pass");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("resets isLoading to false even when signUpAction throws", async () => {
      mockSignUp.mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("user@example.com", "password").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    describe("post sign-up navigation", () => {
      test("creates project from anon work and navigates when anon messages exist", async () => {
        mockSignUp.mockResolvedValue(SUCCESS);
        mockGetAnonWorkData.mockReturnValue({
          messages: [{ id: "1", role: "user", content: "Make a button" }],
          fileSystemData: { "/App.jsx": { type: "file", content: "" } },
        });
        mockCreateProject.mockResolvedValue({ id: "signup-anon-project" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringContaining("Design from "),
          messages: [{ id: "1", role: "user", content: "Make a button" }],
          data: { "/App.jsx": { type: "file", content: "" } },
        });
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/signup-anon-project");
        expect(mockGetProjects).not.toHaveBeenCalled();
      });

      test("creates new project and navigates when no anon work and no existing projects", async () => {
        mockSignUp.mockResolvedValue(SUCCESS);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "fresh-project-id" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("brand-new@example.com", "password");
        });

        expect(mockCreateProject).toHaveBeenCalledWith({
          name: expect.stringMatching(/^New Design #\d+$/),
          messages: [],
          data: {},
        });
        expect(mockPush).toHaveBeenCalledWith("/fresh-project-id");
      });

      test("navigates to first existing project when no anon work", async () => {
        mockSignUp.mockResolvedValue(SUCCESS);
        mockGetProjects.mockResolvedValue([{ id: "existing-project" }] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("user@example.com", "password");
        });

        expect(mockCreateProject).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/existing-project");
      });
    });
  });
});