# Developer Guide: Smart-Codebase (Refactored)

This guide provides an overview of the SKILL-centric architecture for Smart-Codebase.

## Architecture Overview

The plugin is designed to be lightweight and agent-driven.

- **`src/index.ts`**: Plugin entry point. Registers the `sc-update` command and context injector hooks.
- **`src/commands/update.ts`**: Implements the `/sc-update` command. It triggers the skill update process.
- **`src/extraction/skill-updater.ts`**: The core logic for knowledge extraction. It creates a child AI session and provides it with a specialized system prompt.
- **`src/extraction/system-prompt.ts`**: Defines the system prompt that guides the child AI agent to autonomously read, analyze, and update SKILL files.
- **`src/hooks/context-injector.ts`**: Injects a prompt into new sessions to help the AI discover the project's SKILL files.
- **`src/utils/skill-helpers.ts`**: Utility functions for managing SKILL file names and paths.

## Key Design Decisions

1. **AI-Agentic Extraction**: Instead of the plugin code trying to parse conversations and write markdown, it delegates this to a child AI session. This agent has full access to project files and conversation history, allowing it to autonomously organize knowledge.
2. **SKILL-Centric Storage**: All knowledge is stored in `.opencode/skills/<project>/` using the standard OpenCode SKILL format. This ensures that the knowledge is automatically discoverable by any OpenCode session.
3. **Single Manual Command**: We replaced multiple complex commands with a single `/sc-update` command. This gives users total control over when extraction happens and reduces background noise.
4. **Minimal Configuration**: The configuration is stripped down to 3 essential fields: `enabled`, `extractionModel`, and `extractionMaxTokens`.

## How sc-update Works

When you run `/sc-update [focus?]`:
1. The plugin retrieves the current session's message history.
2. It builds a text-based summary of the conversation.
3. It creates a child AI session (a sub-session of your current one).
4. The child AI is given a specialized system prompt and a set of tools (`read`, `write`, `edit`, `glob`, `grep`, `bash`).
5. The child AI autonomously:
   - Reads existing `SKILL.md` and `reference/*.md` files.
   - Browses source code to verify facts or understand context.
   - Writes or updates the main `SKILL.md` (frontmatter, principles, workflows).
   - Manages detailed knowledge in the `reference/` directory.
6. Once the AI completes its tasks, the child session is deleted.

## Adding Features

- **Keep it minimal**: Avoid adding background listeners or automatic triggers.
- **Agent-first**: If you need to extract new types of data, update the `system-prompt.ts` instead of writing new TypeScript logic to handle files.
- **Compatibility**: Ensure any changes to the SKILL file format remain compatible with OpenCode's auto-discovery mechanism.

## Testing

We use [Bun](https://bun.sh/) for testing.

- **`src/__tests__`**: Contains unit and integration tests.
- **Mocks**: We mock the OpenCode SDK to test command registration and child session creation without needing a live OpenCode environment.

Run tests with:
```bash
bun test
```

## Development Setup

1. **Prerequisites**: [Bun](https://bun.sh/) installed.
2. **Installation**: `bun install`
3. **Build**: `bun run build` (outputs to `dist/`)
4. **Type Check**: `bun run typecheck`
