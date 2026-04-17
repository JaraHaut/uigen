"use client";

import { Loader2 } from "lucide-react";
import type { ToolInvocation } from "ai";

// Extracts just the filename from a full path, e.g. "/src/components/Card.tsx" → "Card.tsx"
function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

// Converts raw tool name + args into a human-readable label shown in the chat badge.
// Exported so it can be unit-tested independently from the component.
export function getToolLabel(toolInvocation: ToolInvocation): string {
  const { toolName, args } = toolInvocation;

  if (toolName === "str_replace_editor" && args) {
    const { command, path } = args as { command: string; path: string };
    const file = basename(path ?? "");

    if (command === "create") return `Creating ${file}`;
    if (command === "str_replace" || command === "insert") return `Editing ${file}`;
  }

  if (toolName === "file_manager" && args) {
    const { command, path, new_path } = args as {
      command: string;
      path: string;
      new_path?: string;
    };
    const file = basename(path ?? "");

    if (command === "delete") return `Deleting ${file}`;
    if (command === "rename" && new_path) {
      return `Renaming ${file} → ${basename(new_path)}`;
    }
  }

  // Fallback: show raw tool name so nothing is ever blank
  return toolName;
}

interface ToolCallBadgeProps {
  toolInvocation: ToolInvocation;
}

// Renders a small badge showing what file operation the AI is performing.
// Shows a spinner while the call is in-progress, and a green dot once it completes.
export function ToolCallBadge({ toolInvocation }: ToolCallBadgeProps) {
  const label = getToolLabel(toolInvocation);
  const isDone = toolInvocation.state === "result";

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs font-mono border border-neutral-200">
      {isDone ? (
        // Green dot indicates the tool call completed successfully
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        // Animated spinner while the file is being created or edited
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
