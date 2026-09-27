import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft, 
  Heart, 
  HelpCircle, 
  ShieldCheck, 
  CheckCircle2, 
  Dumbbell, 
  Apple, 
  AlertCircle 
} from 'lucide-react';
import { UserProfile, UserTargets } from '../types';
import { useRegionalVariant } from '../context/RegionalVariantContext';

export interface IntakeWizardProps {
  initialProfile: UserProfile;
  onSave: (updatedProfile: UserProfile) => Promise<void>;
}

export default function IntakeWizard({ initialProfile, onSave }: IntakeWizardProps) {
  const { variant, syncWithProfileLanguage } = useRegionalVariant();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<UserProfile>({
    ...initialProfile,
    nickname: initialProfile.nickname || initialProfile.displayName?.split(' ')[0] || '',
    age: initialProfile.age || '',
    gender: initialProfile.gender || '',
    height: initialProfile.height || '',
    weight: initialProfile.weight || '',
    lifestyle: initialProfile.lifestyle || '',
    dietaryPreference: initialProfile.dietaryPreference || '',
    healthGoals: initialProfile.healthGoals || '',
    primaryLanguage: initialProfile.primaryLanguage || 'English',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tooltip helper state to display helpful subtext cleanly on tap
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const toggleTooltip = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTooltip(activeTooltip === id ? null : id);
  };

  const stepsCount = 4;

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!profile.nickname?.trim()) {
        setError('Please enter a nickname.');
        return;
      }
    }
    if (step < stepsCount) {
      setStep(step + 1);
      setActiveTooltip(null);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
      setActiveTooltip(null);
    }
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Calculate basic targets based on weight / gender
      const weightNum = parseFloat(String(profile.weight)) || 75;
      const calculatedTargets: UserTargets = {
        calories: profile.gender === 'Female' ? 1800 : 2200,
        activeTimeMins: profile.lifestyle === 'Active' || profile.lifestyle === 'Very Active' ? 45 : 30,
        restingHeartRate: 70,
        weight: String(profile.weight) || '75',
        steps: profile.lifestyle === 'Sedentary' ? 6000 : 10000,
        rationale: 'Initial baseline target based on your intake parameters.'
      };

      const finalProfile: UserProfile = {
        ...profile,
        userTargets: calculatedTargets,
        updatedAt: new Date().toISOString(),
      };
      
      // Specifically mark intake complete
      (finalProfile as any).isIntakeComplete = true;

      await onSave(finalProfile);
    } catch (err: any) {
      setError(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Pre-calculated step percentages
  const progressPercent = (step / stepsCount) * 100;

  return (
    <div className="fixed inset-0 z-40 bg-[#F9F7F4] flex flex-col p-6 overflow-y-auto selection:bg-tree-100">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-between py-4">
        
        {/* Step indicator header */}
        <div className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-tree-700 font-extrabold text-sm tracking-wide">Step {step}</span>
              <span className="text-stone-300 font-medium text-xs">of {stepsCount}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 text-[10px] font-bold border border-sky-100">
              <ShieldCheck size={12} className="text-sky-600" />
              <span>Private Local Config</span>
            </div>
          </div>
          
          {/* Custom progress bar */}
          <div className="w-full h-1.5 bg-stone-200/60 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-tree-600 to-sky-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Dynamic Wizard Steps container with AnimatePresence */}
        <div className="flex-1 my-6 flex flex-col justify-center min-h-[360px] relative">
          {error && (
            <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold p-3.5 rounded-2xl flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle size={16} className="text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h2 className="text-2xl font-black text-stone-900 leading-tight">
                    Welcome to <span className="text-tree-700">{variant.brandWord}</span> <span className="text-canopy-600">family</span>!
                  </h2>
                  <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                    Let's set up your personal space. What should we call you?
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Your Nickname</label>
                    <input 
                      type="text"
                      placeholder="e.g. Karthick"
                      value={profile.nickname}
                      onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3.5 px-4 text-stone-900 font-bold text-sm outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Primary Language</label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { lang: 'Tamil', label: 'Tamil (தமிழ்)' },
                        { lang: 'Hindi', label: 'Hindi (हिंदी)' },
                        { lang: 'Telugu', label: 'Telugu (తెలుగు)' },
                        { lang: 'Malayalam', label: 'Malayalam (മലയാളം)' },
                        { lang: 'English', label: 'English' }
                      ].map((item) => {
                        const isSelected = profile.primaryLanguage === item.lang;
                        return (
                          <button
                            key={item.lang}
                            type="button"
                            onClick={() => {
                              setProfile({ ...profile, primaryLanguage: item.lang });
                              syncWithProfileLanguage(item.lang, true);
                            }}
                            className={`py-2.5 px-3 rounded-xl font-bold text-xs border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'border-tree-600 bg-tree-50/70 text-tree-900 shadow-2xs ring-1 ring-tree-500'
                                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Age</label>
                      <button 
                        type="button"
                        onClick={(e) => toggleTooltip('age', e)}
                        className="text-stone-400 hover:text-tree-600 transition-colors"
                        aria-label="More information"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>

                    {activeTooltip === 'age' && (
                      <div className="bg-stone-100 border border-stone-200 rounded-xl p-2.5 text-[10px] text-stone-500 font-medium leading-normal animate-in fade-in mb-1">
                        Age allows our AI coach to tailor caloric goals and exercise intensities safely.
                      </div>
                    )}

                    <input 
                      type="number"
                      placeholder="e.g. 34"
                      value={profile.age}
                      onChange={(e) => setProfile({ ...profile, age: e.target.value ? parseInt(e.target.value) : '' })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3.5 px-4 text-stone-900 font-bold text-sm outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Gender</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['Male', 'Female', 'Other'].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setProfile({ ...profile, gender: g })}
                          className={`py-3 px-2 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${
                            profile.gender === g
                              ? 'border-tree-600 bg-tree-50/50 text-tree-800 shadow-2xs'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h2 className="text-2xl font-black text-stone-900 leading-tight">
                    Physical <span className="text-sky-600">Metrics</span>
                  </h2>
                  <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                    Helps us calculate basal metabolic rate and physical targets. You can edit this anytime.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Height (e.g. cm or ft/in)</label>
                    <input 
                      type="text"
                      placeholder="e.g. 178 cm or 5'10"
                      value={profile.height}
                      onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3.5 px-4 text-stone-900 font-bold text-sm outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Weight (e.g. kg or lbs)</label>
                      <button 
                        type="button"
                        onClick={(e) => toggleTooltip('weight', e)}
                        className="text-stone-400 hover:text-tree-600 transition-colors"
                        aria-label="More information"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>

                    {activeTooltip === 'weight' && (
                      <div className="bg-stone-100 border border-stone-200 rounded-xl p-2.5 text-[10px] text-stone-500 font-medium leading-normal animate-in fade-in mb-1">
                        Providing your weight enables clinical-level calculations for running metrics and caloric offsets.
                      </div>
                    )}

                    <input 
                      type="text"
                      placeholder="e.g. 78 kg or 172 lbs"
                      value={profile.weight}
                      onChange={(e) => setProfile({ ...profile, weight: e.target.value })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3.5 px-4 text-stone-900 font-bold text-sm outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h2 className="text-2xl font-black text-stone-900 leading-tight">
                    Lifestyle & <span className="text-tree-700">Diet</span>
                  </h2>
                  <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                    Customize your baseline activity level and primary nutritional habits.
                  </p>
                </div>

                <div className="flex flex-col gap-4 overflow-y-auto max-h-[300px] pr-1">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Lifestyle & Activity Level</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        { key: 'Sedentary', label: 'Sedentary', desc: 'Minimal movement / desk work' },
                        { key: 'Lightly Active', label: 'Lightly Active', desc: 'Daily strolls, light chores' },
                        { key: 'Moderately Active', label: 'Moderately Active', desc: 'Brisk walk 30+ min, yoga' },
                        { key: 'Very Active', label: 'Very Active', desc: 'Daily intense workouts' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setProfile({ ...profile, lifestyle: item.key })}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            profile.lifestyle === item.key
                              ? 'border-tree-600 bg-tree-50/40 text-tree-900 ring-1 ring-tree-500'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                          }`}
                        >
                          <div className="font-bold text-xs">{item.label}</div>
                          <div className="text-[10px] text-stone-500 mt-0.5 leading-tight font-medium">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 mt-2">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Dietary Preference</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Balanced', 'Vegetarian', 'Vegan', 'Keto'].map((diet) => (
                        <button
                          key={diet}
                          type="button"
                          onClick={() => setProfile({ ...profile, dietaryPreference: diet })}
                          className={`py-2.5 px-2 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${
                            profile.dietaryPreference === diet
                              ? 'border-tree-600 bg-tree-50/50 text-tree-900'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                          }`}
                        >
                          {diet}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-5"
              >
                <div>
                  <h2 className="text-2xl font-black text-stone-900 leading-tight">
                    Health Goals & <span className="text-tree-600">Focus Areas</span>
                  </h2>
                  <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                    This forms the foundation of your personalized recommendations and wellness targets.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Health Goals & Focus Areas</label>
                    <textarea 
                      placeholder="e.g. Blood pressure management, 6,000 daily steps, restful sleep, lose 5kg weight."
                      rows={3}
                      value={profile.healthGoals}
                      onChange={(e) => setProfile({ ...profile, healthGoals: e.target.value })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3.5 px-4 text-stone-900 font-medium text-xs leading-relaxed outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300 resize-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-stone-600 uppercase tracking-wide">Additional Profile Notes</label>
                    <textarea 
                      placeholder="Write any medications, family health patterns or food allergies your AI coach should always keep in mind."
                      rows={2.5}
                      value={profile.notes}
                      onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                      className="w-full bg-white border border-stone-200 focus:border-tree-500 rounded-2xl py-3 px-4 text-stone-900 font-medium text-xs leading-relaxed outline-none focus:ring-2 focus:ring-tree-100 transition-all placeholder:text-stone-300 resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Wizard Controls */}
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-stone-100">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1 || isSaving}
            className="flex items-center gap-1 py-3 px-5 text-stone-500 font-bold text-xs rounded-xl hover:bg-stone-100 disabled:opacity-0 transition cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>

          {step < stepsCount ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 py-3.5 px-6 bg-tree-700 hover:bg-tree-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              <span>Continue</span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-2 py-3.5 px-6 bg-gradient-to-r from-tree-700 to-sky-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Space...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Complete Setup</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
