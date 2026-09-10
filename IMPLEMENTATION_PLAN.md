# nalama.family - Implementation Plan

This document outlines the step-by-step engineering plan to transition `nalama.family` from a static UI mockup to a fully functional, Zero-Database (BYOS) Progressive Web App powered by Google Drive and Gemini.

## Phase 1: Authentication & Google Drive Infrastructure (Completed)
*The goal of this phase is to establish the foundation: securely connecting the user to their own Google Drive.*

1. **[x] Google Identity Services (GIS) Setup**
   - Implement the Google client-side OAuth flow using `@react-oauth/google` or the native GIS library.
   - Request required scopes: `https://www.googleapis.com/auth/drive.file` (allows access only to files created by the app).
2. **[x] Drive API Wrapper**
   - Create a singleton service (`src/services/drive.ts`) to handle Google Drive REST API calls.
   - Implement core operations: `findOrCreateFolder`, `readJsonFile`, `writeJsonFile`, `shareFile` (for the caregiver flow).
3. **[x] App Initialization Flow**
   - On login, check for the `/nalama.family` folder. If missing, create it.
   - Check for core files: `context_memory.json`, `care_digest.json`. Initialize with empty schemas if they don't exist.

## Phase 2: Core State & "My Health Profile" Engine (Completed)
*Connecting the UI state to the actual Google Drive JSON files.*

1. **[x] State Management**
   - Implement a React Context or a lightweight store (like Zustand) to hold the decrypted/parsed contents of `context_memory.json`.
2. **[x] Health Profile CRUD**
   - Wire up the "My Health Profile" UI to read directly from the state.
   - When a user edits, deletes, or manually adds a fact (with TTL), update the local state and asynchronously push the updated JSON string back to Google Drive via `writeJsonFile`.
3. **[x] Voice Memo Intake**
   - Wire up the central Voice Recorder button.
   - Capture audio using the Web Audio API / `MediaRecorder`.
   - Pass the audio directly to the Gemini API (using the Multimodal capabilities) to transcribe and extract health facts.

## Phase 3: The AI Voice Engine & Transcriptions (Completed & Scaled)
*Implementing the primary interface to talk to nalama.family using multimodal Gemini models and partition-aware Google Drive storage.*

1. **[x] Audio Recording API**
   - Hooked into the browser's native `MediaRecorder` API with speech filter constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`) via the central floating microphone button.
2. **[x] Server-Side Integration (`server.ts`)**
   - Built an Express API route `/api/transcribe` that accepts recorded audio blobs in `base64`.
   - Forwarded to **`gemini-2.5-flash`** using `@google/genai` with health-context system prompts to transcribe spoken notes accurately into raw text.
3. **[x] Review & Edit UX**
   - Implemented an interactive review modal allowing the user to listen back to their recording, edit the transcribed text before saving, and select category tags (`workout`, `meal`, `medication`, `event`, `general`).
4. **[x] Monthly Partitioned Storage Architecture (`logs_YYYY_MM.json`)**
   - **Monolithic `logs.json` Bottleneck Eliminated**: Because Google Drive is an object store without native append capabilities, a monolithic `logs.json` file would continuously grow, causing read/write payload latency and parsing lag.
   - **Monthly Partitioning Schema**: Health entries are partitioned by year and month into `logs_YYYY_MM.json` (e.g., `logs_2026_09.json`).
   - **Token & Size Feasibility Calculations**:
     - *Entries per month*: ~100–120 logs (averaging 3–4 daily entries per user).
     - *File payload size*: ~48 KB to 55 KB per month.
     - *Google Drive API latency*: ~150–250ms (well within single TCP window limits; ~10x faster than reading an annual monolithic file).
     - *Gemini context consumption*: ~18,000–20,000 tokens for an entire month of health interactions (< 2% of the 1,000,000 token context window of Gemini Flash).
     - *Month vs. Week Justification*: Month-level partitions keep file count manageable (12 files/year instead of 52), avoid complex cross-week calendar joins, while maintaining sub-second read/write responsiveness.
   - **[x] Historical Browsing & On-Demand Pagination**:
     - The Dashboard automatically resolves and displays the current month's partition.
     - `listMonthlyLogFiles` allows seamless on-demand access to previous monthly archives without loading the full history into memory.

## Phase 4: Autonomous Context Extraction (Completed)
*Automatically updating the Health Profile based on confirmed voice notes.*

1. **The Extraction Engine (Background Task)**
   - **Trigger**: Directly chained after the user clicks "Save" and the raw log is partitioned and saved to Drive.
   - **Task**: Server-side Gemini call using **`gemini-3.8-flash`** via `/api/extract-context`.
   - **Context**: Feeds Gemini the newly confirmed log entries along with existing facts from `context_memory.json`.
2. **JSON Structured Output**
   - Gemini reconciles, replaces, adds, or resolves facts, returning strict JSON array of facts.
3. **Automated Write-Back**
   - Automatically writes back the updated facts into `context_memory.json` in Google Drive with user feedback states.

## Phase 5: The Caregiver Digests & Remote Family Care (Completed)
*Providing real-time, privacy-safe updates to invited family members and monitoring remote loved ones.*

1. **Real-Time Chaining**
   - Chained directly into the save flow: Save raw log -> Update Profile facts -> Generate Caregiver Digest -> Push to Shared Folder (`/nalama.family/family_share/care_digest.json`).
2. **Digest Generation**
   - Server-side Gemini endpoint (`/api/generate-digest`) uses **`gemini-2.5-flash`** with strict privacy instructions (reassuring family regarding vitality, movement, nutrition, and medication adherence without exposing private indignities or clinical jargon).
3. **Digest History (Append-Only Feed)**
   - Stored in Google Drive inside the shared `/nalama.family/family_share` folder.
   - Preserves an append-only timeline of updates (latest 30 digests) with timestamps, status tags, and metric highlights.
   - Accessible via the **Family Circle** tab with live status, interactive timeline feed, on-demand refresh, and caregiver permission management.
4. **Remote Loved One Monitoring (Bi-Directional Zero-Database Link)**
   - Enabled users to connect multiple remote family members (parents, elders, spouse) by reading their shared `care_digest.json` directly from Google Drive.
   - Built automatic Drive scanner (`handleScanSharedDigests`) querying `sharedWithMe and name contains 'care_digest.json'`.
   - Provided manual file ID/URL linking fallback for instant setup.
   - Real-time status banner, summary of latest activities, and chronological digest history.

## Phase 6: Brand Identity & Dual-Accent Color Architecture (Completed)
*Harmonizing the visual hierarchy with logo-inspired Tree Green and Canopy Blue accents.*

1. **Dual-Accent Design System**
   - **`tree-*` (Emerald/Teal)**: Anchored to personal health, physical activity, workouts, and wellness vitality.
   - **`canopy-*` (Sky/Cerulean Blue, derived from logo canopy)**: Dedicated to family connection, remote caregiver monitoring, Google Drive storage synchronization, sleep recovery, and AI/LLM context badges.
2. **Component Harmonization**:
   - **Bottom Navigation**: Home & Coaching utilize active `tree-*` styling; Family tab utilizes distinct `canopy-*` active styling.
   - **Dashboard**: "Sleep Recovery" and monthly partition tags styled in `canopy-*` to clearly delineate rest/recovery from active exertion.
   - **Family Tab**: Remote Status banner, scan actions, loved one profile tabs, and empty state guides themed in refined `canopy-*` tones.
   - **Settings Tab**: Google Drive storage status card and Caregiver Access management adorned with `canopy-*` accents.

## Phase 7: The Coaching Rooms (Interactive Chat) (Completed)
*Leveraging the extracted profile data for contextual coaching.*

1. **Chat UI Integration**
   - Implemented interactive Coaching Rooms UI with 4 specialized domains:
     - **Workout & Movement** (Strength, cardio, active minutes, recovery)
     - **Nutrition & Diet** (Calorie distribution, mindful meals, hydration)
     - **Medical & Wellness** (Medications, vitals awareness, doctor visit prep)
     - **Mindful Recovery** (Sleep hygiene, stress balance, routine consistency)
   - Integrated room selection grid, ambient gradients, room-specific badge metadata, and quick suggested prompt chips.
   - Built conversational message stream with auto-scrolling, clear timestamps, role indicators, and loading feedback.

2. **Context-Aware Prompting & Server-Side Security**
   - Created `/api/coaching-chat` server endpoint integrating `@google/genai` with model fallback (`gemini-3.8-flash` -> `gemini-3.1-flash-lite` -> `gemini-flash-latest`).
   - Injects verified non-expired health facts from `context_memory.json`, user baseline targets (calories, active minutes, weight, heart rate), and recent 14-day activity logs into system instructions.
   - Grounded responses provide actionable, multilingual, and personalized coaching without exposing API keys.

## Phase 8: External Health & Gym Workout Data Integration (Completed)
*Designing canonical translation targets and multi-source ingestion for Health Connect, Android Health Exporter, and Gym Apps.*

1. **[x] Architectural Design & Master Roadmap Documented**
   - Published comprehensive master document: `HEALTH_AND_WORKOUT_INTEGRATION_PLAN.md`.
   - Defined the Canonical Translation Target schemas (`health_biometrics_daily.json` and `workout_sessions_granular.json`) optimized for sub-second ingestion and deep LLM context reasoning.
2. **[x] Multi-Source Ingestion & Spreadsheet Parser**
   - Built universal parser engine (`src/lib/importers/parser.ts`) supporting:
     - Canonical JSON (`CanonicalHealthExport`, `CanonicalWorkoutExport`).
     - Multi-sheet Excel workbooks (`.xlsx`, `.xls`) via `xlsx` package for Health Data Exporter (`Activity`, `Body Measurements`, `Sleep`, `Vitals`) and Hevy (`Workout_Sessions`, `Exercise_Sets_Log`).
     - Standard CSV exports from Health Connect, Samsung Health, Apple Health Auto-Export, Hevy, Strong, and FitNotes.
3. **[x] Google Drive Storage & Partition Integration**
   - Automated provisioning of `/nalama.family/imports/health_data/` and `/nalama.family/imports/gym_workouts/` in Google Drive.
   - Built `syncEngine.ts` to scan Drive folders on app startup or manual trigger, deduplicate records against monthly partitions (`logs_YYYY_MM.json`), and preserve Zero-Database BYOS integrity.
4. **[x] Interactive Settings Toggle, Sync Trigger & In-App Developer Guide**
   - Added **"Enable External Health & Workout Data Import"** toggle in Settings.
   - Added manual **"Sync & Ingest New Data Now"** button with live status and non-intrusive floating sync banner (`SyncFloatingBanner.tsx`).
   - Integrated full **Developer & Schema Guide** (`DeveloperGuide.tsx`) with copyable JSON schemas and a turnkey Google Apps Script template for external Tasker/Sheets automations.
5. **[x] LLM Contextual Overload & Recovery Insights**
   - Enhanced `/api/extract-context` to automatically detect resistance benchmarks (PRs, top sets, volume), sleep architecture, and biometric baselines.
   - Grounded the Coaching Rooms (`Workout & Movement`, `Mindful Recovery`, `Nutrition`, `Medical`) with exercise set logs, RPE, volume, and sleep stage analysis.

