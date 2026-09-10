import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Activity, 
  Moon, 
  HeartPulse, 
  UserPlus, 
  AlertTriangle, 
  RefreshCw, 
  Clock, 
  Users, 
  CheckCircle2, 
  Utensils, 
  Dumbbell, 
  Pill, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Mail,
  Pencil,
  Plus,
  Trash2,
  Check,
  Search,
  FolderOpen,
  Link,
  ExternalLink,
  Wifi
} from 'lucide-react';
import { User } from 'firebase/auth';
import { DriveState, CaregiverDigest, CareDigestFileContent, DigestMetricItem, FamilyMember } from '../types';
import { 
  readJsonFile, 
  getFamilyMembersFromDrive,
  saveFamilyMembersToDrive,
  searchSharedCareDigests,
  extractDriveId
} from '../lib/drive';

interface FamilyProps {
  driveState?: DriveState | null;
  user?: User | null;
  refreshTrigger?: number;
  onOpenSettings?: () => void;
}

const STORAGE_PROFILES_KEY = 'nalama_caregiver_profiles';

export default function Family({ driveState, user, refreshTrigger }: FamilyProps) {
  // Remote family members list
  const [profiles, setProfiles] = useState<FamilyMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Could not parse saved profiles:', e);
    }
    return [];
  });

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  const [digestContent, setDigestContent] = useState<CareDigestFileContent | null>(null);
  const [digestFileId, setDigestFileId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Rename modal state
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [editingRelationValue, setEditingRelationValue] = useState('Parent');
  const [isSavingName, setIsSavingName] = useState(false);

  // Add Remote Member modal state
  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRelation, setNewMemberRelation] = useState('Mother');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberFileId, setNewMemberFileId] = useState('');
  const [isScanningDrive, setIsScanningDrive] = useState(false);
  const [discoveredFiles, setDiscoveredFiles] = useState<any[]>([]);

  // Link Drive File Modal for an existing member
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInputVal, setLinkInputVal] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const activeProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0] || null;

  // Persist remote profiles to localStorage & Google Drive
  const updateProfilesList = useCallback(async (newProfiles: FamilyMember[]) => {
    setProfiles(newProfiles);
    try {
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(newProfiles));
    } catch (e) {
      console.warn('Failed to save profiles to localStorage:', e);
    }
    if (driveState && driveState.contextFileId) {
      try {
        await saveFamilyMembersToDrive(driveState.token, driveState.contextFileId, newProfiles);
      } catch (err) {
        console.warn('Could not sync remote family members to Drive:', err);
      }
    }
  }, [driveState]);

  // Load family members list from Google Drive context on startup
  useEffect(() => {
    if (!driveState || !driveState.contextFileId) return;
    getFamilyMembersFromDrive(driveState.token, driveState.contextFileId).then((driveMembers) => {
      if (Array.isArray(driveMembers) && driveMembers.length > 0) {
        setProfiles(driveMembers);
        setSelectedProfileId(prev => prev || driveMembers[0].id);
        localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(driveMembers));
      }
    }).catch(err => {
      console.warn('Could not load family members from Drive:', err);
    });
  }, [driveState]);

  // Load remote care digest for the selected profile directly from their shared Google Drive file
  const loadCaregiverData = useCallback(async () => {
    if (!driveState || !activeProfile) {
      setDigestContent(null);
      setDigestFileId(null);
      return;
    }

    const targetFileId = activeProfile.sharedDriveFileId || activeProfile.sharedDriveFolderId;
    if (!targetFileId) {
      // Not connected to a shared file yet
      setDigestContent(null);
      setDigestFileId(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await readJsonFile(driveState.token, targetFileId);
      if (data && data.schema_version) {
        setDigestFileId(targetFileId);
        setDigestContent(data as CareDigestFileContent);
      } else {
        setDigestContent(null);
      }
    } catch (err) {
      console.warn('Could not load remote care digest from Drive:', err);
      setDigestContent(null);
    } finally {
      setIsLoading(false);
    }
  }, [driveState, activeProfile]);

  useEffect(() => {
    loadCaregiverData();
  }, [loadCaregiverData, refreshTrigger, selectedProfileId]);

  // Sync / Refresh remote digest from Drive
  const handleSyncRemoteDigest = async () => {
    if (!driveState || !activeProfile) return;
    const targetFileId = activeProfile.sharedDriveFileId || activeProfile.sharedDriveFolderId;
    if (!targetFileId) {
      setShowLinkModal(true);
      return;
    }

    setIsRefreshing(true);
    setSyncMessage(null);
    try {
      const data = await readJsonFile(driveState.token, targetFileId);
      if (data && data.schema_version) {
        setDigestContent(data as CareDigestFileContent);
        setSyncMessage('Synced latest remote digest');
        setTimeout(() => setSyncMessage(null), 2500);
      } else {
        alert('Could not parse care digest from the connected file. Please verify file access.');
      }
    } catch (err: any) {
      console.error('Remote sync error:', err);
      alert('Failed to sync remote care digest. Please check if your loved one still shares this file with your Google account.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Rename Profile
  const handleSaveProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const trimmed = editingNameValue.trim();
    if (!trimmed) return;

    setIsSavingName(true);
    try {
      const updatedList = profiles.map(p => 
        p.id === activeProfile.id 
          ? { ...p, name: trimmed, relationship: editingRelationValue } 
          : p
      );
      await updateProfilesList(updatedList);
      setShowEditNameModal(false);
    } catch (err) {
      console.error('Error updating profile name:', err);
    } finally {
      setIsSavingName(false);
    }
  };

  // Add Remote Loved One Profile
  const handleAddRemoteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newMemberName.trim();
    if (!trimmedName) return;

    const fileId = extractDriveId(newMemberFileId);
    const newId = `member_${Date.now()}`;
    const newMember: FamilyMember = {
      id: newId,
      name: trimmedName,
      relationship: newMemberRelation,
      sharedEmail: newMemberEmail.trim() || undefined,
      sharedDriveFileId: fileId || undefined,
      isPrimary: profiles.length === 0,
      addedAt: new Date().toISOString()
    };

    const updated = [...profiles, newMember];
    await updateProfilesList(updated);
    setSelectedProfileId(newId);
    
    // Reset form
    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberFileId('');
    setDiscoveredFiles([]);
    setShowAddProfileModal(false);
  };

  // Scan Google Drive for shared care_digest.json files
  const handleScanSharedDigests = async () => {
    if (!driveState) return;
    setIsScanningDrive(true);
    try {
      const files = await searchSharedCareDigests(driveState.token);
      setDiscoveredFiles(files);
      if (files.length === 0) {
        alert('No files named "care_digest.json" were found shared with your Google Account yet. Make sure your loved one added your email in their Nalama app.');
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanningDrive(false);
    }
  };

  // Select a discovered file from Drive scan in Add Modal
  const handleSelectDiscoveredFile = (file: any) => {
    const ownerName = file.sharingUser?.displayName || file.owners?.[0]?.displayName || 'Loved One';
    const ownerEmail = file.sharingUser?.emailAddress || file.owners?.[0]?.emailAddress || '';
    if (!newMemberName.trim()) {
      setNewMemberName(ownerName);
    }
    if (!newMemberEmail.trim() && ownerEmail) {
      setNewMemberEmail(ownerEmail);
    }
    setNewMemberFileId(file.id);
  };

  // Link Drive File to activeProfile
  const handleLinkDriveFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const fileId = extractDriveId(linkInputVal);
    if (!fileId) return;

    setIsLinking(true);
    try {
      const updatedList = profiles.map(p => 
        p.id === activeProfile.id 
          ? { ...p, sharedDriveFileId: fileId } 
          : p
      );
      await updateProfilesList(updatedList);
      setShowLinkModal(false);
      setLinkInputVal('');
      // Trigger reload
      if (driveState) {
        const data = await readJsonFile(driveState.token, fileId);
        if (data && data.schema_version) {
          setDigestFileId(fileId);
          setDigestContent(data as CareDigestFileContent);
        }
      }
    } catch (err) {
      console.error('Link file error:', err);
      alert('Could not link or read from this file ID. Please ensure your Google account has read access.');
    } finally {
      setIsLinking(false);
    }
  };

  // Delete a remote profile
  const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to remove this loved one from your Remote Care list?')) {
      return;
    }
    const remaining = profiles.filter(p => p.id !== id);
    await updateProfilesList(remaining);
    if (selectedProfileId === id) {
      setSelectedProfileId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const latestDigest = digestContent?.latest_digest;
  const historyDigests = digestContent?.history || [];
  const isConnectedToFile = Boolean(activeProfile?.sharedDriveFileId || activeProfile?.sharedDriveFolderId);

  return (
    <div className="flex flex-col gap-6 pt-8 pb-40">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                <Wifi size={12} className="text-teal-600" />
                Remote Care Only
              </span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 mt-1">
              Family Circle
            </h1>
            <p className="text-base text-stone-500 font-medium mt-0.5">
              Read-only caregiver digests synced directly from loved ones&apos; Google Drive.
            </p>
          </div>

          {profiles.length > 0 && isConnectedToFile && (
            <button
              onClick={handleSyncRemoteDigest}
              disabled={isRefreshing || !driveState}
              className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              title="Sync latest remote digest from Google Drive"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-teal-600' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Drive'}</span>
            </button>
          )}
        </div>

        {/* Sync Toast Feedback */}
        {syncMessage && (
          <div className="bg-teal-50 text-teal-800 border border-teal-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={14} className="text-teal-600 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}

        {/* Remote Loved Ones Tabs */}
        {profiles.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {profiles.map((profile) => {
              const isSelected = profile.id === selectedProfileId;
              const hasFile = Boolean(profile.sharedDriveFileId || profile.sharedDriveFolderId);

              return (
                <div 
                  key={profile.id}
                  className={`group shrink-0 py-2 px-3 rounded-2xl font-bold flex items-center gap-2 transition-all border cursor-pointer select-none ${
                    isSelected 
                      ? 'bg-stone-900 border-canopy-500 text-white shadow-sm ring-1 ring-canopy-500/40' 
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    !hasFile 
                      ? 'bg-stone-400' 
                      : latestDigest?.status === 'attention' 
                        ? 'bg-amber-400' 
                        : 'bg-canopy-400'
                  }`} />
                  <span className="text-xs truncate max-w-[130px]">{profile.name}</span>
                  {profile.relationship && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                      isSelected ? 'bg-stone-800 text-stone-300' : 'bg-stone-100 text-stone-500'
                    }`}>
                      {profile.relationship}
                    </span>
                  )}

                  {/* Edit Name Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProfileId(profile.id);
                      setEditingNameValue(profile.name);
                      setEditingRelationValue(profile.relationship || 'Parent');
                      setShowEditNameModal(true);
                    }}
                    className={`p-1 rounded-lg transition-colors ${
                      isSelected 
                        ? 'text-stone-300 hover:text-white hover:bg-white/10' 
                        : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                    }`}
                    title="Rename loved one"
                    aria-label="Rename loved one"
                  >
                    <Pencil size={12} />
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteProfile(profile.id, e)}
                    className="p-1 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-white/10 transition-colors"
                    title="Remove from remote care"
                    aria-label="Remove from remote care"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}

            {/* Add Loved One Button */}
            <button
              onClick={() => {
                setNewMemberName('');
                setNewMemberEmail('');
                setNewMemberFileId('');
                setDiscoveredFiles([]);
                setShowAddProfileModal(true);
              }}
              className="shrink-0 py-2 px-3.5 rounded-2xl border border-dashed border-stone-300 text-stone-600 hover:text-stone-900 hover:border-stone-400 bg-stone-50/70 hover:bg-stone-100 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Add a remote loved one"
            >
              <Plus size={14} />
              <span>Add Loved One</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      {profiles.length === 0 ? (
        /* Empty State: No remote loved ones connected yet */
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 text-center flex flex-col items-center gap-4 shadow-sm">
            <div className="w-16 h-16 rounded-3xl bg-canopy-50 text-canopy-700 border border-canopy-200/60 flex items-center justify-center shadow-xs">
              <Users size={32} />
            </div>

            <div className="flex flex-col gap-1.5 max-w-sm">
              <h2 className="text-2xl font-black tracking-tight text-stone-900">
                Remote Family Care
              </h2>
              <p className="text-sm text-stone-500 font-medium leading-relaxed">
                Connect and monitor your loved ones (parents, elders, or spouse) by viewing their caregiver health digests shared directly from their Google Drive.
              </p>
            </div>

            <button
              onClick={() => {
                setNewMemberName('');
                setNewMemberEmail('');
                setNewMemberFileId('');
                setDiscoveredFiles([]);
                setShowAddProfileModal(true);
              }}
              className="mt-2 px-6 py-3.5 bg-stone-900 hover:bg-black active:scale-95 text-white font-bold rounded-2xl text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <UserPlus size={18} />
              <span>Add Loved One</span>
            </button>
          </div>

          {/* Educational Guide: How Remote Care Works */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 px-1">
              How Remote Care Works
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-stone-50/80 border border-stone-200/80 p-4 rounded-2xl flex flex-col gap-2">
                <div className="w-8 h-8 rounded-xl bg-tree-100 text-tree-800 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h4 className="font-bold text-stone-900 text-sm">Loved One Logs on Their Phone</h4>
                <p className="text-xs text-stone-500 font-medium leading-relaxed">
                  Your parent or relative records daily voice memos in Nalama. Gemini synthesizes a high-level care digest into their private Google Drive.
                </p>
              </div>

              <div className="bg-stone-50/80 border border-stone-200/80 p-4 rounded-2xl flex flex-col gap-2">
                <div className="w-8 h-8 rounded-xl bg-canopy-100 text-canopy-800 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h4 className="font-bold text-stone-900 text-sm">Direct Drive Sharing</h4>
                <p className="text-xs text-stone-500 font-medium leading-relaxed">
                  In their Settings, they grant your Google Account read access to their <span className="font-semibold">family_share</span> folder. No middleman database ever touches your data.
                </p>
              </div>

              <div className="bg-stone-50/80 border border-stone-200/80 p-4 rounded-2xl flex flex-col gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h4 className="font-bold text-stone-900 text-sm">Peace of Mind & Dignity</h4>
                <p className="text-xs text-stone-500 font-medium leading-relaxed">
                  You see their vitality, nutrition, and movement highlights in real-time. Raw audio recordings and personal reflections remain strictly confidential.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Member Selected View */
        <div className="flex flex-col gap-5 animate-in fade-in duration-300">
          {/* Check if connected to a shared file */}
          {!isConnectedToFile ? (
            /* Not linked to a Drive file yet */
            <div className="bg-stone-50 border-2 border-dashed border-stone-300 rounded-[2rem] p-6 text-center flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <FolderOpen size={28} />
              </div>

              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="text-lg font-bold text-stone-900">
                  Drive Not Connected for {activeProfile?.name}
                </h3>
                <p className="text-xs text-stone-500 font-medium leading-relaxed">
                  To view {activeProfile?.name}&apos;s health updates, link the <span className="font-semibold">care_digest.json</span> shared with your Google account ({user?.email || 'your email'}).
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  onClick={handleScanSharedDigests}
                  disabled={isScanningDrive || !driveState}
                  className="px-4 py-2.5 bg-canopy-700 hover:bg-canopy-800 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Search size={14} className={isScanningDrive ? 'animate-spin' : ''} />
                  <span>{isScanningDrive ? 'Scanning...' : 'Scan My Google Drive'}</span>
                </button>

                <button
                  onClick={() => setShowLinkModal(true)}
                  className="px-4 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Link size={14} />
                  <span>Enter File ID / Link</span>
                </button>
              </div>

              {/* Show scan results if any */}
              {discoveredFiles.length > 0 && (
                <div className="w-full max-w-md mt-2 flex flex-col gap-2 text-left bg-white p-3 rounded-2xl border border-canopy-200">
                  <span className="text-[11px] font-bold text-stone-500 uppercase px-1">Found Shared Care Digests:</span>
                  {discoveredFiles.map((file) => (
                    <div 
                      key={file.id}
                      className="p-2.5 bg-stone-50 hover:bg-canopy-50 border border-stone-200 hover:border-canopy-300 rounded-xl flex items-center justify-between transition-colors text-xs"
                    >
                      <div className="flex flex-col truncate pr-2">
                        <span className="font-bold text-stone-900 truncate">
                          {file.sharingUser?.displayName || file.owners?.[0]?.displayName || 'Loved One'}
                        </span>
                        <span className="text-[10px] text-stone-500 truncate">
                          {file.sharingUser?.emailAddress || file.owners?.[0]?.emailAddress || ''}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const updatedList = profiles.map(p => 
                            p.id === activeProfile?.id ? { ...p, sharedDriveFileId: file.id } : p
                          );
                          await updateProfilesList(updatedList);
                        }}
                        className="px-3 py-1.5 bg-canopy-700 hover:bg-canopy-800 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : isLoading ? (
            /* Loading State */
            <div className="bg-white border border-stone-200 rounded-[2rem] p-12 text-center flex flex-col items-center justify-center gap-3">
              <RefreshCw size={28} className="animate-spin text-canopy-700" />
              <p className="text-sm font-semibold text-stone-600">
                Reading remote care digest from Google Drive...
              </p>
            </div>
          ) : latestDigest ? (
            /* Active Digest Display */
            <>
              {/* Remote Status Banner */}
              <div className={`p-5 rounded-[2rem] text-white shadow-sm flex flex-col gap-3 transition-all ${
                latestDigest.status === 'attention' 
                  ? 'bg-amber-600' 
                  : 'bg-gradient-to-br from-canopy-700 to-canopy-800 border border-canopy-600/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      latestDigest.status === 'attention' ? 'bg-amber-300' : 'bg-canopy-300'
                    } animate-pulse`} />
                    <span className="font-bold uppercase tracking-wider text-xs opacity-95">
                      {activeProfile?.name}&apos;s Remote Status: {latestDigest.status_label || (latestDigest.status === 'attention' ? 'Attention Needed' : 'Active & Well')}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (activeProfile) {
                        setEditingNameValue(activeProfile.name);
                        setEditingRelationValue(activeProfile.relationship || 'Parent');
                        setShowEditNameModal(true);
                      }
                    }}
                    className="text-[11px] font-semibold px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-full flex items-center gap-1 transition-colors cursor-pointer"
                    title="Edit loved one's name"
                  >
                    <Pencil size={10} />
                    <span>Rename</span>
                  </button>
                </div>

                <p className="font-medium text-white/95 leading-relaxed text-base">
                  {latestDigest.summary}
                </p>

                <div className="text-xs font-semibold text-white/70 pt-2 border-t border-white/20 flex items-center justify-between">
                  <span>Logged {latestDigest.displayDate} at {latestDigest.displayTime}</span>
                  <span className="text-[11px] opacity-80 flex items-center gap-1">
                    <Wifi size={10} />
                    Remote Google Drive
                  </span>
                </div>
              </div>

              {/* Health & Activity Overview Metrics */}
              {latestDigest.metrics && latestDigest.metrics.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xl font-bold text-stone-900">
                      {activeProfile?.name}&apos;s Wellness Highlights
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {latestDigest.metrics.map((metric: DigestMetricItem, index: number) => {
                      const isFullWidth = latestDigest.metrics.length % 2 !== 0 && index === latestDigest.metrics.length - 1;
                      return (
                        <DigestMetricCard 
                          key={metric.id || index}
                          item={metric}
                          className={isFullWidth ? 'col-span-2' : ''}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timeline History Feed */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-stone-700" />
                    <h2 className="text-xl font-bold text-stone-900">Remote Care Timeline</h2>
                  </div>
                  <span className="text-xs font-semibold text-stone-400">
                    {historyDigests.length} {historyDigests.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {historyDigests.length === 0 ? (
                  <p className="text-xs text-stone-400 font-medium px-1">
                    Historical updates from {activeProfile?.name} will appear chronologically here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {historyDigests.map((item: CaregiverDigest, idx: number) => {
                      const isExpanded = expandedHistoryId === item.id;
                      const isLatest = idx === 0;

                      return (
                        <div 
                          key={item.id || idx}
                          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs flex flex-col gap-2 transition-all hover:border-stone-300"
                        >
                          <div 
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                item.status === 'attention' ? 'bg-amber-500' : 'bg-canopy-500'
                              }`} />
                              <span className="text-xs font-bold text-stone-900">
                                {item.displayDate} • {item.displayTime}
                              </span>
                              {isLatest && (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-canopy-50 text-canopy-700 rounded-md">
                                  Latest
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                item.status === 'attention' ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-700'
                              }`}>
                                {item.status_label}
                              </span>
                              {isExpanded ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
                            </div>
                          </div>

                          <p className="text-sm font-medium text-stone-700 leading-relaxed">
                            {item.summary}
                          </p>

                          {isExpanded && item.metrics && item.metrics.length > 0 && (
                            <div className="pt-3 border-t border-stone-100 grid grid-cols-2 gap-2 mt-1 animate-in fade-in-50 duration-200">
                              {item.metrics.map((m, mIdx) => (
                                <div key={mIdx} className="bg-stone-50 p-2.5 rounded-xl flex flex-col gap-0.5">
                                  <span className="text-[11px] font-semibold text-stone-500">{m.title}</span>
                                  <span className="text-xs font-bold text-stone-900">{m.value}</span>
                                  <span className="text-[10px] font-bold text-teal-700">{m.status}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* File Connected but Empty or No Entries */
            <div className="bg-stone-50 border border-stone-200 rounded-[2rem] p-6 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Sparkles size={24} />
              </div>
              <h3 className="text-lg font-bold text-stone-800">
                Connected to {activeProfile?.name}&apos;s Drive
              </h3>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                The care digest file is linked, but {activeProfile?.name} hasn&apos;t recorded voice logs today yet. As soon as they record on their phone, their digest will appear here.
              </p>
              <button
                onClick={handleSyncRemoteDigest}
                disabled={isRefreshing || !driveState}
                className="mt-1 px-4 py-2.5 bg-stone-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Checking Drive...' : 'Check for Updates'}</span>
              </button>
            </div>
          )}

          {/* Drive Connection Status & Re-link Footer */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5 truncate">
              <FolderOpen size={18} className="text-stone-500 shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-xs font-bold text-stone-900">
                  Remote Drive File Connection
                </span>
                <span className="text-[11px] text-stone-500 truncate font-mono">
                  {activeProfile?.sharedDriveFileId ? `ID: ${activeProfile.sharedDriveFileId.slice(0, 16)}...` : 'Not linked'}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setLinkInputVal(activeProfile?.sharedDriveFileId || '');
                setShowLinkModal(true);
              }}
              className="text-xs font-bold text-teal-700 hover:text-teal-800 shrink-0 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer"
            >
              {activeProfile?.sharedDriveFileId ? 'Change Link' : 'Link File'}
            </button>
          </div>

          {/* Privacy Notice Banner */}
          <div className="flex items-start gap-3 bg-teal-50/50 p-4 rounded-2xl border border-teal-100">
            <ShieldCheck size={22} className="text-teal-700 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-teal-900 uppercase tracking-wide">Dignity & Privacy Protected</span>
              <p className="text-xs text-teal-800 font-medium leading-relaxed">
                You are viewing {activeProfile?.name}&apos;s privacy-filtered caregiver digest directly from Google Drive. Caregivers only receive high-level vitality, movement, and wellness highlights—never raw voice notes, emotional reflections, or private health details.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Name Modal */}
      {showEditNameModal && activeProfile && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-sm w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900 text-lg flex items-center gap-2">
                <Pencil size={18} className="text-teal-700" />
                Rename Loved One
              </h3>
              <button 
                onClick={() => setShowEditNameModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              Change how this loved one is labeled in your Remote Care Circle.
            </p>

            <form onSubmit={handleSaveProfileName} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-stone-700 mb-1 block">Display Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  placeholder="e.g. Mom, Amma, Dad"
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-200 text-sm text-stone-900 font-semibold outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 mb-1 block">Relationship</label>
                <select
                  value={editingRelationValue}
                  onChange={(e) => setEditingRelationValue(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-200 text-sm text-stone-900 font-semibold outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  <option value="Mother">Mother</option>
                  <option value="Father">Father</option>
                  <option value="Parent">Parent</option>
                  <option value="Spouse">Spouse</option>
                  <option value="Child">Child</option>
                  <option value="Relative">Relative</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['Mom', 'Dad', 'Amma', 'Appa', 'Grandma', 'Grandpa', 'Spouse'].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setEditingNameValue(suggestion)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditNameModal(false)}
                  className="flex-1 py-3 text-stone-600 font-bold rounded-xl bg-stone-100 hover:bg-stone-200 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingName || !editingNameValue.trim()}
                  className="flex-[2] py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Check size={14} />
                  <span>{isSavingName ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Remote Loved One Modal */}
      {showAddProfileModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                  Remote Care Only
                </span>
                <h3 className="font-bold text-stone-900 text-lg flex items-center gap-2 mt-1">
                  <UserPlus size={20} className="text-teal-700" />
                  Add Loved One
                </h3>
              </div>
              <button 
                onClick={() => setShowAddProfileModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              Connect to your loved one&apos;s Google Drive to view their real-time caregiver health digests remotely.
            </p>

            <form onSubmit={handleAddRemoteProfile} className="flex flex-col gap-4">
              {/* Member Name & Relationship */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-stone-700 mb-1 block">Loved One&apos;s Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="e.g. Mom, Amma, Dad"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-900 font-semibold outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 mb-1 block">Relationship</label>
                  <select
                    value={newMemberRelation}
                    onChange={(e) => setNewMemberRelation(e.target.value)}
                    className="w-full px-2.5 py-2.5 rounded-xl border border-stone-200 text-xs text-stone-900 font-semibold outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Parent">Parent</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Relative">Relative</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Loved One's Email */}
              <div>
                <label className="text-xs font-bold text-stone-700 mb-1 block">Loved One&apos;s Google Email (Optional)</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="parent@gmail.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-900 font-medium outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              </div>

              {/* Remote Drive Digest Connection Section */}
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700">Connect to Shared Google Drive</span>
                  <button
                    type="button"
                    onClick={handleScanSharedDigests}
                    disabled={isScanningDrive || !driveState}
                    className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Search size={12} className={isScanningDrive ? 'animate-spin' : ''} />
                    <span>{isScanningDrive ? 'Scanning...' : 'Scan Drive'}</span>
                  </button>
                </div>

                {discoveredFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                    <span className="text-[11px] font-bold text-stone-500 uppercase">Discovered Files in Drive:</span>
                    {discoveredFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => handleSelectDiscoveredFile(file)}
                        className={`p-2 rounded-xl flex items-center justify-between cursor-pointer border transition-colors text-xs ${
                          newMemberFileId === file.id 
                            ? 'bg-teal-50 border-teal-500' 
                            : 'bg-white border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="font-bold text-stone-900 truncate">
                            {file.sharingUser?.displayName || file.owners?.[0]?.displayName || 'Loved One'}
                          </span>
                          <span className="text-[10px] text-stone-500 truncate">
                            {file.sharingUser?.emailAddress || file.owners?.[0]?.emailAddress || ''}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          newMemberFileId === file.id ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-700'
                        }`}>
                          {newMemberFileId === file.id ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-bold text-stone-600 mb-1 block">Drive File ID or Link (Optional)</label>
                  <input
                    type="text"
                    value={newMemberFileId}
                    onChange={(e) => setNewMemberFileId(e.target.value)}
                    placeholder="e.g. 1a2b3c4d5e... or Drive URL"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-900 font-mono outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                  <p className="text-[10px] text-stone-400 mt-1 leading-tight">
                    You can also leave this empty and connect Drive anytime later.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddProfileModal(false)}
                  className="flex-1 py-3 text-stone-600 font-bold rounded-xl bg-stone-100 hover:bg-stone-200 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newMemberName.trim()}
                  className="flex-[2] py-3 bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Loved One</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Drive File Modal for an Existing Member */}
      {showLinkModal && activeProfile && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white max-w-sm w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-stone-900 text-lg flex items-center gap-2">
                <Link size={18} className="text-teal-700" />
                Link Drive Digest
              </h3>
              <button 
                onClick={() => setShowLinkModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              Connect {activeProfile.name}&apos;s shared <span className="font-semibold">care_digest.json</span> by pasting the Google Drive link or file ID.
            </p>

            <form onSubmit={handleLinkDriveFile} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-stone-700 mb-1 block">Drive File Link or ID</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="https://drive.google.com/... or file ID"
                  value={linkInputVal}
                  onChange={(e) => setLinkInputVal(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-200 text-xs font-mono text-stone-900 outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="flex-1 py-3 text-stone-600 font-bold rounded-xl bg-stone-100 hover:bg-stone-200 text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLinking || !linkInputVal.trim()}
                  className="flex-[2] py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Check size={14} />
                  <span>{isLinking ? 'Linking...' : 'Connect File'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DigestMetricCard({ item, className = '' }: { item: DigestMetricItem; className?: string; key?: React.Key }) {
  const getStyle = () => {
    switch (item.type) {
      case 'activity':
        return { icon: <Dumbbell size={18} className="text-teal-700" />, bg: 'bg-teal-50/70', border: 'border-teal-100' };
      case 'nutrition':
        return { icon: <Utensils size={18} className="text-amber-700" />, bg: 'bg-amber-50/70', border: 'border-amber-100' };
      case 'medication':
        return { icon: <Pill size={18} className="text-rose-700" />, bg: 'bg-rose-50/70', border: 'border-rose-100' };
      case 'vitals':
        return { icon: <HeartPulse size={18} className="text-indigo-700" />, bg: 'bg-indigo-50/70', border: 'border-indigo-100' };
      case 'sleep':
        return { icon: <Moon size={18} className="text-canopy-700" />, bg: 'bg-canopy-50/80', border: 'border-canopy-200/80' };
      default:
        return { icon: <Activity size={18} className="text-stone-700" />, bg: 'bg-stone-50', border: 'border-stone-200' };
    }
  };

  const style = getStyle();

  return (
    <div className={`p-4 rounded-2xl border ${style.bg} ${style.border} flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {style.icon}
          <span className="text-xs font-bold text-stone-700">{item.title}</span>
        </div>
        <span className="text-[10px] font-bold text-canopy-900 bg-white/90 px-2 py-0.5 rounded-full border border-canopy-200/60">
          {item.status}
        </span>
      </div>
      <span className="text-sm font-extrabold text-stone-900 tracking-tight mt-1 leading-snug">
        {item.value}
      </span>
    </div>
  );
}
