import { 
  Shield, 
  UserPlus, 
  Lock, 
  Mail, 
  Trash2, 
  CheckCircle2, 
  Share2, 
  FolderKey, 
  LogOut, 
  AlertCircle, 
  Loader2,
  User,
  Sparkles,
  Save,
  Scale,
  Ruler,
  Activity,
  Heart,
  Globe,
  Utensils,
  Flame,
  Footprints,
  Timer,
  Target,
  RefreshCw,
  Check,
  BookOpen,
  FolderSync,
  ChevronRight,
  Database
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { getFolderPermissions, addFolderPermission, removeFolderPermission } from '../lib/drive';
import { DriveState, UserProfile, UserTargets } from '../types';
import { User as FirebaseUser } from 'firebase/auth';

interface SettingsProps {
  onLogout?: () => void;
  driveState?: DriveState | null;
  user?: FirebaseUser | { displayName?: string | null; email?: string | null; photoURL?: string | null } | null;
  userProfile?: UserProfile | null;
  onUpdateProfile?: (profile: UserProfile) => Promise<void> | void;
  onTriggerManualSync?: () => Promise<void> | void;
  isSyncingExternal?: boolean;
  onOpenDeveloperGuide?: () => void;
}

export default function Settings({ 
  onLogout, 
  driveState, 
  user, 
  userProfile, 
  onUpdateProfile,
  onTriggerManualSync,
  isSyncingExternal = false,
  onOpenDeveloperGuide
}: SettingsProps) {
  // External data import toggle state
  const [enableExternalImport, setEnableExternalImport] = useState(userProfile?.enableExternalDataImport || false);
  const [isTogglingImport, setIsTogglingImport] = useState(false);

  // Caregiver sharing state
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Profile section state
  const [nickname, setNickname] = useState(userProfile?.nickname || '');
  const [age, setAge] = useState(userProfile?.age ? String(userProfile.age) : '');
  const [gender, setGender] = useState(userProfile?.gender || '');
  const [height, setHeight] = useState(userProfile?.height || '');
  const [weight, setWeight] = useState(userProfile?.weight || '');
  const [lifestyle, setLifestyle] = useState(userProfile?.lifestyle || '');
  const [dietaryPreference, setDietaryPreference] = useState(userProfile?.dietaryPreference || '');
  const [healthGoals, setHealthGoals] = useState(userProfile?.healthGoals || '');
  const [primaryLanguage, setPrimaryLanguage] = useState(userProfile?.primaryLanguage || 'English');
  const [notes, setNotes] = useState(userProfile?.notes || '');
  const [targetCalories, setTargetCalories] = useState(userProfile?.userTargets?.calories ? String(userProfile.userTargets.calories) : '');
  const [targetActiveTime, setTargetActiveTime] = useState(userProfile?.userTargets?.activeTimeMins ? String(userProfile.userTargets.activeTimeMins) : '');
  const [targetRestingHR, setTargetRestingHR] = useState(userProfile?.userTargets?.restingHeartRate ? String(userProfile.userTargets.restingHeartRate) : '');
  const [targetWeight, setTargetWeight] = useState(userProfile?.userTargets?.weight || '');
  const [targetSteps, setTargetSteps] = useState(userProfile?.userTargets?.steps ? String(userProfile.userTargets.steps) : '');
  const [aiTargets, setAiTargets] = useState<UserTargets | null>(userProfile?.aiTargets || null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isCalculatingAiTargets, setIsCalculatingAiTargets] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Keep form in sync when userProfile updates
  useEffect(() => {
    if (userProfile) {
      if (userProfile.nickname !== undefined) setNickname(userProfile.nickname);
      if (userProfile.age !== undefined) setAge(String(userProfile.age));
      if (userProfile.gender !== undefined) setGender(userProfile.gender);
      if (userProfile.height !== undefined) setHeight(userProfile.height);
      if (userProfile.weight !== undefined) setWeight(userProfile.weight);
      if (userProfile.lifestyle !== undefined) setLifestyle(userProfile.lifestyle);
      if (userProfile.dietaryPreference !== undefined) setDietaryPreference(userProfile.dietaryPreference);
      if (userProfile.healthGoals !== undefined) setHealthGoals(userProfile.healthGoals);
      if (userProfile.primaryLanguage !== undefined) setPrimaryLanguage(userProfile.primaryLanguage);
      if (userProfile.notes !== undefined) setNotes(userProfile.notes);
      if (userProfile.userTargets) {
        if (userProfile.userTargets.calories !== undefined) setTargetCalories(String(userProfile.userTargets.calories));
        if (userProfile.userTargets.activeTimeMins !== undefined) setTargetActiveTime(String(userProfile.userTargets.activeTimeMins));
        if (userProfile.userTargets.restingHeartRate !== undefined) setTargetRestingHR(String(userProfile.userTargets.restingHeartRate));
        if (userProfile.userTargets.weight !== undefined) setTargetWeight(userProfile.userTargets.weight);
        if (userProfile.userTargets.steps !== undefined) setTargetSteps(String(userProfile.userTargets.steps));
      }
      if (userProfile.aiTargets) {
        setAiTargets(userProfile.aiTargets);
      }
      if (userProfile.enableExternalDataImport !== undefined) {
        setEnableExternalImport(userProfile.enableExternalDataImport);
      }
    }
  }, [userProfile]);

  const handleToggleExternalImport = async (checked: boolean) => {
    setEnableExternalImport(checked);
    if (!onUpdateProfile) return;
    setIsTogglingImport(true);
    try {
      const updated: UserProfile = {
        ...userProfile,
        enableExternalDataImport: checked
      };
      await onUpdateProfile(updated);
    } catch (e) {
      console.error('Failed to toggle external import setting:', e);
      setEnableExternalImport(!checked);
    } finally {
      setIsTogglingImport(false);
    }
  };

  const calculateAiRecommendations = async (profileData: UserProfile): Promise<UserTargets | null> => {
    try {
      const res = await fetch('/api/calculate-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userProfile: profileData })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.recommendedTargets) {
          return data.recommendedTargets;
        }
      }
    } catch (err) {
      console.warn('Could not calculate AI targets:', err);
    }
    return null;
  };

  const handleManualCalculateAi = async () => {
    setIsCalculatingAiTargets(true);
    const tempProfile: UserProfile = {
      ...userProfile,
      nickname: nickname.trim(),
      age: age ? Number(age) || age : undefined,
      gender: gender.trim(),
      height: height.trim(),
      weight: weight.trim(),
      lifestyle: lifestyle.trim(),
      dietaryPreference: dietaryPreference.trim(),
      healthGoals: healthGoals.trim(),
      primaryLanguage: primaryLanguage.trim(),
      notes: notes.trim(),
    };
    const calculated = await calculateAiRecommendations(tempProfile);
    if (calculated) {
      setAiTargets(calculated);
    }
    setIsCalculatingAiTargets(false);
  };

  const applyAiTargetToField = (field: keyof UserTargets) => {
    if (!aiTargets) return;
    if (field === 'calories' && aiTargets.calories) setTargetCalories(String(aiTargets.calories));
    if (field === 'activeTimeMins' && aiTargets.activeTimeMins) setTargetActiveTime(String(aiTargets.activeTimeMins));
    if (field === 'restingHeartRate' && aiTargets.restingHeartRate) setTargetRestingHR(String(aiTargets.restingHeartRate));
    if (field === 'weight' && aiTargets.weight) setTargetWeight(aiTargets.weight);
    if (field === 'steps' && aiTargets.steps) setTargetSteps(String(aiTargets.steps));
  };

  const applyAllAiTargets = () => {
    if (!aiTargets) return;
    if (aiTargets.calories) setTargetCalories(String(aiTargets.calories));
    if (aiTargets.activeTimeMins) setTargetActiveTime(String(aiTargets.activeTimeMins));
    if (aiTargets.restingHeartRate) setTargetRestingHR(String(aiTargets.restingHeartRate));
    if (aiTargets.weight) setTargetWeight(aiTargets.weight);
    if (aiTargets.steps) setTargetSteps(String(aiTargets.steps));
  };

  useEffect(() => {
    if (driveState) {
      loadPermissions();
    }
  }, [driveState]);

  const loadPermissions = async () => {
    if (!driveState) return;
    setIsLoading(true);
    try {
      const perms = await getFolderPermissions(driveState.token, driveState.familyFolderId);
      // Filter out the owner so we only show the invited people
      const invited = perms.filter((p: any) => p.role !== 'owner');
      setCaregivers(invited);
    } catch (err) {
      console.error('Error loading permissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    if (!email.trim() || !driveState) return;
    setIsAdding(true);
    setErrorMsg('');
    try {
      await addFolderPermission(driveState.token, driveState.familyFolderId, email);
      setEmail('');
      setIsAdding(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      await loadPermissions();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to share folder');
      setIsAdding(false);
    }
  };

  const removeCaregiver = async (permissionId: string) => {
    if (!driveState) return;
    try {
      await removeFolderPermission(driveState.token, driveState.familyFolderId, permissionId);
      await loadPermissions();
    } catch (err) {
      console.error('Error removing permission:', err);
    }
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingProfile(true);
    setProfileSuccess(false);

    const userTargetsData: UserTargets = {
      calories: targetCalories ? Number(targetCalories) : undefined,
      activeTimeMins: targetActiveTime ? Number(targetActiveTime) : undefined,
      restingHeartRate: targetRestingHR ? Number(targetRestingHR) : undefined,
      weight: targetWeight.trim() || undefined,
      steps: targetSteps ? Number(targetSteps) : undefined,
    };

    const tempProfile: UserProfile = {
      ...userProfile,
      // Keep verified Google account info read-only
      displayName: user?.displayName || userProfile?.displayName || '',
      email: user?.email || userProfile?.email || '',
      photoURL: user?.photoURL || userProfile?.photoURL || '',
      // User editable fields
      nickname: nickname.trim(),
      age: age ? Number(age) || age : undefined,
      gender: gender.trim(),
      height: height.trim(),
      weight: weight.trim(),
      lifestyle: lifestyle.trim(),
      dietaryPreference: dietaryPreference.trim(),
      healthGoals: healthGoals.trim(),
      primaryLanguage: primaryLanguage.trim(),
      notes: notes.trim(),
      userTargets: userTargetsData,
      updatedAt: new Date().toISOString()
    };

    // Calculate AI recommended targets with the new profile data
    let computedAiTargets = aiTargets;
    try {
      const calculated = await calculateAiRecommendations(tempProfile);
      if (calculated) {
        computedAiTargets = calculated;
        setAiTargets(calculated);
      }
    } catch (aiErr) {
      console.warn('AI target calculation error during save:', aiErr);
    }

    const updatedProfile: UserProfile = {
      ...tempProfile,
      userTargets: userTargetsData,
      aiTargets: computedAiTargets || undefined,
      updatedAt: new Date().toISOString()
    };

    try {
      if (onUpdateProfile) {
        await onUpdateProfile(updatedProfile);
      }
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert('Failed to save profile. Please check your connection.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const googleDisplayName = user?.displayName || userProfile?.displayName || 'Google Account User';
  const googleEmail = user?.email || userProfile?.email || 'Connected via Google Drive';
  const userPhoto = user?.photoURL || userProfile?.photoURL;

  return (
    <div className="flex flex-col gap-6 pt-8 pb-40">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
          Settings & Profile
        </h1>
        <p className="text-lg text-stone-500 font-medium">
          Manage your personal health context, Google Drive, and family permissions.
        </p>
      </header>

      {/* Profile Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <User size={22} className="text-teal-700" />
            <h2 className="text-xl font-bold text-stone-900">Personal Health Profile</h2>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider bg-canopy-50 text-canopy-800 border border-canopy-200/80 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <Sparkles size={12} className="text-canopy-600" />
            LLM Context
          </span>
        </div>

        <p className="text-sm font-medium text-stone-500 px-1 leading-relaxed">
          This profile provides crucial baseline context for Gemini when analyzing your spoken voice memos, extracting medical facts, and compiling caregiver digests.
        </p>

        {profileSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Profile updated in Google Drive!</span>
              <span className="text-xs text-emerald-700">Home page greeting and LLM context will now use your preferred details.</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="bg-white rounded-[2rem] border border-stone-200 shadow-sm p-6 flex flex-col gap-5">
          {/* Read-Only Google Account Credentials Card */}
          <div className="bg-stone-50/90 rounded-2xl p-4 border border-stone-200/80 flex flex-col gap-3">
            <div className="flex items-center">
              <span className="text-xs font-extrabold tracking-wider uppercase text-stone-500 flex items-center gap-1.5">
                <Lock size={13} className="text-stone-400" />
                Google Drive Account (Read-Only)
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              {userPhoto ? (
                <img 
                  src={userPhoto} 
                  alt={googleDisplayName} 
                  className="w-12 h-12 rounded-full border border-stone-200 object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 font-extrabold text-lg flex items-center justify-center shrink-0 border border-teal-200">
                  {googleDisplayName.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-stone-900 text-base truncate">{googleDisplayName}</span>
                </div>
                <span className="text-stone-500 text-xs font-medium truncate flex items-center gap-1 mt-0.5">
                  <Mail size={12} className="text-stone-400 shrink-0" />
                  {googleEmail}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-stone-400 font-medium border-t border-stone-200/60 pt-2">
              Name and email are pulled directly from your active Google Drive sign-in session.
            </p>
          </div>

          {/* Editable LLM Context Fields */}
          <div className="flex flex-col gap-4 pt-1">
            {/* Nick Name / Preferred Greeting */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                  Preferred Nickname
                </label>
                <span className="text-[11px] text-teal-700 font-medium">Used for Home greeting & Caregiver Digest</span>
              </div>
              <input 
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="e.g. Amma, Karthik, Dad, Lakshmi"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
              />
              <p className="text-[11px] text-stone-400">
                If provided, Nalama will greet you as "{nickname.trim() || 'Nickname'}" on the home screen instead of your full Google Account name.
              </p>
            </div>

            {/* Age & Gender */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                  Age
                </label>
                <input 
                  type="number"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 62"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                  Gender
                </label>
                <select 
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                >
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Height & Weight */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                  <Ruler size={13} className="text-stone-400" />
                  <span>Height</span>
                </div>
                <input 
                  type="text"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="e.g. 5 ft 8 in / 172 cm"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                  <Scale size={13} className="text-stone-400" />
                  <span>Weight</span>
                </div>
                <input 
                  type="text"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g. 68 kg / 150 lbs"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                />
              </div>
            </div>

            {/* Lifestyle / Activity Level */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                <Activity size={13} className="text-stone-400" />
                <span>Lifestyle & Activity Level</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'Sedentary', label: 'Sedentary', desc: 'Minimal movement / desk work' },
                  { key: 'Lightly Active', label: 'Lightly Active', desc: 'Daily strolls, light chores' },
                  { key: 'Moderately Active', label: 'Moderately Active', desc: 'Brisk walk 30+ min, yoga' },
                  { key: 'Very Active', label: 'Very Active', desc: 'Daily intense workouts' }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setLifestyle(item.key)}
                    className={`p-3 rounded-xl text-left border transition-all flex flex-col gap-0.5 ${
                      lifestyle === item.key
                        ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600'
                        : 'border-stone-200 bg-stone-50/40 hover:bg-stone-50'
                    }`}
                  >
                    <span className={`text-xs font-bold ${lifestyle === item.key ? 'text-teal-900' : 'text-stone-800'}`}>
                      {item.label}
                    </span>
                    <span className="text-[10px] text-stone-500 font-medium leading-tight">
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dietary Preference & Primary Language */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                  <Utensils size={13} className="text-stone-400" />
                  <span>Dietary Preference</span>
                </div>
                <input 
                  type="text"
                  value={dietaryPreference}
                  onChange={(e) => setDietaryPreference(e.target.value)}
                  placeholder="e.g. Vegetarian, Diabetic-friendly, Low sodium"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                  <Globe size={13} className="text-stone-400" />
                  <span>Primary Spoken Language</span>
                </div>
                <select 
                  value={primaryLanguage}
                  onChange={(e) => setPrimaryLanguage(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                >
                  <option value="English">English</option>
                  <option value="Tamil">Tamil (தமிழ் / Tanglish)</option>
                  <option value="Hindi">Hindi (हिंदी / Hinglish)</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Kannada">Kannada</option>
                  <option value="Malayalam">Malayalam</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Health Goals & Focus */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                <Heart size={13} className="text-stone-400" />
                <span>Health Goals & Focus Areas</span>
              </div>
              <input 
                type="text"
                value={healthGoals}
                onChange={(e) => setHealthGoals(e.target.value)}
                placeholder="e.g. Blood pressure management, 6,000 daily steps, restful sleep"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
              />
            </div>

            {/* Daily Health Targets & Goals Sub-section */}
            <div className="pt-4 border-t border-stone-200/80 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Target size={16} className="text-teal-700" />
                    <h3 className="text-sm font-bold text-stone-900">
                      Daily Health Targets & Goals
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500 font-medium mt-0.5">
                    Configure your daily targets to customize dashboard widgets and tracking bars.
                  </p>
                </div>
              </div>

              {/* Target Input Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Calories Target */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                      <Flame size={13} className="text-orange-500" />
                      <span>Calories / Day</span>
                    </label>
                    {aiTargets?.calories && (
                      <button 
                        type="button" 
                        onClick={() => applyAiTargetToField('calories')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                        title="Copy AI recommendation"
                      >
                        AI: {aiTargets.calories} kcal
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={targetCalories}
                      onChange={(e) => setTargetCalories(e.target.value)}
                      placeholder={aiTargets?.calories ? String(aiTargets.calories) : "e.g. 2000"}
                      className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">kcal</span>
                  </div>
                </div>

                {/* Active Time Target */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                      <Timer size={13} className="text-blue-500" />
                      <span>Active Time</span>
                    </label>
                    {aiTargets?.activeTimeMins && (
                      <button 
                        type="button" 
                        onClick={() => applyAiTargetToField('activeTimeMins')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                        title="Copy AI recommendation"
                      >
                        AI: {aiTargets.activeTimeMins}m
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={targetActiveTime}
                      onChange={(e) => setTargetActiveTime(e.target.value)}
                      placeholder={aiTargets?.activeTimeMins ? String(aiTargets.activeTimeMins) : "e.g. 30"}
                      className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">mins</span>
                  </div>
                </div>

                {/* Resting HR Target */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                      <Heart size={13} className="text-rose-500" />
                      <span>Resting Heart Rate</span>
                    </label>
                    {aiTargets?.restingHeartRate && (
                      <button 
                        type="button" 
                        onClick={() => applyAiTargetToField('restingHeartRate')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                        title="Copy AI recommendation"
                      >
                        AI: {aiTargets.restingHeartRate} bpm
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={targetRestingHR}
                      onChange={(e) => setTargetRestingHR(e.target.value)}
                      placeholder={aiTargets?.restingHeartRate ? String(aiTargets.restingHeartRate) : "e.g. 65"}
                      className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">bpm</span>
                  </div>
                </div>

                {/* Target Weight */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                      <Scale size={13} className="text-stone-500" />
                      <span>Target Weight</span>
                    </label>
                    {aiTargets?.weight && (
                      <button 
                        type="button" 
                        onClick={() => applyAiTargetToField('weight')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                        title="Copy AI recommendation"
                      >
                        AI: {aiTargets.weight}
                      </button>
                    )}
                  </div>
                  <input 
                    type="text" 
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    placeholder={aiTargets?.weight ? aiTargets.weight : "e.g. 68 kg"}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                  />
                </div>

                {/* Daily Steps Target */}
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs font-bold text-stone-700 uppercase tracking-wide">
                      <Footprints size={13} className="text-teal-600" />
                      <span>Daily Steps Goal</span>
                    </label>
                    {aiTargets?.steps && (
                      <button 
                        type="button" 
                        onClick={() => applyAiTargetToField('steps')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 underline"
                        title="Copy AI recommendation"
                      >
                        AI: {aiTargets.steps.toLocaleString()} steps
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={targetSteps}
                      onChange={(e) => setTargetSteps(e.target.value)}
                      placeholder={aiTargets?.steps ? String(aiTargets.steps) : "e.g. 6000"}
                      className="w-full pl-3.5 pr-16 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">steps/day</span>
                  </div>
                </div>
              </div>

              {/* AI Recommended Targets Banner / Card */}
              <div className="p-4 bg-teal-50/70 border border-teal-200/80 rounded-2xl flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={15} className="text-teal-700" />
                    <span className="text-xs font-bold text-teal-950 uppercase tracking-wider">
                      AI Recommended Health Baseline
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleManualCalculateAi}
                    disabled={isCalculatingAiTargets}
                    className="flex items-center gap-1 text-xs font-bold text-teal-800 hover:text-teal-900 bg-white/80 hover:bg-white px-2.5 py-1 rounded-lg border border-teal-200 shadow-2xs transition-colors"
                  >
                    {isCalculatingAiTargets ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    <span>{isCalculatingAiTargets ? 'Calculating...' : 'Recalculate AI Targets'}</span>
                  </button>
                </div>

                {aiTargets ? (
                  <div className="flex flex-col gap-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-2xs">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">Calories</span>
                        <span className="text-xs font-bold text-stone-800">{aiTargets.calories || 2000} kcal</span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-2xs">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">Active Time</span>
                        <span className="text-xs font-bold text-stone-800">{aiTargets.activeTimeMins || 30} mins</span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-2xs">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">Resting HR</span>
                        <span className="text-xs font-bold text-stone-800">{aiTargets.restingHeartRate || 65} bpm</span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-2xs">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">Weight</span>
                        <span className="text-xs font-bold text-stone-800">{aiTargets.weight || 'Maintain'}</span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-2xs col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-stone-400 block uppercase">Steps</span>
                        <span className="text-xs font-bold text-stone-800">{(aiTargets.steps || 6000).toLocaleString()}</span>
                      </div>
                    </div>

                    {aiTargets.rationale && (
                      <p className="text-xs text-teal-900/80 italic font-medium leading-relaxed bg-white/50 p-2.5 rounded-xl border border-teal-100/60">
                        &ldquo;{aiTargets.rationale}&rdquo;
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={applyAllAiTargets}
                        className="text-xs font-bold text-teal-800 hover:text-teal-950 flex items-center gap-1 hover:underline"
                      >
                        <Check size={13} strokeWidth={2.5} />
                        <span>Apply All AI Targets to Form</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-stone-600 font-medium">
                    AI will automatically analyze your demographic baseline and goals on profile save to recommend personalized targets.
                  </p>
                )}
              </div>
            </div>

            {/* Additional LLM Context Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                Additional Health & Routine Notes (Context for AI)
              </label>
              <textarea 
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Early riser (6 AM), prefers herbal tea over coffee, mild knee stiffness in cold weather, retired teacher."
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50/50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white text-sm resize-none"
              />
              <p className="text-[11px] text-stone-400">
                Gemini uses these background details to deliver more tailored coaching insights and more empathetic caregiver summaries.
              </p>
            </div>
          </div>

          {/* Save Profile Button */}
          <button 
            type="submit"
            disabled={isSavingProfile}
            className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-teal-300 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm shadow-teal-900/10 mt-2"
          >
            {isSavingProfile ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Saving to Google Drive...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Save Profile Changes</span>
              </>
            )}
          </button>
        </form>
      </section>

      {/* Google Drive Status */}
      <section className="bg-gradient-to-br from-white to-canopy-50/40 rounded-[2rem] border border-canopy-200/80 shadow-sm p-5 flex items-start gap-4">
        <div className="bg-canopy-50 p-3 rounded-2xl shrink-0 border border-canopy-200/60">
          <FolderKey size={24} className="text-canopy-700" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-stone-900">Google Drive Storage</h2>
          <p className="text-sm font-medium text-stone-500 leading-relaxed">
            Your health data and profile context are stored in your private Google Drive file <span className="font-bold text-stone-700">/nalama.family/context_memory.json</span>. Only you control access.
          </p>
        </div>
      </section>

      {/* External Health & Workout Data Import Integration Section */}
      <section className="bg-white rounded-[2rem] border border-stone-200 shadow-sm p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="bg-teal-50 p-3 rounded-2xl shrink-0 border border-teal-200 text-teal-800">
              <FolderSync size={24} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-stone-900">External Health & Workout Import</h2>
                <span className="bg-teal-100/70 text-teal-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-teal-200">
                  BYOS
                </span>
              </div>
              <p className="text-xs font-medium text-stone-500 leading-relaxed">
                Automatically read exported files from Health Connect, Samsung Health, Apple HealthKit, and Gym Workout apps (Hevy, Strong, FitNotes) placed in your Drive.
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input 
              type="checkbox" 
              checked={enableExternalImport} 
              onChange={(e) => handleToggleExternalImport(e.target.checked)}
              disabled={isTogglingImport}
              className="sr-only peer"
            />
            <div className="w-12 h-7 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-teal-700"></div>
          </label>
        </div>

        {/* Sync Controls & Info when enabled */}
        {enableExternalImport && (
          <div className="flex flex-col gap-3.5 pt-4 border-t border-stone-150 animate-in fade-in duration-200">
            {/* Folder Targets Summary */}
            <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-stone-800 font-bold text-xs">
                <Database size={15} className="text-teal-700" />
                <span>Google Drive Import Locations</span>
              </div>
              <div className="flex flex-col gap-1 text-[11px] font-mono text-stone-600 pl-5">
                <div>• /nalama.family/imports/<span className="text-emerald-700 font-bold">health_data/</span> (*.json, *.csv)</div>
                <div>• /nalama.family/imports/<span className="text-sky-700 font-bold">gym_workouts/</span> (*.json, *.csv)</div>
              </div>
            </div>

            {/* Last Sync Status Banner */}
            {userProfile?.lastImportSyncTimestamp && (
              <div className="flex items-center justify-between text-xs text-stone-600 bg-teal-50/60 p-3 rounded-xl border border-teal-100">
                <span className="font-semibold text-teal-900">
                  Last Sync: {new Date(userProfile.lastImportSyncTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span className="text-[11px] text-teal-700 font-medium truncate max-w-[200px]">
                  {userProfile.lastImportSyncSummary || 'Up to date'}
                </span>
              </div>
            )}

            {/* Manual Sync Trigger Button */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onTriggerManualSync}
                disabled={isSyncingExternal}
                className="flex-1 bg-teal-700 hover:bg-teal-800 disabled:bg-teal-300 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-xs text-xs"
              >
                {isSyncingExternal ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Checking Drive for New Data...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    <span>Sync & Ingest New Data Now</span>
                  </>
                )}
              </button>

              {/* Developer Technical Documentation Link */}
              {onOpenDeveloperGuide && (
                <button
                  type="button"
                  onClick={onOpenDeveloperGuide}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors text-xs border border-stone-200"
                >
                  <BookOpen size={16} className="text-stone-600" />
                  <span>Developer & Schema Guide</span>
                  <ChevronRight size={14} className="text-stone-400" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Info when disabled */}
        {!enableExternalImport && (
          <div className="flex items-center justify-between text-xs text-stone-500 bg-stone-50 p-3 rounded-xl border border-stone-200/60">
            <span>Background import sync is paused. Turn on to check Google Drive on page load.</span>
            {onOpenDeveloperGuide && (
              <button
                type="button"
                onClick={onOpenDeveloperGuide}
                className="text-teal-700 font-bold hover:underline shrink-0 ml-2"
              >
                View Technical Specs
              </button>
            )}
          </div>
        )}
      </section>

      {/* Caregiver Sharing Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 px-1">
          <Shield size={20} className="text-canopy-700" />
          <h2 className="text-xl font-bold text-stone-900">Caregiver Access</h2>
        </div>
        
        <p className="text-stone-500 font-medium px-1 mb-2">
          Securely share your daily "Caregiver Digest" with trusted family members. They will <span className="font-bold text-stone-700">not</span> have access to your raw medical files or chat history.
        </p>

        {showSuccess && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={20} className="text-teal-600 shrink-0" />
            <span className="font-bold text-sm">Google Drive permissions updated successfully!</span>
          </div>
        )}

        {/* Existing Caregivers */}
        <div className="flex flex-col gap-3">
          {isLoading && caregivers.length === 0 ? (
             <div className="p-6 text-center text-stone-400 flex justify-center">
               <Loader2 className="animate-spin" size={24} />
             </div>
          ) : caregivers.length === 0 ? (
             <div className="p-6 text-center">
               <p className="text-sm font-medium text-stone-400">No caregivers have been invited yet.</p>
             </div>
          ) : (
            caregivers.map((cg) => (
              <div key={cg.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-stone-900">{cg.emailAddress}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-canopy-700 bg-canopy-50 px-2 py-0.5 rounded-md border border-canopy-200/60 w-fit">
                    Google Drive Linked
                  </span>
                </div>
                <button 
                  onClick={() => removeCaregiver(cg.id)}
                  className="p-2.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  aria-label="Revoke access"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Caregiver Flow */}
        {!isAdding ? (
          <button 
            onClick={() => setIsAdding(true)}
            className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-2 border border-stone-200 border-dashed transition-colors"
          >
            <UserPlus size={20} />
            Add Caregiver
          </button>
        ) : (
          <div className="bg-white p-5 rounded-[2rem] border-2 border-canopy-500 shadow-md flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
            <h3 className="font-bold text-stone-900 text-lg">Invite Caregiver</h3>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-stone-600 uppercase tracking-wide">Google Account Email</label>
              <div className="relative">
                <Mail size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. son@gmail.com"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-canopy-500"
                />
              </div>
              {errorMsg && <p className="text-rose-500 text-xs font-medium px-2">{errorMsg}</p>}
            </div>

            <div className="flex items-start gap-3 bg-canopy-50/70 p-3 rounded-xl border border-canopy-100 mt-1">
              <Lock size={16} className="text-canopy-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-canopy-950 leading-relaxed">
                This adds their email as a "Reader" exclusively to the <span className="font-bold">/nalama.family/family_share</span> folder in your Google Drive.
              </p>
            </div>

            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => { setIsAdding(false); setErrorMsg(''); }}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-3.5 px-4 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleShare}
                disabled={!email}
                className="flex-[2] bg-canopy-600 hover:bg-canopy-700 disabled:bg-canopy-300 disabled:cursor-not-allowed text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Share2 size={20} />
                Grant Access
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Account Section */}
      <section className="flex flex-col gap-4 pt-6 border-t border-stone-200">
        <div className="flex items-center gap-2 px-1">
          <AlertCircle size={20} className="text-stone-900" />
          <h2 className="text-xl font-bold text-stone-900">Account</h2>
        </div>
        
        <div className="bg-white p-5 rounded-[2rem] border border-stone-200 shadow-sm flex flex-col gap-4">
          <p className="text-sm font-medium text-stone-500 leading-relaxed">
            Signing out will disconnect nalama.family from your Google Drive. You will no longer be able to use the app, record health updates, or view your profiles until you sign back in.
          </p>
          
          <button 
            onClick={onLogout}
            className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </section>

      {/* Brand & About Footer */}
      <div className="flex flex-col items-center justify-center gap-2 pt-6 pb-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white p-2 border border-tree-100 shadow-xs flex items-center justify-center">
          <img src="/pwa-192x192.png" alt="nalama tree logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-extrabold text-stone-800">nalama.family</span>
          <span className="text-xs font-semibold text-tree-700">Private Family Health Assistant</span>
          <span className="text-[11px] text-stone-400 mt-0.5">Offline-Ready PWA • Stored in Google Drive</span>
        </div>
      </div>
    </div>
  );
}
