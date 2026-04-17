# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

UIGen is an AI-powered React component generator with live preview. Users describe components in natural language, and Claude generates/modifies them in a virtual file system. A live iframe preview updates in real time. Projects can be persisted for authenticated users via SQLite.

## Commands

```bash
npm run setup        # First-time setup: install + Prisma generate + migrate
npm run dev          # Dev server (Turbopack) at http://localhost:3000
npm run dev:daemon   # Dev server as background daemon (logs → logs.txt)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest test suite
npm run db:reset     # Wipe and reset the SQLite database
```

**Running a single test file:**

```bash
npx vitest src/lib/__tests__/file-system.test.ts
```

## Development Best Practices

Add comments to every piece of code — the codebase should be easy for a beginner to understand.

## Environment

Copy `.env.example` to `.env` and set:

- `ANTHROPIC_API_KEY` — if absent, falls back to a mock provider that returns static example components
- `JWT_SECRET` — defaults to `"development-secret-key"` if absent

Database: SQLite at `prisma/dev.db`, managed by Prisma. The full database schema is defined in the @prisma/schema.prisma file— reference it to understand the structure of stored data.

## Architecture

### Request Flow

1. User types in `ChatInterface` → sends to `POST /api/chat`
2. `src/app/api/chat/route.ts` calls Claude (via Vercel AI SDK) with two tools:
   - `str_replace_editor` — creates or patches files (in `src/lib/tools/str-replace.ts`)
   - `file_manager` — renames/deletes files (in `src/lib/tools/file-manager.ts`)
3. Tool calls update the virtual file system (`src/lib/file-system.ts`) — in-memory only, no disk writes
4. `FileSystemProvider` (context) detects changes → triggers preview re-render
5. `PreviewFrame` transpiles JSX via Babel in an iframe with a custom import map
6. For authenticated users, message history + serialized FS are persisted to SQLite via Prisma server actions

### Key Modules

| Path                                       | Role                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| `src/app/api/chat/route.ts`                | Streams AI response, wires tools to virtual FS                |
| `src/lib/file-system.ts`                   | In-memory virtual FS class (create/read/update/delete/rename) |
| `src/lib/provider.ts`                      | Returns real Claude model or mock provider                    |
| `src/lib/transform/jsx-transformer.ts`     | Converts JSX component files → runnable HTML for iframe       |
| `src/lib/prompts/generation.tsx`           | System prompt injected into every chat request                |
| `src/lib/contexts/chat-context.tsx`        | Chat message state; wraps Vercel AI SDK `useChat`             |
| `src/lib/contexts/file-system-context.tsx` | FS state shared across editor, preview, and API handler       |
| `src/lib/auth.ts`                          | JWT session helpers (jose + bcrypt)                           |
| `src/actions/`                             | Server actions for auth (sign in/up) and project CRUD         |
| `src/middleware.ts`                        | Protects `/api/projects` and `/api/filesystem` routes         |

### UI Layout (`src/app/main-content.tsx`)

Three-panel resizable layout:

- **Left:** `ChatInterface` (messages + input)
- **Right top:** `PreviewFrame` iframe (default view) or `CodeEditor` (Monaco)
- **Right bottom (code view):** `FileTree` + editor

### Data Persistence

Projects store two JSON blobs in SQLite: `messages` (chat history) and `fileSystem` (serialized virtual FS snapshot). Anonymous sessions use ephemeral in-memory state only.

### Prompt Caching

The system prompt in `src/lib/prompts/generation.tsx` uses `providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } }` for prompt caching — don't remove this.

## Tech Stack

- **Next.js 15** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS v4**, Radix UI primitives
- **Vercel AI SDK** (`useChat`, `streamText`)
- **Claude Haiku 4.5** as the default model
- **Monaco Editor** for code editing
- **Prisma** + SQLite for persistence
- **Vitest** + React Testing Library for tests
- Path alias: `@/*` → `src/*`
