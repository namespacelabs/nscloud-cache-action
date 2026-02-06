# Agents

## Commands

- **Typecheck**: `npm run typecheck`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Format check**: `npm run format:check`
- **Test**: `npm test run`
- **Pre-checkin** (format + lint + typecheck + build + test): `npm run pre-checkin`

Always run `npm run typecheck`, `npm run build`, and `npm test run` after making changes to verify correctness.

When preparing a commit, run `npm run pre-checkin` to ensure formatting, linting, types, build, and tests all pass. The built `dist/` output must be committed alongside source changes.
