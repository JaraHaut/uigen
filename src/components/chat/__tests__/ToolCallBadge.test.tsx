import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { getToolLabel, ToolCallBadge } from "../ToolCallBadge";
import type { ToolInvocation } from "ai";

afterEach(() => {
  cleanup();
});

// ─── getToolLabel unit tests ───────────────────────────────────────────────

// Helper to build a minimal ToolInvocation object for testing the label logic
function makeInvocation(
  toolName: string,
  args: Record<string, unknown>,
  state: "call" | "result" = "result"
): ToolInvocation {
  return { toolCallId: "test-id", toolName, args, state } as ToolInvocation;
}

test("getToolLabel: str_replace_editor create returns 'Creating <filename>'", () => {
  const label = getToolLabel(
    makeInvocation("str_replace_editor", { command: "create", path: "/src/App.tsx" })
  );
  expect(label).toBe("Creating App.tsx");
});

test("getToolLabel: str_replace_editor str_replace returns 'Editing <filename>'", () => {
  const label = getToolLabel(
    makeInvocation("str_replace_editor", { command: "str_replace", path: "/src/Button.tsx" })
  );
  expect(label).toBe("Editing Button.tsx");
});

test("getToolLabel: str_replace_editor insert returns 'Editing <filename>'", () => {
  const label = getToolLabel(
    makeInvocation("str_replace_editor", { command: "insert", path: "/src/utils.ts" })
  );
  expect(label).toBe("Editing utils.ts");
});

test("getToolLabel: file_manager delete returns 'Deleting <filename>'", () => {
  const label = getToolLabel(
    makeInvocation("file_manager", { command: "delete", path: "/src/old.tsx" })
  );
  expect(label).toBe("Deleting old.tsx");
});

test("getToolLabel: file_manager rename returns 'Renaming a → b'", () => {
  const label = getToolLabel(
    makeInvocation("file_manager", {
      command: "rename",
      path: "/src/a.tsx",
      new_path: "/src/b.tsx",
    })
  );
  expect(label).toBe("Renaming a.tsx → b.tsx");
});

test("getToolLabel: unknown tool falls back to raw tool name", () => {
  const label = getToolLabel(makeInvocation("some_unknown_tool", {}));
  expect(label).toBe("some_unknown_tool");
});

// ─── ToolCallBadge component tests ────────────────────────────────────────

test("ToolCallBadge shows label text", () => {
  const invocation = makeInvocation("str_replace_editor", {
    command: "create",
    path: "/src/Card.tsx",
  });
  render(<ToolCallBadge toolInvocation={invocation} />);
  expect(screen.getByText("Creating Card.tsx")).toBeDefined();
});

test("ToolCallBadge shows green dot when state is 'result'", () => {
  const invocation = makeInvocation(
    "str_replace_editor",
    { command: "create", path: "/src/Card.tsx" },
    "result"
  );
  const { container } = render(<ToolCallBadge toolInvocation={invocation} />);
  // Green dot is a div with the emerald-500 class
  const greenDot = container.querySelector(".bg-emerald-500");
  expect(greenDot).toBeTruthy();
});

test("ToolCallBadge shows spinner when state is 'call'", () => {
  const invocation = makeInvocation(
    "str_replace_editor",
    { command: "create", path: "/src/Card.tsx" },
    "call"
  );
  const { container } = render(<ToolCallBadge toolInvocation={invocation} />);
  // Spinner has the animate-spin class from Lucide's Loader2 icon
  const spinner = container.querySelector(".animate-spin");
  expect(spinner).toBeTruthy();
});
