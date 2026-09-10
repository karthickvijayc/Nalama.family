import React, { useState } from 'react';
import { googleSignIn } from '../lib/auth';
import { User } from 'firebase/auth';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function LoginScreen({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center font-sans bg-[#F8FAF8] px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Tree Logo Card */}
        <div className="w-28 h-28 rounded-3xl bg-white p-2.5 shadow-md shadow-tree-900/5 border border-tree-100 flex items-center justify-center relative overflow-hidden group">
          <img 
            src="/pwa-512x512.png" 
            alt="nalama.family Tree Logo" 
            className="w-full h-full object-contain"
          />
        </div>
        
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tree-50 text-tree-700 text-xs font-bold tracking-wide border border-tree-100 mb-2">
            <span>Family Wellness</span>
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">nalama.family</h1>
          <p className="text-base text-stone-600 font-medium mt-2 leading-relaxed">
            Your private family health assistant.
            <br /><span className="text-tree-700 font-semibold">100% stored in your own Google Drive.</span>
          </p>
        </div>

        {loginError && (
          <div className="w-full bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium p-3.5 rounded-2xl flex items-start gap-2.5 text-left animate-in fade-in">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <p>{loginError}</p>
            </div>
          </div>
        )}

        <button 
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="mt-2 w-full bg-white border border-stone-200 hover:border-tree-300 text-stone-800 font-bold text-lg py-4 px-6 rounded-2xl shadow-sm hover:shadow-md active:scale-95 disabled:opacity-60 transition flex items-center justify-center gap-3"
        >
          {isLoggingIn ? (
            <>
              <Loader2 size={20} className="animate-spin text-tree-600" />
              <span>Connecting to Drive...</span>
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

        <p className="text-xs text-stone-400 font-medium mt-4">
          By signing in, you grant nalama.family access to manage a private wellness folder in your Google Drive.
        </p>
      </div>
    </div>
  );
}
