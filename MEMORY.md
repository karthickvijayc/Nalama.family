# Project Memory & Operating Guidelines

See also: [GEMINI.md](file:///c:/CodingWrkSpaces/Nalama.family/GEMINI.md)

## Core Directives

### Auto-Push After Validated Code Changes
- **Rule**: Every successful code change post-validation must be automatically pushed.
- **Workflow**:
  1. Validate code via `cmd /c "npm run lint"` and/or `cmd /c "npm run build"`.
  2. Stage changes (`cmd /c "git add -A"`).
  3. Commit with a clear conventional commit message (`cmd /c "git commit -m ..."`).
  4. Push to remote (`cmd /c "git push origin <branch>"`).

### Platform & OS Guidelines
- Windows shell: Use `cmd /c "<command>"` for node/npm/git scripts to avoid execution policy restrictions.

### Domain Principles
- Zero-database private storage on Google Drive.
- Senior-first UX with Calm Mode defaults for seniors (age 60+).
- Discreet layered settings for developer tools.
