// This is the main API endpoint that handles all chat messages.
// When the user sends a message in the chat, the browser POSTs to /api/chat
// and this handler runs on the server.
import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
// streamText streams the AI response token-by-token so the UI updates in real time.
// appendResponseMessages merges the AI's reply back into the message history.
import { streamText, appendResponseMessages } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { generationPrompt } from "@/lib/prompts/generation";

export async function POST(req: Request) {
  // The client sends:
  //   messages   – the full conversation history so Claude has context
  //   files      – the current virtual file system, serialized as a plain object
  //   projectId  – optional; present when the user is logged in and has a saved project
  const {
    messages,
    files,
    projectId,
  }: { messages: any[]; files: Record<string, FileNode>; projectId?: string } =
    await req.json();

  // Prepend the system prompt as the very first message so Claude knows how to behave.
  // cacheControl: "ephemeral" tells Anthropic to cache this prompt in memory so we don't
  // re-process the same large system prompt on every token — saves cost and latency.
  messages.unshift({
    role: "system",
    content: generationPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  });

  // Rebuild the in-memory virtual file system from the JSON the client sent.
  // The VirtualFileSystem lives in RAM on the server for the duration of this request —
  // the AI tools read/write it, then we serialize it back to JSON at the end.
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  // maxSteps controls how many tool-call/tool-result round trips Claude can make.
  // The mock provider is simpler and would loop endlessly with 40 steps, so we cap it at 4.
  const isMockProvider = !process.env.ANTHROPIC_API_KEY;
  const result = streamText({
    model,
    messages,
    maxTokens: 10_000,
    maxSteps: isMockProvider ? 4 : 40,
    onError: (err: any) => {
      console.error(err);
    },
    // These two tools are what Claude calls to create and modify files.
    // Each tool is a function Claude can invoke by name; the execute() inside runs our code.
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
    },
    // onFinish fires once streaming is complete. We use it to persist the updated
    // conversation and file system to the database so the user can resume later.
    onFinish: async ({ response }) => {
      // Save to project if projectId is provided and user is authenticated
      if (projectId) {
        try {
          // Check if user is authenticated
          const session = await getSession();
          if (!session) {
            console.error("User not authenticated, cannot save project");
            return;
          }

          // Merge the AI's reply messages into the history we received from the client.
          // We strip the system message out first — it's injected fresh on every request.
          const responseMessages = response.messages || [];
          const allMessages = appendResponseMessages({
            messages: [...messages.filter((m) => m.role !== "system")],
            responseMessages,
          });

          // Persist the full conversation and the updated file system as JSON blobs.
          await prisma.project.update({
            where: {
              id: projectId,
              userId: session.userId, // ensures users can only update their own projects
            },
            data: {
              messages: JSON.stringify(allMessages),
              data: JSON.stringify(fileSystem.serialize()),
            },
          });
        } catch (error) {
          console.error("Failed to save project data:", error);
        }
      }
    },
  });

  // Convert the stream into an HTTP response using the Vercel AI SDK data-stream format.
  // The client's useChat hook knows how to parse this format and update state in real time.
  return result.toDataStreamResponse();
}

// Tell Next.js to allow this serverless function to run for up to 120 seconds.
// AI responses can be slow, especially when Claude makes many sequential tool calls.
export const maxDuration = 120;
