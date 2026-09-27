import React, { useState } from 'react';
import { googleSignIn } from '../lib/auth';
import { User } from 'firebase/auth';
import { 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  HardDrive, 
  Mic, 
  Heart, 
  Users, 
  Sparkles, 
  Lock, 
  ChevronDown, 
  CheckCircle2,
  Info,
  Languages
} from 'lucide-react';
import { useRegionalVariant } from '../context/RegionalVariantContext';

export default function LoginScreen({ 
  onLogin,
  onOpenLegal
}: { 
  onLogin: (user: User, token: string) => void;
  onOpenLegal?: (tab: 'privacy' | 'terms') => void;
}) {
  const { variant, setVariantId, allVariants } = useRegionalVariant();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);

  const handleLogin = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        onLogin(result.user, result.accessToken);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setLoginError('Sign-in popup was closed before completing.');
      } else if (err.code === 'auth/popup-blocked') {
        setLoginError('Sign-in popup was blocked by your browser. Please allow popups or open this app in a new tab.');
      } else {
        setLoginError(err.message || 'Unable to sign in with Google. If previewed in an iframe, try opening in a new tab.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start font-sans bg-[#F8FAF8] px-4 py-8 md:py-12">
      <div className="w-full max-w-lg flex flex-col items-center text-center gap-8 animate-in fade-in duration-300">
        
        {/* Main Hero & Login Box */}
        <div className="w-full bg-white p-6 sm:p-8 rounded-[2.5rem] border border-stone-200/90 shadow-sm flex flex-col items-center gap-6">
          
          {/* Tree Logo */}
          <div className="w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center relative overflow-hidden">
            <img 
              src={variant.logoSrc} 
              alt={`${variant.brandName} Tree Logo`} 
              className="w-full h-full object-contain"
            />
          </div>
          
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tree-50 text-tree-800 text-xs font-bold tracking-wide border border-tree-100 mb-3">
              <ShieldCheck size={14} className="text-tree-700" />
              <span>100% Private Google Drive Storage</span>
            </div>
            <h1 className="flex flex-col items-center select-none mb-3">
              <span className="text-4xl sm:text-5xl font-black tracking-tight leading-none text-tree-700 uppercase">
                {variant.brandWord}
              </span>
              <span className="text-xs sm:text-sm font-bold tracking-[0.25em] text-canopy-600 uppercase mt-1.5">
                family
              </span>
            </h1>
            <p className="text-base text-stone-600 font-medium mt-2 leading-relaxed">
              Your intelligent family wellness assistant.
              <br />
              <span className="text-tree-700 font-bold">Your health data stays in your personal Google Drive.</span>
            </p>

            {/* Regional Variant Language Switcher */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 pt-3 border-t border-stone-100">
              <span className="text-[10px] font-bold text-stone-400 flex items-center gap-1 mr-0.5">
                <Languages size={12} className="text-stone-400" />
                Language:
              </span>
              {allVariants.map((v) => {
                const isActive = v.id === variant.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id, true)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-tree-700 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                    title={`Switch to ${v.brandNameCapitalized} (${v.language}) - /${v.defaultUrlSlug}`}
                  >
                    {v.nativeName} ({v.language})
                  </button>
                );
              })}
            </div>
          </div>

          {loginError && (
            <div className="w-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium p-4 rounded-2xl flex items-start gap-2.5 text-left animate-in fade-in">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1">
                <p>{loginError}</p>
              </div>
            </div>
          )}

          {/* Action Sign In Button */}
          <div className="w-full flex flex-col gap-2">
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full bg-white border border-stone-300 hover:border-tree-400 text-stone-900 font-bold text-lg py-4 px-6 rounded-2xl shadow-sm hover:shadow-md active:scale-95 disabled:opacity-60 transition flex items-center justify-center gap-3 cursor-pointer"
              id="google-signin-btn"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 size={22} className="animate-spin text-tree-600" />
                  <span>Connecting to Google Drive...</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>

          <div className="w-full flex flex-col items-center">
            <button 
              onClick={() => setShowPermissionHelp(!showPermissionHelp)}
              className="text-stone-400 hover:text-stone-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Lock size={12} className="text-stone-400" />
              <span>Permission Notice • Secure Storage Info</span>
              <ChevronDown size={12} className={`transition-transform duration-200 ${showPermissionHelp ? 'rotate-180' : ''}`} />
            </button>
            {showPermissionHelp && (
              <p className="text-stone-500 font-medium text-[11px] leading-relaxed text-center mt-2 px-3 py-2 bg-stone-50 border border-stone-100 rounded-xl animate-in fade-in">
                Grant {variant.brandName} permission to store your encrypted health log files in your own Google Drive.
              </p>
            )}
          </div>

          {/* Quick Legal Links & Tester Options */}
          <div className="flex flex-col items-center gap-2.5 pt-3 border-t border-stone-100 w-full">
            {onOpenLegal && (
              <div className="flex items-center justify-center gap-4 text-xs font-semibold text-stone-500">
                <button 
                  onClick={() => onOpenLegal('privacy')}
                  className="hover:text-tree-700 underline transition-colors cursor-pointer"
                  id="login-privacy-link"
                >
                  Privacy Policy
                </button>
                <span className="text-stone-300">•</span>
                <button 
                  onClick={() => onOpenLegal('terms')}
                  className="hover:text-canopy-700 underline transition-colors cursor-pointer"
                  id="login-terms-link"
                >
                  Terms of Service
                </button>
              </div>
            )}
            
            <button
              onClick={() => onLogin({} as any, 'offline_mode')}
              className="text-[11px] font-semibold text-stone-400 hover:text-stone-600 hover:underline transition-colors cursor-pointer pt-0.5"
              id="offline-demo-btn"
            >
              Are you a Tester? Try Offline Demo Mode
            </button>
          </div>
        </div>

        {/* Public Informational Features Section */}
        <div className="w-full flex flex-col gap-4 text-left">
          <div className="flex items-center gap-2 px-2">
            <Info size={18} className="text-tree-700" />
            <h2 className="text-lg font-bold text-stone-800">What is {variant.brandName}?</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Feature 1 */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-tree-50 border border-tree-100 flex items-center justify-center shrink-0">
                <HardDrive size={20} className="text-tree-700" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold text-stone-900">Bring Your Own Storage (BYOS)</h3>
                <p className="text-xs text-stone-500 leading-relaxed font-medium">
                  We don't store your health logs on company databases. All files are saved as transparent JSON partitions directly inside your Google Drive (<code className="text-tree-800">/nalama.family</code>).
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
                <Mic size={20} className="text-teal-700" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold text-stone-900">Voice-Powered AI Health Logging</h3>
                <p className="text-xs text-stone-500 leading-relaxed font-medium">
                  Speak naturally in {variant.voicePromptLabel} about workouts, meals, medications, and vitals. Google Gemini AI transcribes and extracts structured health metrics automatically.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-canopy-50 border border-canopy-100 flex items-center justify-center shrink-0">
                <Users size={20} className="text-canopy-700" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold text-stone-900">Private Family Caregiver Sharing</h3>
                <p className="text-xs text-stone-500 leading-relaxed font-medium">
                  Invite family members to view AI-generated care digests. Caregivers only receive Read-Only access to a specific subfolder (<code className="text-canopy-800">/family_share</code>) with zero exposure of your private logs.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <Sparkles size={20} className="text-amber-700" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold text-stone-900">4 Intelligent AI Coaching Rooms</h3>
                <p className="text-xs text-stone-500 leading-relaxed font-medium">
                  Interactive AI rooms for Workout Coaching, Nutrition Insights, Medical Routine Tracking, and Mindful Recovery tailored to your personal goals and dietary preferences.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Accordion Section */}
        <div className="w-full bg-white p-5 sm:p-6 rounded-[2rem] border border-stone-200/80 shadow-2xs flex flex-col gap-3 text-left">
          <h3 className="text-sm font-extrabold text-stone-900 uppercase tracking-wide px-1">Frequently Asked Questions</h3>
          
          <div className="flex flex-col divide-y divide-stone-100">
            {/* FAQ 1 */}
            <div className="py-2.5">
              <button 
                onClick={() => toggleFaq(1)}
                className="w-full flex items-center justify-between text-left font-bold text-xs sm:text-sm text-stone-800 hover:text-tree-700 transition-colors cursor-pointer"
              >
                <span>Why does {variant.brandName} need Google Drive access?</span>
                <ChevronDown size={16} className={`text-stone-400 transition-transform ${activeFaq === 1 ? 'rotate-180 text-tree-700' : ''}`} />
              </button>
              {activeFaq === 1 && (
                <p className="text-xs text-stone-500 font-medium mt-2 leading-relaxed animate-in fade-in">
                  To guarantee 100% data privacy. {variant.brandName} does not operate a database of user data. We create a dedicated folder (<code className="font-mono text-tree-800">/nalama.family</code>) in your own Google Drive to store your logs so only you own and control your health history.
                </p>
              )}
            </div>

            {/* FAQ 2 */}
            <div className="py-2.5">
              <button 
                onClick={() => toggleFaq(2)}
                className="w-full flex items-center justify-between text-left font-bold text-xs sm:text-sm text-stone-800 hover:text-tree-700 transition-colors cursor-pointer"
              >
                <span>Is my health information shared with third parties or advertisers?</span>
                <ChevronDown size={16} className={`text-stone-400 transition-transform ${activeFaq === 2 ? 'rotate-180 text-tree-700' : ''}`} />
              </button>
              {activeFaq === 2 && (
                <p className="text-xs text-stone-500 font-medium mt-2 leading-relaxed animate-in fade-in">
                  Never. We do not sell, rent, monetize, or disclose your health data to data brokers, insurers, or advertising platforms.
                </p>
              )}
            </div>

            {/* FAQ 3 */}
            <div className="py-2.5">
              <button 
                onClick={() => toggleFaq(3)}
                className="w-full flex items-center justify-between text-left font-bold text-xs sm:text-sm text-stone-800 hover:text-tree-700 transition-colors cursor-pointer"
              >
                <span>Does {variant.brandName} provide medical advice or diagnosis?</span>
                <ChevronDown size={16} className={`text-stone-400 transition-transform ${activeFaq === 3 ? 'rotate-180 text-tree-700' : ''}`} />
              </button>
              {activeFaq === 3 && (
                <p className="text-xs text-stone-500 font-medium mt-2 leading-relaxed animate-in fade-in">
                  No. {variant.brandName} is a personal lifestyle wellness assistant. It is not a medical device and does not provide clinical medical diagnosis or treatment. Always consult your qualified healthcare provider.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Public Footer */}
        <footer className="flex flex-col items-center justify-center gap-2 text-center text-xs text-stone-400 pb-8">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onOpenLegal?.('privacy')}
              className="text-stone-600 hover:text-tree-700 font-bold underline transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
            <span>•</span>
            <button 
              onClick={() => onOpenLegal?.('terms')}
              className="text-stone-600 hover:text-canopy-700 font-bold underline transition-colors cursor-pointer"
            >
              Terms of Service
            </button>
          </div>
          <p>© 2026 {variant.brandName} • Built for private family wellness</p>
        </footer>

      </div>
    </div>
  );
}
