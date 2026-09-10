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
import { PWAInstallBanner } from './components/PWAInstallBanner';
import LoginScreen from './components/LoginScreen';
import { initAuth, logout } from './lib/auth';
import { findOrCreateFolder, findFileOrFolder, writeJsonFile, readJsonFile, getOrCreateMonthlyLogFile, getOrCreateCareDigestFile, getUserProfileFromDrive, saveUserProfileToDrive } from './lib/drive';
import { executeExternalDataSync } from './lib/importers/syncEngine';
import { User } from 'firebase/auth';
import { Home, MessageCircle, Users, Settings, AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { DriveState, UserProfile } from './types';

export type { DriveState };

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initMessage, setInitMessage] = useState('Loading...');
  const [initError, setInitError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [driveState, setDriveState] = useState<DriveState | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [logsRefreshTrigger, setLogsRefreshTrigger] = useState(0);

  // External Sync Status & UI state
  const [syncStatus, setSyncStatus] = useState<'checking' | 'processing' | 'success' | 'error' | 'idle'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const syncTimeoutRef = useRef<any>(null);
  const initialSyncAttemptedRef = useRef(false);

  // Trigger sync process
  const runExternalDataSync = async (currentDriveState: DriveState, profileToUse?: UserProfile | null) => {
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
      }
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
            primaryLanguage: 'English'
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

      // On Page Load / Initialization: If external import is enabled, trigger background sync
      if (activeUserProfile?.enableExternalDataImport && !initialSyncAttemptedRef.current) {
        initialSyncAttemptedRef.current = true;
        // Non-blocking background execution
        setTimeout(() => {
          runExternalDataSync(newDriveState, activeUserProfile);
        }, 100);
      }
    } catch (err: any) {
      console.error('Failed to initialize drive:', err);
      let errorMsg = err.message || 'Unknown error occurred while connecting to Google Drive.';
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
    return (
      <LoginScreen onLogin={(user, token) => {
        setUser(user);
        setIsInitializing(true);
        initializeDriveEnv(token);
      }} />
    );
  }

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
                await runExternalDataSync(driveState);
              }
            }}
            onUpdateProfile={async (updated) => {
              setUserProfile(updated);
              if (driveState?.contextFileId && driveState?.token) {
                await saveUserProfileToDrive(driveState.token, driveState.contextFileId, updated);
              }
            }}
          />
        )}
        {activeTab === 'developer_guide' && (
          <DeveloperGuide onBack={() => setActiveTab('settings')} />
        )}
        {activeTab !== 'home' && activeTab !== 'coaching' && activeTab !== 'profile' && activeTab !== 'family' && activeTab !== 'settings' && activeTab !== 'developer_guide' && (
          <div className="flex h-full items-center justify-center text-stone-500 font-medium">
            Coming soon...
          </div>
        )}
        
        {/* Floating Voice Button (Only visible on Home and Coaching tabs; removed from Family & Settings) */}
        <VoiceRecorderButton 
          driveState={driveState}
          visible={activeTab === 'home' || activeTab === 'coaching'}
          onLogSaved={() => setLogsRefreshTrigger(prev => prev + 1)}
        />
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
