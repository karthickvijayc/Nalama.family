import { MonthlyLogFile, CaregiverDigest, CareDigestFileContent, UserProfile } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export async function findFileOrFolder(token: string, name: string, mimeType?: string, parentId?: string) {
  let q = `name='${name}' and trashed=false`;
  if (mimeType) {
    q += ` and mimeType='${mimeType}'`;
  }
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }
  
  const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  console.log('Querying Drive:', url);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Drive API Error:', res.status, errorText);
      throw new Error(`Drive API returned ${res.status}: ${errorText}`);
    }
    
    const data = await res.json();
    return data.files && data.files.length > 0 ? data.files[0].id : null;
  } catch (err: any) {
    console.error('Fetch error in findFileOrFolder:', err);
    throw err;
  }
}

export async function createFolder(token: string, name: string, parentId?: string) {
  const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  
  try {
    const res = await fetch(DRIVE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Drive API Error:', res.status, errorText);
      throw new Error(`Failed to create folder ${name}: ${errorText}`);
    }
    const data = await res.json();
    return data.id;
  } catch (err: any) {
    console.error('Fetch error in createFolder:', err);
    throw err;
  }
}

export async function findOrCreateFolder(token: string, name: string, parentId?: string) {
  let id = await findFileOrFolder(token, name, 'application/vnd.google-apps.folder', parentId);
  if (!id) {
    id = await createFolder(token, name, parentId);
  }
  return id;
}

export async function readJsonFile(token: string, fileId: string) {
  try {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 404) return null;
      const errorText = await res.text();
      throw new Error(`Failed to read file ${fileId}: ${errorText}`);
    }
    
    return await res.json();
  } catch (err: any) {
    console.warn('Error reading JSON file, returning null:', err);
    return null;
  }
}

export async function writeJsonFile(token: string, name: string, content: any, parentId: string, existingFileId?: string) {
  try {
    if (existingFileId) {
      // Just update the content using simple media upload
      const res = await fetch(`${UPLOAD_API}/${existingFileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content, null, 2)
      });
      if (!res.ok) {
        // If file not found (404), fall back gracefully to creating a new file
        if (res.status === 404) {
          console.warn(`File ${existingFileId} not found during update, creating new file ${name} instead.`);
          return await writeJsonFile(token, name, content, parentId);
        }
        const errorText = await res.text();
        throw new Error(`Failed to update file ${existingFileId}: ${errorText}`);
      }
      return existingFileId;
    } else {
      // 1. Create file metadata first
      const metaRes = await fetch(DRIVE_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/json',
          parents: [parentId]
        })
      });
      
      if (!metaRes.ok) {
        const errorText = await metaRes.text();
        throw new Error(`Failed to create file metadata for ${name}: ${errorText}`);
      }
      
      const metaData = await metaRes.json();
      
      // 2. Upload the actual content to the newly created file ID
      const uploadRes = await fetch(`${UPLOAD_API}/${metaData.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content, null, 2)
      });
      
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Failed to upload content to ${metaData.id}: ${errorText}`);
      }
      
      return metaData.id;
    }
  } catch (err: any) {
    console.error('Fetch error in writeJsonFile:', err);
    throw err;
  }
}

// --- Monthly Log Partitioning Helpers ---

/**
 * Returns the standardized monthly filename, e.g. "logs_2026_09.json"
 */
export function getMonthlyLogFileName(date = new Date()): { fileName: string; monthKey: string; displayMonth: string } {
  const year = date.getFullYear();
  const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
  const monthKey = `${year}-${monthNumber}`;
  const fileName = `logs_${year}_${monthNumber}.json`;
  const displayMonth = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { fileName, monthKey, displayMonth };
}

/**
 * Finds or automatically initializes the monthly partitioned log file in Google Drive.
 */
export async function getOrCreateMonthlyLogFile(
  token: string, 
  mainFolderId: string, 
  date = new Date()
): Promise<{ fileId: string; fileName: string; monthKey: string; isNew: boolean }> {
  const { fileName, monthKey } = getMonthlyLogFileName(date);
  
  // Look for existing monthly partition
  let fileId = await findFileOrFolder(token, fileName, 'application/json', mainFolderId);
  
  if (fileId) {
    return { fileId, fileName, monthKey, isNew: false };
  }

  // Create new partition with standard header
  const initialContent = {
    schema_version: "1.0",
    month: monthKey,
    created_at: new Date().toISOString(),
    logs: []
  };

  fileId = await writeJsonFile(token, fileName, initialContent, mainFolderId);
  return { fileId, fileName, monthKey, isNew: true };
}

/**
 * Lists all available monthly log files in user's Drive folder, sorted latest first.
 */
export async function listMonthlyLogFiles(token: string, mainFolderId: string): Promise<MonthlyLogFile[]> {
  try {
    const q = `'${mainFolderId}' in parents and name contains 'logs_' and mimeType='application/json' and trashed=false`;
    const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=name desc&spaces=drive`;
    
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.files) return [];

    return data.files.map((f: any) => {
      // Extract YYYY-MM from logs_YYYY_MM.json
      const match = f.name.match(/logs_(\d{4})_(\d{2})\.json/);
      const month = match ? `${match[1]}-${match[2]}` : f.name;
      return {
        id: f.id,
        name: f.name,
        month
      };
    });
  } catch (err) {
    console.warn('Failed to list monthly log files:', err);
    return [];
  }
}

// --- Caregiver Digest Storage Helpers ---

const CARE_DIGEST_FILENAME = 'care_digest.json';

/**
 * Finds or initializes the care_digest.json file in the /nalama.family/family_share folder.
 */
export async function getOrCreateCareDigestFile(
  token: string,
  familyFolderId: string,
  profileName?: string
): Promise<{ fileId: string; data: CareDigestFileContent }> {
  let fileId = await findFileOrFolder(token, CARE_DIGEST_FILENAME, 'application/json', familyFolderId);
  
  if (fileId) {
    const existing = await readJsonFile(token, fileId);
    if (existing && existing.schema_version) {
      return { fileId, data: existing as CareDigestFileContent };
    }
  }

  const initialContent: CareDigestFileContent = {
    schema_version: '1.0',
    updated_at: new Date().toISOString(),
    profile_name: profileName || 'Family Member',
    latest_digest: null,
    history: []
  };

  fileId = await writeJsonFile(token, CARE_DIGEST_FILENAME, initialContent, familyFolderId, fileId || undefined);
  return { fileId, data: initialContent };
}

/**
 * Appends a new Caregiver Digest into the timeline and updates latest_digest.
 */
export async function appendCaregiverDigest(
  token: string,
  familyFolderId: string,
  fileId: string,
  newDigest: CaregiverDigest,
  profileName?: string
): Promise<CareDigestFileContent> {
  const existingData = (await readJsonFile(token, fileId)) || {
    schema_version: '1.0',
    updated_at: new Date().toISOString(),
    profile_name: profileName,
    latest_digest: null,
    history: []
  };

  // Prepend to history (latest first) and keep up to 30 past digests
  const updatedHistory = [newDigest, ...(existingData.history || [])].slice(0, 30);
  
  const updatedContent: CareDigestFileContent = {
    schema_version: '1.0',
    updated_at: new Date().toISOString(),
    profile_name: profileName || existingData.profile_name,
    latest_digest: newDigest,
    history: updatedHistory
  };

  await writeJsonFile(token, CARE_DIGEST_FILENAME, updatedContent, familyFolderId, fileId);
  return updatedContent;
}

/**
 * Updates the profile name in care_digest.json.
 */
export async function updateCaregiverProfileName(
  token: string,
  familyFolderId: string,
  fileId: string,
  newProfileName: string
): Promise<CareDigestFileContent> {
  const existingData = (await readJsonFile(token, fileId)) || {
    schema_version: '1.0',
    updated_at: new Date().toISOString(),
    profile_name: newProfileName,
    latest_digest: null,
    history: []
  };

  const updatedContent: CareDigestFileContent = {
    ...existingData,
    profile_name: newProfileName,
    updated_at: new Date().toISOString()
  };

  try {
    await writeJsonFile(token, CARE_DIGEST_FILENAME, updatedContent, familyFolderId, fileId);
  } catch (err) {
    console.warn('Could not write profile name update to Drive (may be read-only):', err);
  }
  return updatedContent;
}

// --- Permissions API ---

export async function getFolderPermissions(token: string, folderId: string) {
  try {
    const res = await fetch(`${DRIVE_API}/${folderId}/permissions?fields=permissions(id,emailAddress,role,type)`, {
      headers: { 
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to fetch permissions: ${errorText}`);
    }
    const data = await res.json();
    return data.permissions || [];
  } catch (err: any) {
    console.error('Fetch error in getFolderPermissions:', err);
    throw err;
  }
}

export async function addFolderPermission(token: string, folderId: string, emailAddress: string) {
  try {
    const res = await fetch(`${DRIVE_API}/${folderId}/permissions?sendNotificationEmail=true`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        type: 'user',
        role: 'reader',
        emailAddress
      })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to add permission: ${errorText}`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Fetch error in addFolderPermission:', err);
    throw err;
  }
}

export async function removeFolderPermission(token: string, folderId: string, permissionId: string) {
  try {
    const res = await fetch(`${DRIVE_API}/${folderId}/permissions/${permissionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to remove permission: ${errorText}`);
    }
  } catch (err: any) {
    console.error('Fetch error in removeFolderPermission:', err);
    throw err;
  }
}

/**
 * Loads family members stored in context_memory.json in user's Drive.
 */
export async function getFamilyMembersFromDrive(token: string, contextFileId: string) {
  try {
    const context = await readJsonFile(token, contextFileId);
    if (context && Array.isArray(context.family_members)) {
      return context.family_members;
    }
    return [];
  } catch (err) {
    console.warn('Could not read family members from Drive:', err);
    return [];
  }
}

/**
 * Saves updated family members list to context_memory.json in user's Drive.
 */
export async function saveFamilyMembersToDrive(token: string, contextFileId: string, members: any[]) {
  try {
    const context = (await readJsonFile(token, contextFileId)) || {
      schema_version: '1.0',
      facts: [],
      family_members: []
    };
    const updated = {
      ...context,
      family_members: members,
      updated_at: new Date().toISOString()
    };
    await writeJsonFile(token, 'context_memory.json', updated, undefined, contextFileId);
    return updated;
  } catch (err) {
    console.error('Failed to save family members to Drive:', err);
    throw err;
  }
}

/**
 * Searches Google Drive for any care_digest.json files accessible to this user
 * (e.g. shared by elder parents or relatives).
 */
export async function searchSharedCareDigests(token: string) {
  try {
    const query = encodeURIComponent("name = 'care_digest.json' and trashed = false");
    const url = `${DRIVE_API}?q=${query}&fields=files(id,name,owners,sharingUser,modifiedTime,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn('Could not search shared care digests:', err);
    return [];
  }
}

/**
 * Extracts a Google Drive File or Folder ID from a raw ID or full Google Drive URL.
 */
export function extractDriveId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Match file/d/{id} or folders/{id} or id={id}
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  // Otherwise return trimmed as direct ID
  return trimmed;
}

/**
 * Loads user profile stored in context_memory.json in user's Drive.
 */
export async function getUserProfileFromDrive(token: string, contextFileId: string): Promise<UserProfile | null> {
  try {
    const context = await readJsonFile(token, contextFileId);
    if (context && context.user_profile) {
      return context.user_profile as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn('Could not read user profile from Drive:', err);
    return null;
  }
}

/**
 * Saves updated user profile to context_memory.json in user's Drive.
 */
export async function saveUserProfileToDrive(token: string, contextFileId: string, profile: UserProfile): Promise<UserProfile> {
  try {
    const context = (await readJsonFile(token, contextFileId)) || {
      schema_version: '1.0',
      facts: [],
      family_members: []
    };
    const updatedProfile: UserProfile = {
      ...profile,
      updatedAt: new Date().toISOString()
    };
    const updated = {
      ...context,
      user_profile: updatedProfile,
      updated_at: new Date().toISOString()
    };
    await writeJsonFile(token, 'context_memory.json', updated, undefined, contextFileId);
    return updatedProfile;
  } catch (err) {
    console.error('Failed to save user profile to Drive:', err);
    throw err;
  }
}

/**
 * Returns the effective user name for greetings and UI references:
 * Nickname if provided -> then Google Profile Name -> then fallback string.
 */
export function getUserDisplayName(
  profile?: UserProfile | null, 
  userFallback?: { displayName?: string | null } | null
): string {
  if (profile?.nickname && profile.nickname.trim()) {
    return profile.nickname.trim();
  }
  if (profile?.displayName && profile.displayName.trim()) {
    return profile.displayName.trim();
  }
  if (userFallback?.displayName && userFallback.displayName.trim()) {
    return userFallback.displayName.trim();
  }
  return 'Friend';
}


export async function getInsightsFromDrive(token: string, folderId: string) {
  const query = `name='weekly_insights.json' and '${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to find insights file');
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return readJsonFile(token, data.files[0].id);
  }
  return null;
}

export async function saveInsightsToDrive(token: string, folderId: string, insightsData: any) {
  const query = `name='weekly_insights.json' and '${folderId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to find insights file');
  const data = await res.json();
  const existingFileId = (data.files && data.files.length > 0) ? data.files[0].id : undefined;
  
  await writeJsonFile(token, 'weekly_insights.json', insightsData, folderId, existingFileId);
}

// --- Health & Workout Imports Google Drive Directory Helpers ---

export interface ImportFolderStructure {
  importsFolderId: string;
  healthFolderId: string;
  workoutFolderId: string;
}

/**
 * Ensures the /nalama.family/imports/ folder and its subdirectories exist:
 * - /nalama.family/imports/health_data/
 * - /nalama.family/imports/gym_workouts/
 */
export async function getOrCreateImportsFolders(token: string, mainFolderId: string): Promise<ImportFolderStructure> {
  const importsFolderId = await findOrCreateFolder(token, 'imports', mainFolderId);
  const healthFolderId = await findOrCreateFolder(token, 'health_data', importsFolderId);
  const workoutFolderId = await findOrCreateFolder(token, 'gym_workouts', importsFolderId);
  return { importsFolderId, healthFolderId, workoutFolderId };
}

export interface DriveImportFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

/**
 * Lists all importable files (.json, .csv) inside a specified folder
 */
export async function listImportFolderFiles(token: string, folderId: string): Promise<DriveImportFile[]> {
  try {
    const q = `'${folderId}' in parents and trashed = false`;
    const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc&spaces=drive`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn('Failed to list import folder files:', err);
    return [];
  }
}

/**
 * Reads raw text/content of any file in Drive (e.g., CSV or JSON)
 */
export async function readRawDriveFile(token: string, fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`Failed to read raw file ${fileId}:`, err);
    return null;
  }
}

/**
 * Reads binary content of any file in Drive as ArrayBuffer (e.g., .xlsx files)
 */
export async function readBinaryDriveFile(token: string, fileId: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${DRIVE_API}/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch (err) {
    console.warn(`Failed to read binary file ${fileId}:`, err);
    return null;
  }
}

