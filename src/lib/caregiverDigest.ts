import { 
  getFolderPermissions, 
  getOrCreateCareDigestFile, 
  appendCaregiverDigest, 
  getOrCreateMonthlyLogFile, 
  readJsonFile 
} from './drive';
import { getAiFetchHeaders } from './geminiApiKey';
import { CaregiverDigest, UserProfile } from '../types';

const STORAGE_HAS_CAREGIVERS_KEY = 'nalama_has_active_caregivers';

// In-memory cache for fast lookups during active sessions (5 minutes TTL)
let memoryCache: { hasCaregivers: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Checks whether the user has at least one invited caregiver on the /nalama.family/family_share folder.
 * Uses an in-memory TTL cache + localStorage mirror to minimize redundant Google Drive API round-trips.
 */
export async function hasActiveCaregivers(token: string, familyFolderId?: string): Promise<boolean> {
  if (!familyFolderId || !token) return false;

  const now = Date.now();
  if (memoryCache && now - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache.hasCaregivers;
  }

  try {
    const permissions = await getFolderPermissions(token, familyFolderId);
    // Any permission that is not the owner is an invited caregiver reader
    const hasInvited = Array.isArray(permissions) && permissions.some((p: any) => p.role !== 'owner');
    
    setCaregiversCachedStatus(hasInvited);
    return hasInvited;
  } catch (err) {
    console.warn('Could not query caregiver folder permissions from Drive, checking local cache:', err);
    try {
      return localStorage.getItem(STORAGE_HAS_CAREGIVERS_KEY) === 'true';
    } catch {
      return false;
    }
  }
}

/**
 * Updates the cached caregiver status immediately (e.g. after adding or removing a caregiver in Settings).
 */
export function setCaregiversCachedStatus(hasCaregivers: boolean): void {
  memoryCache = { hasCaregivers, timestamp: Date.now() };
  try {
    localStorage.setItem(STORAGE_HAS_CAREGIVERS_KEY, hasCaregivers ? 'true' : 'false');
  } catch (e) {
    console.warn('Failed to update localStorage caregiver status:', e);
  }
}

export interface DigestGenerationParams {
  token: string;
  familyFolderId: string;
  mainFolderId?: string;
  contextFileId?: string;
  userProfile?: UserProfile | null;
  facts?: any[];
  recentLogs?: any[];
}

/**
 * Generates and appends a caregiver digest ONLY if active caregivers exist.
 * Returns true if a digest was generated and saved, false if skipped or failed.
 */
export async function generateAndSaveCaregiverDigestIfActive(
  params: DigestGenerationParams
): Promise<boolean> {
  const { token, familyFolderId, contextFileId, mainFolderId, userProfile, facts, recentLogs } = params;
  if (!token || !familyFolderId) return false;

  const hasCaregivers = await hasActiveCaregivers(token, familyFolderId);
  if (!hasCaregivers) {
    // Solo user without caregivers - save API quota & time
    return false;
  }

  try {
    // 1. Gather facts if not provided
    let effectiveFacts = facts;
    let effectiveProfile = userProfile;
    if (!effectiveFacts && contextFileId) {
      try {
        const contextData = await readJsonFile(token, contextFileId);
        effectiveFacts = contextData?.facts || [];
        if (!effectiveProfile) effectiveProfile = contextData?.user_profile || null;
      } catch (err) {
        console.warn('Could not read context memory for caregiver digest:', err);
      }
    }

    // 2. Gather recent logs if not provided
    let effectiveLogs = recentLogs;
    if (!effectiveLogs && mainFolderId) {
      try {
        const { fileId: logFileId } = await getOrCreateMonthlyLogFile(token, mainFolderId);
        const logData = await readJsonFile(token, logFileId);
        if (logData && Array.isArray(logData.logs)) {
          effectiveLogs = logData.logs.slice(-15);
        }
      } catch (err) {
        console.warn('Could not read monthly logs for caregiver digest:', err);
      }
    }

    // 3. Request LLM digest generation
    const preferredName = effectiveProfile?.nickname || effectiveProfile?.displayName || 'Family Member';
    const res = await fetch('/api/generate-digest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAiFetchHeaders()
      },
      body: JSON.stringify({
        facts: effectiveFacts || [],
        recentLogs: effectiveLogs || [],
        profileName: preferredName,
        userProfile: effectiveProfile
      })
    });

    if (!res.ok) {
      console.warn('Caregiver digest generation returned non-OK status:', res.status);
      return false;
    }

    const { digest } = await res.json();
    if (digest) {
      const { fileId } = await getOrCreateCareDigestFile(token, familyFolderId, preferredName);
      await appendCaregiverDigest(token, familyFolderId, fileId, digest);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Non-fatal error in caregiver digest generation:', err);
    return false;
  }
}

/**
 * Ensures an initial caregiver digest exists immediately when a caregiver is added.
 * If no digest has ever been generated, creates the first digest right away so the
 * caregiver sees up-to-date reassurance upon opening Google Drive.
 */
export async function ensureInitialCaregiverDigest(
  params: DigestGenerationParams
): Promise<boolean> {
  const { token, familyFolderId, userProfile } = params;
  if (!token || !familyFolderId) return false;

  try {
    const preferredName = userProfile?.nickname || userProfile?.displayName || 'Family Member';
    const { data: existingData } = await getOrCreateCareDigestFile(token, familyFolderId, preferredName);

    // If an initial digest already exists, no need to overwrite unless requested
    if (existingData && existingData.latest_digest) {
      return true;
    }

    // Generate first digest right now
    return await generateAndSaveCaregiverDigestIfActive(params);
  } catch (err) {
    console.warn('Failed to ensure initial caregiver digest:', err);
    return false;
  }
}
