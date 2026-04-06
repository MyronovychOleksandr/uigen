# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup       # First-time setup: install deps, generate Prisma client, run migrations
npm run dev         # Start dev server (Turbopack)
npm run build       # Production build
npm run lint        # ESLint
npm run test        # Vitest (all tests)
npm run db:reset    # Force-reset SQLite database
```

Run a single test file:
```bash
npx vitest run src/lib/__tests__/file-system.test.ts
```

## Architecture

**UIGen** is an AI-powered React component generator with live preview. Users describe components in natural language; Claude generates code that runs in a sandboxed iframe.

### Three-Panel Layout (`src/components/main-content.tsx`)
- **Left (35%)**: Chat interface — user messages + streaming AI responses
- **Right (65%)**: Tabbed Preview (live iframe) / Code (file tree + Monaco editor)

### Request Flow
1. User types in `ChatInterface` → POST to `/api/chat/route.ts`
2. API streams Claude responses via Vercel AI SDK (`@ai-sdk/anthropic`)
3. Claude uses two tools: `str_replace_editor` (create/edit files) and `file_manager` (rename/delete)
4. Tool calls update the `VirtualFileSystem` (in-memory, no disk writes)
5. `FileSystemContext` propagates changes to the preview iframe and file tree
6. For authenticated users, sessions are persisted to SQLite via Prisma

### Key Abstractions

**VirtualFileSystem** (`src/lib/file-system.ts`): In-memory tree used both client-side and by AI tools. Serializable to JSON for DB persistence. The AI is instructed to always create `/App.jsx` as the component entrypoint.

**Language Model** (`src/lib/provider.ts`): Selects `claude-haiku-4-5` (real API) or `MockLanguageModel` (no API key). Max tokens: 10,000. Max steps: 40 (real) / 4 (mock).

**Auth** (`src/lib/auth.ts`): JWT sessions via cookies, 7-day expiry. Anonymous mode is fully supported — projects just aren't persisted.

**Generation Prompt** (`src/lib/prompts/generation.tsx`): System prompt that instructs Claude on file conventions, tool usage, and component structure.

### Database Schema (Prisma + SQLite)
- `User`: email, bcrypt-hashed password
- `Project`: name, userId (nullable for anonymous), messages (JSON), data (JSON — serialized VirtualFileSystem)

### Testing
Tests live in `__tests__` directories co-located with source. Coverage includes: `VirtualFileSystem`, `ChatContext`, `FileSystemContext`, `FileTree`, JSX transformer, and chat components.

## Conventions
- All non-library imports use the `@/` alias (maps to `./src/`)
- Styling via Tailwind CSS v4 only — no hardcoded styles
- Anthropic ephemeral cache control is enabled on the system message (cost optimization)
- Use comments sparingly. Only comment complex, non-obvious code.