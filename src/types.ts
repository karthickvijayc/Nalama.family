export type TimeBucket = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export interface HealthLogEntry {
  id: string;
  timestamp: string;
  displayTime: string;
  displayDate: string;
  transcript: string;
  category: 'workout' | 'meal' | 'medication' | 'event' | 'general';
  source: 'voice' | 'manual' | 'synced';
  headline?: string;
  calories?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  steps?: number;
  heartRate?: number;
  restingHeartRate?: number;
  sleepMinutes?: number;
  sleepHours?: number;
  sleepEfficiency?: number;
  weight?: number;
  timeBucket?: TimeBucket;
  processed?: boolean;
}

export type TrendMetricType = 'steps' | 'active_time' | 'heart_rate' | 'weight' | 'calories' | 'sleep' | 'tasks';

export type TrendTimeframe = 'month' | '3m' | '6m' | '12m';

export interface TrendDataPoint {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Oct 1" or "W38"
  fullDateLabel: string;
  timestamp: number;
  value: number;
  secondaryValue?: number; // e.g. consumed vs burned for calories
  target?: number;
  isEstimated?: boolean;
}

export interface TrendMetricSummary {
  metric: TrendMetricType;
  title: string;
  unit: string;
  currentValue: number | null;
  currentFormatted: string;
  averageValue: number | null;
  averageFormatted: string;
  minValue: number | null;
  minFormatted: string;
  maxValue: number | null;
  maxFormatted: string;
  targetValue: number | null;
  targetFormatted: string;
  deltaText: string;
  deltaPositive: boolean | null;
  points: TrendDataPoint[];
  hasRealData: boolean;
  hasPregeneratedData: boolean;
}

export interface MonthlyLogFile {
  id: string;
  name: string;
  month: string; // e.g. "2026-09"
}

export interface HealthLogFileContent {
  schema_version: string;
  month: string;
  logs: HealthLogEntry[];
}

export interface DigestMetricItem {
  id: string;
  type: 'activity' | 'nutrition' | 'medication' | 'vitals' | 'sleep' | 'general';
  title: string;
  value: string;
  status: string;
}

export interface CaregiverDigest {
  id: string;
  timestamp: string;
  displayDate: string;
  displayTime: string;
  status: 'good' | 'attention';
  status_label: string;
  summary: string;
  metrics: DigestMetricItem[];
}

export interface CareDigestFileContent {
  schema_version: string;
  updated_at: string;
  profile_name?: string;
  latest_digest: CaregiverDigest | null;
  history: CaregiverDigest[];
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  sharedEmail?: string;
  sharedDriveFolderId?: string;
  sharedDriveFileId?: string;
  isPrimary?: boolean;
  addedAt: string;
}

export interface UserTargets {
  calories?: number;
  activeTimeMins?: number;
  restingHeartRate?: number;
  weight?: string;
  steps?: number;
  rationale?: string;
}

export interface UserProfile {
  // Read-only from Google Drive sign-in
  email?: string;
  displayName?: string;
  photoURL?: string;

  // Additional customizable profile fields for LLMs
  nickname?: string;
  age?: number | string;
  gender?: string;
  height?: string;
  weight?: string;
  lifestyle?: string;
  
  // Useful context for LLM medical/wellness recommendations
  dietaryPreference?: string;
  healthGoals?: string;
  primaryLanguage?: string;
  notes?: string;
  updatedAt?: string;
  userTargets?: UserTargets;
  aiTargets?: UserTargets;

  // Custom Bring-Your-Own Gemini API Key
  customGeminiApiKey?: string;

  // Intake onboarding completion flag
  isIntakeComplete?: boolean;

  // External Health & Workout Data Import Settings
  enableExternalDataImport?: boolean;
  lastImportSyncTimestamp?: string;
  lastImportSyncStatus?: 'success' | 'error' | 'idle';
  lastImportSyncSummary?: string;
  lastImportFileHashes?: Record<string, string>;
}

export interface DriveState {
  token: string;
  mainFolderId: string;
  familyFolderId: string;
  contextFileId: string;
  currentLogsFileId?: string;
  currentLogsFileName?: string;
  digestFileId?: string;
  logsFileId?: string; // Kept for backward compatibility
  importsFolderId?: string;
  healthImportsFolderId?: string;
  workoutImportsFolderId?: string;
}


export interface Routine {
  id: string;
  category: 'workout' | 'meal' | 'medication' | 'event' | 'general';
  title: string;
  frequency: 'daily' | 'weekly' | 'specific_days';
  daysOfWeek?: string[]; // e.g., ["Monday", "Wednesday"]
  timeBucket?: TimeBucket;
  instructions?: string;
  active: boolean;
}

export interface HealthFact {
  id: string;
  category: 'medical' | 'diet' | 'fitness' | 'routine';
  text: string;
  source: string;
  addedAt: string;
  expiresAt: string | null;
  frequency?: string;
  timeBucket?: TimeBucket;
}

export type CoachingRoomId = 'workout' | 'diet' | 'medical' | 'reflection';

export interface CoachingUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface CoachingMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  tokens?: number;
}

export interface CoachingRoomState {
  roomId: CoachingRoomId;
  title: string;
  subtitle: string;
  messages: CoachingMessage[];
}
