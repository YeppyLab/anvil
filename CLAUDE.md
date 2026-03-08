# CLAUDE.md — Coding Agent Instructions

## Workflow

When working on a user story or feature:

1. **Create a feature branch** from `main`:
   ```
   git checkout -b feat/<us-ticket>-<short-desc>
   ```
   Example: `feat/us2-nl-to-api`

2. **Implement** the feature with clear, incremental commits.

3. **Push** the branch:
   ```
   git push -u origin feat/<branch-name>
   ```

4. **Create a PR** via `gh`:
   ```
   gh pr create --title "feat(US-X): description" --body "..." --base main
   ```

5. Mark the Notion ticket status as appropriate.

## Conventions

- **Commit messages**: `feat(US-X): ...`, `fix: ...`, `test: ...`, `chore: ...`
- **Branch naming**: `feat/usX-short-desc`, `fix/issue-desc`, `chore/desc`
- **Package manager**: Yarn v4 (`yarn` not `npm`)
- **Language**: TypeScript
- **Tests**: Jest (`yarn test`)
- **Build**: `yarn build` (tsc)

## Project Structure

```
src/
  cli/          # CLI entry point and commands
  lib/
    adapters/   # LLM provider adapters (Claude, OpenAI)
    agent/      # Core agent loop and prompts
    executor/   # HTTP request executor
    parser/     # OpenAPI/Postman parsers
    report/     # Test report generator
    tools/      # Agent tool definitions and handlers
    skills/     # Skill interfaces
  knowledge/    # Parsed API specs (generated)
```

## Key Commands

- `yarn start` — Run CLI
- `yarn dev` — Dev mode with auto-reload
- `yarn test` — Run tests
- `yarn build` — Compile TypeScript
