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
import SyncFloatingBanner from './components/SyncFloatingBanner';
import VoiceRecorderButton from './components/VoiceRecorderButton';
import HealthDocUploader from './components/HealthDocUploader';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import LoginScreen from './components/LoginScreen';
import LegalPages from './components/LegalPages';
import IntakeWizard from './components/IntakeWizard';
import { initAuth, logout, googleSignIn, clearStoredAccessToken } from './lib/auth';
import { 
  findOrCreateFolder, 
  findFileOrFolder, 
  writeJsonFile, 
  readJsonFile, 
  getOrCreateMonthlyLogFile, 
  getOrCreateCareDigestFile, 
  getUserProfileFromDrive, 
  saveUserProfileToDrive,
  resetAllDriveContext 
} from './lib/drive';
import { executeExternalDataSync } from './lib/importers/syncEngine';
import { useWakeLock } from './lib/wakeLock';
import { useAndroidBackNavigation } from './lib/backNavigation';
import { User } from 'firebase/auth';
import { Home, MessageCircle, Users, Settings, AlertCircle, RefreshCw, LogOut, ScanSearch, User as UserIcon } from 'lucide-react';
import { DriveState, UserProfile } from './types';
import DriveAuditTab from './components/DriveAuditTab';

export type { DriveState };

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initMessage, setInitMessage] = useState('Connecting to Google Drive...');
  const [initError, setInitError] = useState<string | null>(null);
  const [needsDriveReconnect, setNeedsDriveReconnect] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [driveState, setDriveState] = useState<DriveState | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [logsRefreshTrigger, setLogsRefreshTrigger] = useState(0);

  // Check if user is navigating directly to /privacy or /terms
  const [legalView, setLegalView] = useState<'privacy' | 'terms' | null>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      if (path === '/privacy' || path.endsWith('/privacy')) return 'privacy';
      if (path === '/terms' || path.endsWith('/terms')) return 'terms';
    }
    return null;
  });

  // External Sync Status & UI state
  const [syncStatus, setSyncStatus] = useState<'checking' | 'processing' | 'success' | 'error' | 'idle'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const syncTimeoutRef = useRef<any>(null);
  const initialSyncAttemptedRef = useRef(false);

  // Keep screen awake during initial Drive context connection/loading and external data sync processing
  useWakeLock(isInitializing, 'initializing_drive_context');
  useWakeLock(syncStatus === 'checking' || syncStatus === 'processing' || isManualSyncing, 'syncing_external_data');

  // Android back button and screen swipe gesture management:
  // - Closes active modals/sub-views first
  // - Redirects to 'home' on 1st back attempt from any tab
  // - Prompts "Press back again to exit" on home, exiting on 2nd attempt
  const { showExitToast } = useAndroidBackNavigation({
    activeTab,
    setActiveTab,
    legalView,
    setLegalView
  });

  // Trigger sync process
  const runExternalDataSync = async (
    currentDriveState: DriveState, 
    profileToUse?: UserProfile | null,
    forceSync: boolean = false
  ) => {
    const prof = profileToUse || userProfile;
    // Only proceed if external data import is explicitly enabled by the user
    if (!prof?.enableExternalDataImport && !forceSync) {
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
      const mainFolderId = await findOrCreateFolder(token, 'nalama.family');
      
      setInitMessage('Syncing memory profile...');
      const familyFolderId = await findOrCreateFolder(token, 'family_share', mainFolderId);
      
      let contextFileId = await findFileOrFolder(token, 'context_memory.json', 'application/json', mainFolderId);
      
      if (!contextFileId) {
        setInitMessage('Creating fresh health profile...');
        const initialData = {
          schema_version: "1.0",
          facts: [],
          family_members: []
        };
        contextFileId = await writeJsonFile(token, 'context_memory.json', initialData, mainFolderId);
      }

      // Load user profile from Drive context_memory.json
      let activeUserProfile: UserProfile | null = null;
      try {
        const activeUser = currentUser || user;
        const profileFromDrive = await getUserProfileFromDrive(token, contextFileId);
        if (profileFromDrive) {
          // Always ensure verified Google credentials are up to date
          const mergedProfile: UserProfile = {
            ...profileFromDrive,
            displayName: activeUser?.displayName || profileFromDrive.displayName || '',
            email: activeUser?.email || profileFromDrive.email || '',
            photoURL: activeUser?.photoURL || profileFromDrive.photoURL || ''
          };
          activeUserProfile = mergedProfile;
          setUserProfile(mergedProfile);
        } else if (activeUser) {
          const initialProfile: UserProfile = {
            displayName: activeUser.displayName || '',
            email: activeUser.email || '',
            photoURL: activeUser.photoURL || '',
            primaryLanguage: 'English',
            isIntakeComplete: false,
            enableExternalDataImport: false
          };
          activeUserProfile = initialProfile;
          setUserProfile(initialProfile);
          // Persist initial profile
          await saveUserProfileToDrive(token, contextFileId, initialProfile);
        }
      } catch (profileErr) {
        console.warn('Could not sync user profile from Drive:', profileErr);
      }

      setInitMessage('Syncing monthly health logs...');
      const { fileId: currentLogsFileId, fileName: currentLogsFileName } = await getOrCreateMonthlyLogFile(token, mainFolderId);

      setInitMessage('Syncing caregiver digest...');
      const { fileId: digestFileId } = await getOrCreateCareDigestFile(token, familyFolderId, (currentUser || user)?.displayName || undefined);
      
      console.log('Drive Initialized:', { mainFolderId, familyFolderId, contextFileId, currentLogsFileId, currentLogsFileName, digestFileId });
      
      const newDriveState: DriveState = { 
        token, 
        mainFolderId, 
        familyFolderId, 
        contextFileId, 
        currentLogsFileId, 
        currentLogsFileName,
        digestFileId,
        logsFileId: currentLogsFileId 
      };

      setDriveState(newDriveState);
      setNeedsAuth(false);
      setIsInitializing(false);

      // On Page Load / Initialization: ONLY if external import is explicitly enabled AND intake completed
      const isComplete = Boolean(
        activeUserProfile?.isIntakeComplete ||
        (!('isIntakeComplete' in (activeUserProfile || {})) && (activeUserProfile?.age || activeUserProfile?.healthGoals || activeUserProfile?.nickname))
      );
      if (activeUserProfile?.enableExternalDataImport === true && isComplete && !initialSyncAttemptedRef.current) {
        initialSyncAttemptedRef.current = true;
        // Non-blocking background execution
        setTimeout(() => {
          runExternalDataSync(newDriveState, activeUserProfile);
        }, 100);
      }
    } catch (err: any) {
      console.error('Failed to initialize drive:', err);
      let errorMsg = err.message || 'Unknown error occurred while connecting to Google Drive.';
      
      const isAuthError = 
        errorMsg.includes('401') || 
        errorMsg.includes('Invalid Credentials') || 
        errorMsg.includes('UNAUTHENTICATED') || 
        errorMsg.includes('invalid_grant');

      if (isAuthError) {
        clearStoredAccessToken();
        setNeedsDriveReconnect(true);
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
        setNeedsAuth(false);
        setNeedsDriveReconnect(false);
        setIsInitializing(true);
        initializeDriveEnv(token, loggedInUser);
      },
      () => {
        setUser(null);
        setDriveState(null);
        setUserProfile(null);
        setNeedsAuth(true);
        setNeedsDriveReconnect(false);
        setIsInitializing(false);
      },
      (loggedInUser) => {
        // User session exists in Firebase, but Drive access token needs 1-tap refresh
        setUser(loggedInUser);
        setNeedsAuth(false);
        setNeedsDriveReconnect(true);
        setIsInitializing(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setDriveState(null);
    setUserProfile(null);
    setNeedsDriveReconnect(false);
    setNeedsAuth(true);
  };

  const handleDriveReconnect = async () => {
    setIsReconnecting(true);
    setInitError(null);
    try {
      const res = await googleSignIn(user?.email || undefined);
      if (res) {
        setUser(res.user);
        setNeedsDriveReconnect(false);
        setIsInitializing(true);
        await initializeDriveEnv(res.accessToken, res.user);
      }
    } catch (err: any) {
      console.error('Failed to reconnect Google Drive:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        alert(err.message || 'Failed to reconnect Google Drive. Please try again.');
      }
    } finally {
      setIsReconnecting(false);
    }
  };

  if (legalView) {
    return (
      <div className="min-h-screen bg-[#F9F7F4] py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <LegalPages 
            initialView={legalView} 
            onBack={() => {
              setLegalView(null);
              if (typeof window !== 'undefined' && window.location.pathname !== '/') {
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
            {user && (
              <button
                onClick={handleDriveReconnect}
                disabled={isReconnecting}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <RefreshCw size={18} className={isReconnecting ? 'animate-spin' : ''} />
                <span>{isReconnecting ? 'Reconnecting to Drive...' : 'Reconnect Google Drive'}</span>
              </button>
            )}
            {lastToken && !user && (
              <button
                onClick={() => initializeDriveEnv(lastToken)}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <RefreshCw size={18} />
                <span>Try Again</span>
              </button>
            )}
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

  // Seamless Reconnect Screen when User session is active but Google Drive OAuth needs refresh
  if (needsDriveReconnect && user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9F7F4] p-6 selection:bg-tree-100">
        <div className="bg-white max-w-sm w-full rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200/90 flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-200">
          {user.photoURL ? (
            <img 
              src={user.photoURL} 
              alt={user.displayName || 'User'} 
              className="w-16 h-16 rounded-full border-2 border-tree-500 shadow-md object-cover" 
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-tree-50 border border-tree-200 flex items-center justify-center text-tree-700">
              <UserIcon size={32} />
            </div>
          )}

          <div>
            <span className="text-xs font-bold text-tree-700 uppercase tracking-widest bg-tree-50 px-2.5 py-1 rounded-full border border-tree-100">
              Session Resumed
            </span>
            <h3 className="text-xl font-extrabold text-stone-900 mt-2">
              Welcome back, {user.displayName?.split(' ')[0] || 'there'}!
            </h3>
            <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
              Your Google Drive session expired while the app was updated. Tap below to resume access to your private health files with {user.email}.
            </p>
          </div>

          <div className="flex flex-col w-full gap-2.5 pt-2">
            <button
              onClick={handleDriveReconnect}
              disabled={isReconnecting}
              className="w-full py-3.5 bg-tree-700 hover:bg-tree-800 disabled:bg-tree-400 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all text-sm cursor-pointer"
            >
              {isReconnecting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              <span>{isReconnecting ? 'Connecting to Drive...' : 'Resume Google Drive Session'}</span>
            </button>

            <button
              onClick={handleLogout}
              disabled={isReconnecting}
              className="w-full py-2.5 text-xs text-stone-400 hover:text-stone-600 font-semibold transition-colors"
            >
              Use a different Google account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsAuth) {
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

  const isIntakeNeeded = Boolean(
    userProfile && 
    (userProfile.isIntakeComplete === false || (userProfile.isIntakeComplete === undefined && !userProfile.age && !userProfile.nickname && !userProfile.healthGoals && !userProfile.lifestyle)) && 
    driveState
  );

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-tree-100 relative">
      <PWAInstallBanner />

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
          />
        )}
        {activeTab === 'coaching' && (
          <Coaching 
            onOpenProfile={() => setActiveTab('profile')} 
            driveState={driveState} 
            userProfile={userProfile}
            user={user}
          />
        )}
        {activeTab === 'profile' && <HealthProfile onBack={() => setActiveTab('coaching')} driveState={driveState} />}
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
            onTriggerManualSync={async () => {
              if (driveState) {
                await runExternalDataSync(driveState, undefined, true);
              }
            }}
            onUpdateProfile={async (updated) => {
              setUserProfile(updated);
              if (driveState?.contextFileId && driveState?.token) {
                await saveUserProfileToDrive(driveState.token, driveState.contextFileId, updated);
              }
            }}
            onResetAllContext={async () => {
              if (!driveState?.token || !driveState.mainFolderId || !driveState.contextFileId) {
                throw new Error('Google Drive is not connected');
              }
              const result = await resetAllDriveContext(
                driveState.token,
                driveState.mainFolderId,
                driveState.familyFolderId,
                driveState.contextFileId,
                user
              );
              // Update state in React
              initialSyncAttemptedRef.current = false;
              setUserProfile(result.initialProfile);
              setActiveTab('home');

              // Clear cached local storage
              try {
                localStorage.removeItem('nalama_caregiver_profiles');
              } catch (e) {
                console.warn('Could not clear local storage profiles:', e);
              }

              // Trigger reload across all tabs (Dashboard, Family, Coaching, Logs)
              setLogsRefreshTrigger(prev => prev + 1);
            }}
          />
        )}
        {activeTab === 'developer_guide' && (
          <DeveloperGuide onBack={() => setActiveTab('settings')} />
        )}
        {activeTab === 'audit' && (
          <DriveAuditTab 
            driveState={driveState} 
            onRefreshLogs={() => setLogsRefreshTrigger(prev => prev + 1)} 
          />
        )}
        {activeTab !== 'home' && activeTab !== 'coaching' && activeTab !== 'profile' && activeTab !== 'family' && activeTab !== 'settings' && activeTab !== 'developer_guide' && activeTab !== 'audit' && (
          <div className="flex h-full items-center justify-center text-stone-500 font-medium">
            Coming soon...
          </div>
        )}
        
        {/* Floating Action Buttons (Left: Upload File, Right: Add Voice Entry) */}
        {!isIntakeNeeded && (activeTab === 'home' || activeTab === 'coaching') && (
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

        {/* New User Profile Setup / Onboarding Modal */}
        {isIntakeNeeded && (
          <IntakeWizard
            initialProfile={userProfile!}
            onSave={async (updatedProfile) => {
              setUserProfile(updatedProfile);
              if (driveState?.contextFileId && driveState?.token) {
                await saveUserProfileToDrive(driveState.token, driveState.contextFileId, updatedProfile);
              }
            }}
          />
        )}
      </main>

      {/* Bottom Navigation (hidden during intake onboarding) */}
      {!isIntakeNeeded && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-40">
          <div className="max-w-md mx-auto flex justify-between items-center px-4 sm:px-6 py-2.5 pb-safe">
            <NavItem 
              icon={<Home size={26} strokeWidth={activeTab === 'home' ? 2.5 : 2} />} 
              label="Home" 
              active={activeTab === 'home'} 
              onClick={() => setActiveTab('home')}
            />
            <NavItem 
              icon={<MessageCircle size={26} strokeWidth={activeTab === 'coaching' ? 2.5 : 2} />} 
              label="Coaching" 
              active={activeTab === 'coaching'}
              onClick={() => setActiveTab('coaching')}
            />
            <NavItem 
              icon={<ScanSearch size={26} strokeWidth={activeTab === 'audit' ? 2.5 : 2} />} 
              label="Audit" 
              active={activeTab === 'audit'}
              onClick={() => setActiveTab('audit')}
            />
            <NavItem 
              icon={<Users size={26} strokeWidth={activeTab === 'family' ? 2.5 : 2} />} 
              label="Family" 
              active={activeTab === 'family'}
              variant="canopy"
              onClick={() => setActiveTab('family')}
            />
            <NavItem 
              icon={<Settings size={26} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />} 
              label="Settings" 
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
            />
          </div>
        </nav>
      )}

      {/* Android Back / Swipe Exit Toast Prompt */}
      {showExitToast && (
        <div 
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="bg-stone-900/90 text-white backdrop-blur-md px-4 py-2.5 rounded-full shadow-2xl border border-white/10 flex items-center gap-2">
            <LogOut size={13} className="text-amber-400 rotate-180" />
            <span className="text-xs font-semibold tracking-wide">Press back again to exit</span>
          </div>
        </div>
      )}
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
