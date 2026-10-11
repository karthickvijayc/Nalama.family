# Workspace Rules & Context (Nalama.family)

## Project Overview
Nalama.family is a privacy-first, zero-database health and longevity companion tailored for South Asian families and senior members (60+).

## Core Directives & Memory

### 1. Auto-Push After Validated Changes
- **Requirement**: Every successful code change post-validation MUST be automatically committed and pushed to git (`origin/main` or the active working branch).
- **Validation Checklist**:
  1. Lint & Type Check: `cmd /c "npm run lint"` (`tsc --noEmit`).
  2. Production Build: `cmd /c "npm run build"` (when UI/server code is modified).
  3. Git Operations: Stage changed files (`git add -A`), commit with a descriptive conventional message (`feat:`, `fix:`, `chore:`, etc.), and execute `git push origin <branch>`.

### 2. Execution Environment (Windows Shell)
- The host OS is Windows with PowerShell. Always prefix npm and git commands with `cmd /c` to avoid PowerShell script execution policy errors (e.g., `cmd /c "npm run lint"`, `cmd /c "git status"`).

### 3. Architecture & Privacy Principles
- **Zero-Database Model**: User data is strictly stored on the user's private Google Drive (App Data folder or user-designated drive folder).
- **Senior & Caregiver Simplicity**:
  - Keep interfaces clean, calm, and high-contrast.
  - Default Calm Mode for users aged 60+.
  - Hide complex telemetry, raw token saturation meters, and developer tools behind layered/discreet settings (e.g., 5-tap version unlock).
  - Provide easy, 1-tap sharing flows (e.g., WhatsApp summary export) alongside background cloud sync.
