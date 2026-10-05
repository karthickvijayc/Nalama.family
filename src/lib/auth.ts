import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Local storage key for persistent client device token cache
const STORAGE_KEY_TOKEN = 'nalama_drive_access_token';
const STORAGE_KEY_TOKEN_EXPIRY = 'nalama_drive_token_expiry';

// Cache the access token in memory
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Helper to retrieve saved token without premature purging
export const getStoredAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  
  if (typeof window !== 'undefined') {
    try {
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (savedToken) {
        cachedAccessToken = savedToken;
        return savedToken;
      }
    } catch (e) {
      console.warn('Failed reading access token from storage:', e);
    }
  }
  return null;
};

// Helper to clear token only when explicitly needed (e.g. 401 Unauthorized or Logout)
export const clearStoredAccessToken = (): void => {
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
    } catch (e) {
      // ignore
    }
  }
};

// Helper to save token to local storage
const storeAccessToken = (token: string, expiresInSecs = 3600) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      const expiry = Date.now() + expiresInSecs * 1000;
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, String(expiry));
    } catch (e) {
      console.warn('Failed writing access token to storage:', e);
    }
  }
};

// Initialize auth state listener.
// - onAuthSuccess: User is signed in and has a cached Google Drive token
// - onAuthFailure: No user session found
// - onNeedsDriveToken: User is recognized from Firebase, but needs to refresh Google Drive token
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
  onNeedsDriveToken?: (user: User) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getStoredAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        // User session exists in Firebase, but Drive token needs renewal
        if (onNeedsDriveToken) {
          onNeedsDriveToken(user);
        } else if (onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      // Note: Never wipe localStorage here! 
      // Only logout() should explicitly purge credentials.
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (hintEmail?: string): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    const emailToHint = hintEmail || auth.currentUser?.email;
    if (emailToHint) {
      provider.setCustomParameters({
        login_hint: emailToHint
      });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google Drive access token from Google Sign-In');
    }

    storeAccessToken(credential.accessToken, 3600);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getStoredAccessToken();
};

export const logout = async () => {
  clearStoredAccessToken();
  await auth.signOut();
};
