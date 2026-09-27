/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import Coaching from './components/Coaching';
import HealthProfile from './components/HealthProfile';
import Family from './components/Family';
import SettingsView from './components/Settings';
import DeveloperGuide from './components/DeveloperGuide';
import LegalPages from './components/LegalPages';
import SyncFloatingBanner from './components/SyncFloatingBanner';
import VoiceRecorderButton from './components/VoiceRecorderButton';
import HealthDocUploader from './components/HealthDocUploader';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import LoginScreen from './components/LoginScreen';
import IntakeWizard from './components/IntakeWizard';
import { initAuth, logout } from './lib/auth';
import { 
  findOrCreateFolder, 
  findFileOrFolder, 
  writeJsonFile, 
  readJsonFile, 
  getOrCreateMonthlyLogFile, 
  getOrCreateCareDigestFile, 
  getUserProfileFromDrive, 
  saveUserProfileToDrive, 
  getMonthlyLogFileName,
  wipeAllApplicationData
} from './lib/drive';
import { executeExternalDataSync } from './lib/importers/syncEngine';
import { User } from 'firebase/auth';
import { Home, MessageCircle, Users, Settings, AlertCircle, RefreshCw, LogOut, HardDrive } from 'lucide-react';
import { DriveState, UserProfile } from './types';
import { useRegionalVariant } from './context/RegionalVariantContext';

export type { DriveState };

export default function App() {
  const { variant, syncWithProfileLanguage } = useRegionalVariant();
  const [activeTab, setActiveTab] = useState('home');
  const [legalView, setLegalView] = useState<'privacy' | 'terms' | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const params = new URLSearchParams(window.location.search);
      const pageParam = params.get('page')?.toLowerCase() || params.get('tab')?.toLowerCase();

      if (path === '/privacy' || path === '/privacy-policy' || pageParam === 'privacy') {
        return 'privacy';
      }
      if (path === '/terms' || path === '/terms-of-service' || path === '/tos' || pageParam === 'terms') {
        return 'terms';
      }
    }
    return null;
  });
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initMessage, setInitMessage] = useState('Loading...');
  const [initError, setInitError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [driveState, setDriveState] = useState<DriveState | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [logsRefreshTrigger, setLogsRefreshTrigger] = useState(0);
  const [showIntake, setShowIntake] = useState(false);

  // Splash screen states
  const [showSplash, setShowSplash] = useState(true);
  const [splashFade, setSplashFade] = useState(false);
  const [minTimerDone, setMinTimerDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 1200); // Minimum 1.2s ensures a solid, prominent branding screen while background activity initializes
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimerDone && !isInitializing) {
      setSplashFade(true);
      const fadeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 700);
      return () => clearTimeout(fadeTimer);
    }
  }, [minTimerDone, isInitializing]);

  // External Sync Status & UI state
  const [syncStatus, setSyncStatus] = useState<'checking' | 'processing' | 'success' | 'error' | 'idle'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const syncTimeoutRef = useRef<any>(null);
  const initialSyncAttemptedRef = useRef(false);

  // Trigger sync process
  const runExternalDataSync = async (
    currentDriveState: DriveState, 
    profileToUse?: UserProfile | null, 
    forceSync: boolean = false
  ) => {
    const prof = profileToUse || userProfile;
    if (!prof?.enableExternalDataImport) {
      return;
    }

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    setIsManualSyncing(true);

    await executeExternalDataSync(
      currentDriveState,
      prof,
      (event) => {
        setSyncStatus(event.status);
        setSyncMessage(event.message);

        // Auto-dismiss floating banner after success
        if (event.status === 'success') {
          setLogsRefreshTrigger(prev => prev + 1);
          syncTimeoutRef.current = setTimeout(() => {
            setSyncStatus('idle');
            setSyncMessage('');
          }, 4500);
        }
      },
      forceSync
    );

    setIsManualSyncing(false);
  };

  const initializeDriveEnv = async (token: string, currentUser?: User | null) => {
    try {
      setLastToken(token);
      setInitError(null);
      setIsInitializing(true);
      setInitMessage('Connecting to Google Drive...');

      // Immediate pre-population of user profile from auth/cache to unblock UI
      const activeUser = currentUser || user;
      const initialProfile: UserProfile = {
        displayName: activeUser?.displayName || 'Family Member',
        email: activeUser?.email || '',
        photoURL: activeUser?.photoURL || '',
        primaryLanguage: 'English'
      };
      setUserProfile(initialProfile);

      // 1. Resolve main folder
      const cacheKey = `nalama_main_folder_${activeUser?.uid || 'user'}`;
      let mainFolderId = localStorage.getItem(cacheKey);
      if (!mainFolderId || token === 'offline_mode') {
        mainFolderId = await findOrCreateFolder(token, 'nalama.family');
        if (mainFolderId && token !== 'offline_mode') {
          localStorage.setItem(cacheKey, mainFolderId);
        }
      }

      setInitMessage('Loading dashboard data...');

      // 2. Critical Path: fetch context_memory and monthly logs IN PARALLEL
      const [contextFileId, logsInfo] = await Promise.all([
        (async () => {
          let cid = await findFileOrFolder(token, 'context_memory.json', 'application/json', mainFolderId!);
          if (!cid) {
            const initialData = {
              schema_version: "1.0",
              facts: [],
              family_members: []
            };
            cid = await writeJsonFile(token, 'context_memory.json', initialData, mainFolderId!);
          }
          return cid;
        })(),
        getOrCreateMonthlyLogFile(token, mainFolderId!)
      ]);

      const currentLogsFileId = logsInfo.fileId;
      const currentLogsFileName = logsInfo.fileName;

      // 3. UNBLOCK UI IMMEDIATELY - User sees working dashboard in < 1.5s
      const newDriveState: DriveState = { 
        token, 
        mainFolderId: mainFolderId!, 
        familyFolderId: '', 
        contextFileId, 
        currentLogsFileId, 
        currentLogsFileName,
        digestFileId: '',
        logsFileId: currentLogsFileId 
      };

      setDriveState(newDriveState);
      setNeedsAuth(false);
      setIsInitializing(false);

      // 4. PROGRESSIVE BACKGROUND TASKS (Non-blocking):
      // A) Background user profile sync from Drive
      (async () => {
        try {
          const profileFromDrive = await getUserProfileFromDrive(token, contextFileId);
          if (profileFromDrive) {
            const mergedProfile: UserProfile = {
              ...profileFromDrive,
              displayName: activeUser?.displayName || profileFromDrive.displayName || 'Family Member',
              email: activeUser?.email || profileFromDrive.email || '',
              photoURL: activeUser?.photoURL || profileFromDrive.photoURL || ''
            };
            setUserProfile(mergedProfile);

            if (!(mergedProfile as any).isIntakeComplete) {
              setShowIntake(true);
            }

            if (mergedProfile.enableExternalDataImport && !initialSyncAttemptedRef.current) {
              initialSyncAttemptedRef.current = true;
              setTimeout(() => {
                runExternalDataSync(newDriveState, mergedProfile);
              }, 500);
            }
          } else {
            setShowIntake(true);
          }
        } catch (profileErr) {
          console.warn('Background profile sync note:', profileErr);
          setShowIntake(true);
        }
      })();

      // B) Background family share & caregiver digest folder sync
      (async () => {
        try {
          const familyFolderId = await findOrCreateFolder(token, 'family_share', mainFolderId!);
          const { fileId: digestFileId } = await getOrCreateCareDigestFile(token, familyFolderId, activeUser?.displayName || undefined);
          setDriveState(prev => prev ? { ...prev, familyFolderId, digestFileId } : prev);
        } catch (careErr) {
          console.warn('Background family share sync note:', careErr);
        }
      })();

    } catch (err: any) {
      console.warn('Initialization notice (self-healing will handle fallback):', err.message || err);
      let errorMsg = err.message || 'Unknown error occurred while connecting to Google Drive.';
      
      // Auto fallback to local virtual drive if fetch blocks
      const isFetchBlocked = errorMsg.includes('Failed to fetch') || err.toString().includes('Failed to fetch');
      if (isFetchBlocked && token !== 'offline_mode') {
        console.warn('Detecting browser fetch block on Google Drive APIs. Automatically self-healing with Local Storage Fallback...');
        setIsOfflineFallback(true);
        setInitError(null);
        await initializeDriveEnv('offline_mode', null);
        return;
      }

      // If token expired or was revoked (401/403/invalid_grant), clear storage and ask user to reconnect
      if (errorMsg.includes('401') || errorMsg.includes('UNAUTHENTICATED') || errorMsg.includes('invalid_grant')) {
        await logout();
        setNeedsAuth(true);
        setIsInitializing(false);
        return;
      }

      if (errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Connection blocked. Please disable any ad-blockers (like Brave Shields) or check your network.';
      }
      setInitError(errorMsg);
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (loggedInUser, token) => {
        setUser(loggedInUser);
        setIsInitializing(true);
        initializeDriveEnv(token, loggedInUser);
      },
      () => {
        setUser(null);
        setDriveState(null);
        setUserProfile(null);
        setNeedsAuth(true);
        setIsInitializing(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
    setNeedsAuth(true);
    setDriveState(null);
  };

  const handleResetAllContext = async () => {
    if (!driveState?.token || !driveState?.mainFolderId) return;
    const token = driveState.token;
    
    // Wipe all files from Drive, clear all monthly logs, facts, coaching chats, insights, digests, and caches
    const { newLogsFileId, newContextFileId } = await wipeAllApplicationData(
      token,
      driveState.mainFolderId,
      driveState.familyFolderId,
      user
    );

    // Update in-memory driveState with new empty file IDs
    setDriveState(prev => prev ? {
      ...prev,
      currentLogsFileId: newLogsFileId,
      contextFileId: newContextFileId,
      digestFileId: ''
    } : prev);

    // Reset local profile
    const initialProfile: UserProfile = {
      displayName: user?.displayName || '',
      email: user?.email || '',
      photoURL: user?.photoURL || '',
      primaryLanguage: 'English'
    };
    setUserProfile(initialProfile);

    // Force UI refresh across all tabs (Dashboard, Coaching, Family, Health Profile)
    setLogsRefreshTrigger(prev => prev + 1);

    // Re-initialize environment to re-sync cleanly
    await initializeDriveEnv(token, user);
    setLogsRefreshTrigger(prev => prev + 1);
  };

  // Synchronize regional variant if userProfile primaryLanguage changes
  useEffect(() => {
    if (userProfile?.primaryLanguage) {
      syncWithProfileLanguage(userProfile.primaryLanguage, true);
    }
  }, [userProfile?.primaryLanguage, syncWithProfileLanguage]);

  const handleSaveIntake = async (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    if (updatedProfile.primaryLanguage) {
      syncWithProfileLanguage(updatedProfile.primaryLanguage, true);
    }
    if (driveState?.contextFileId && driveState?.token) {
      await saveUserProfileToDrive(driveState.token, driveState.contextFileId, updatedProfile);
    }
    setShowIntake(false);
  };

  // Splash Screen Render - Centered Brand, Elegant Minimalist micro-indicator, smoothly transitions
  if (showSplash) {
    return (
      <div 
        className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#F9F7F4] p-8 transition-opacity duration-700 ease-out ${
          splashFade ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="h-10" />

        <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-1000">
          <div className="w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center relative overflow-hidden transition-all">
            <img 
              src={variant.logoSrc} 
              alt={`${variant.brandName} logo`} 
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 text-center pb-8 animate-in fade-in slide-in-from-bottom duration-1000 delay-300">
          <div className="flex items-center gap-2 text-stone-600 font-semibold text-xs bg-white/95 shadow-2xs border border-stone-200/80 px-4 py-2 rounded-full">
            <div className="w-3.5 h-3.5 border-2 border-tree-600 border-t-transparent rounded-full animate-spin" />
            <span>{initMessage || 'Loading secure space...'}</span>
          </div>
          
          <p className="text-[10px] text-stone-400 max-w-xs leading-relaxed font-medium">
            Stored entirely in your private Google Drive.
          </p>
        </div>
      </div>
    );
  }

  // If a direct legal route is visited (/privacy or /terms), render immediately without requiring sign-in or waiting for Drive initialization
  if (legalView && (!user || needsAuth || !driveState)) {
    return (
      <div className="min-h-screen bg-[#F8FAF8] px-6">
        <div className="max-w-md w-full mx-auto">
          <LegalPages 
            initialView={legalView} 
            onBack={() => {
              setLegalView(null);
              // Clean URL query or path if needed
              if (window.history.pushState) {
                window.history.pushState({}, '', '/');
              }
            }} 
          />
        </div>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F7F4] gap-4 p-6">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-stone-600 font-bold animate-pulse text-center">{initMessage}</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F7F4] p-6">
        <div className="bg-white max-w-sm w-full rounded-3xl p-6 shadow-xl border border-rose-100 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertCircle size={32} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">Connection Issue</h3>
            <p className="text-sm text-stone-500 font-medium mt-1 leading-relaxed">
              {initError}
            </p>
          </div>
          <div className="flex flex-col w-full gap-2.5 pt-2">
            {lastToken && (
              <button
                onClick={() => initializeDriveEnv(lastToken)}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <RefreshCw size={18} />
                <span>Try Again</span>
              </button>
            )}
            
            <button
              onClick={() => {
                setInitError(null);
                initializeDriveEnv('offline_mode', null);
              }}
              className="w-full py-3.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/50 font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <HardDrive size={16} className="text-amber-700" />
              <span>Use Offline Local Mode</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut size={16} />
              <span>Sign Out & Reconnect</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    if (legalView) {
      return (
        <div className="min-h-screen bg-[#F8FAF8] px-6">
          <div className="max-w-md w-full mx-auto">
            <LegalPages 
              initialView={legalView} 
              onBack={() => setLegalView(null)} 
            />
          </div>
        </div>
      );
    }

    return (
      <LoginScreen 
        onLogin={(user, token) => {
          setUser(user);
          setIsInitializing(true);
          initializeDriveEnv(token);
        }} 
        onOpenLegal={(tab) => setLegalView(tab)}
      />
    );
  }

  if (showIntake && userProfile) {
    return (
      <IntakeWizard 
        initialProfile={userProfile} 
        onSave={handleSaveIntake} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-tree-100 relative">
      <PWAInstallBanner />

      {isOfflineFallback && (
        <div className="bg-amber-50/90 border-b border-amber-200/60 text-amber-900 px-6 py-2.5 text-[11px] font-bold tracking-wide flex items-center justify-center gap-2 select-none animate-in slide-in-from-top duration-300">
          <HardDrive size={13} className="text-amber-700 shrink-0" />
          <span>Google Drive restricted by browser. Secure Local Mode Active.</span>
        </div>
      )}

      {/* Floating Background Sync Status Banner */}
      <SyncFloatingBanner 
        status={syncStatus} 
        message={syncMessage} 
        onDismiss={() => setSyncStatus('idle')} 
        onRetry={() => {
          if (driveState) runExternalDataSync(driveState);
        }} 
      />

      <main className="flex-1 max-w-md w-full mx-auto px-6 relative">
        {activeTab === 'home' && (
          <Dashboard 
            driveState={driveState} 
            refreshTrigger={logsRefreshTrigger} 
            userProfile={userProfile}
            user={user}
            onLogSaved={() => setLogsRefreshTrigger(prev => prev + 1)}
          />
        )}
        {activeTab === 'coaching' && (
          <Coaching 
            onOpenProfile={() => setActiveTab('profile')} 
            driveState={driveState} 
            userProfile={userProfile}
            user={user}
            refreshTrigger={logsRefreshTrigger}
          />
        )}
        {activeTab === 'profile' && (
          <HealthProfile 
            onBack={() => setActiveTab('coaching')} 
            driveState={driveState} 
            user={user}
            userProfile={userProfile}
            refreshTrigger={logsRefreshTrigger}
          />
        )}
        {activeTab === 'family' && (
          <Family 
            driveState={driveState} 
            user={user} 
            refreshTrigger={logsRefreshTrigger}
            onOpenSettings={() => setActiveTab('settings')} 
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView 
            onLogout={handleLogout} 
            driveState={driveState} 
            user={user}
            userProfile={userProfile}
            isSyncingExternal={isManualSyncing}
            onOpenDeveloperGuide={() => setActiveTab('developer_guide')}
            onOpenLegal={(tab) => {
              setLegalView(tab);
              setActiveTab('legal');
            }}
            onTriggerManualSync={async () => {
              if (driveState) {
                await runExternalDataSync(driveState, undefined, true);
              }
            }}
            onUpdateProfile={async (updated) => {
              setUserProfile(updated);
              if (updated.primaryLanguage) {
                syncWithProfileLanguage(updated.primaryLanguage, true);
              }
              if (driveState?.contextFileId && driveState?.token) {
                await saveUserProfileToDrive(driveState.token, driveState.contextFileId, updated);
              }
            }}
            onResetAllContext={handleResetAllContext}
          />
        )}
        {activeTab === 'developer_guide' && (
          <DeveloperGuide onBack={() => setActiveTab('settings')} />
        )}
        {activeTab === 'legal' && (
          <LegalPages 
            initialView={legalView || 'privacy'} 
            onBack={() => {
              setActiveTab('settings');
              setLegalView(null);
            }} 
          />
        )}
        {activeTab !== 'home' && activeTab !== 'coaching' && activeTab !== 'profile' && activeTab !== 'family' && activeTab !== 'settings' && activeTab !== 'developer_guide' && activeTab !== 'legal' && (
          <div className="flex h-full items-center justify-center text-stone-500 font-medium">
            Coming soon...
          </div>
        )}
        
        {/* Floating Action Buttons (Left: Upload Logs, Right: Add Entry - only visible on Home tab) */}
        {activeTab === 'home' && (
          <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto px-4 flex items-center justify-between pointer-events-none z-30">
            <div className="pointer-events-auto">
              <HealthDocUploader 
                driveState={driveState}
                floating={true}
                userProfile={userProfile}
                onLogSaved={() => setLogsRefreshTrigger(prev => prev + 1)}
              />
            </div>
            <div className="pointer-events-auto">
              <VoiceRecorderButton 
                driveState={driveState}
                visible={true}
                onLogSaved={() => setLogsRefreshTrigger(prev => prev + 1)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40">
        <div className="max-w-md mx-auto flex justify-between items-center px-8 py-3 pb-safe">
          <NavItem 
            icon={<Home size={28} strokeWidth={activeTab === 'home' ? 2.5 : 2} />} 
            label="Home" 
            active={activeTab === 'home'} 
            onClick={() => setActiveTab('home')}
          />
          <NavItem 
            icon={<MessageCircle size={28} strokeWidth={activeTab === 'coaching' ? 2.5 : 2} />} 
            label="Coaching" 
            active={activeTab === 'coaching'}
            onClick={() => setActiveTab('coaching')}
          />
          <NavItem 
            icon={<Users size={28} strokeWidth={activeTab === 'family' ? 2.5 : 2} />} 
            label="Family" 
            active={activeTab === 'family'}
            variant="canopy"
            onClick={() => setActiveTab('family')}
          />
          <NavItem 
            icon={<Settings size={28} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />} 
            label="Settings" 
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ 
  icon, 
  label, 
  active, 
  variant = 'tree',
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  variant?: 'tree' | 'canopy';
  onClick: () => void; 
}) {
  const activeColor = variant === 'canopy' ? 'text-canopy-700' : 'text-tree-700';
  const activeBg = variant === 'canopy' ? 'bg-canopy-50 text-canopy-700' : 'bg-tree-50 text-tree-700';

  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 transition-colors ${active ? activeColor : 'text-stone-400 hover:text-stone-600'}`}
    >
      <div className={`${active ? activeBg : ''} p-2 rounded-2xl transition-colors`}>
        {icon}
      </div>
      <span className={`text-xs tracking-wide ${active ? 'font-bold' : 'font-semibold'}`}>
        {label}
      </span>
    </button>
  );
}
