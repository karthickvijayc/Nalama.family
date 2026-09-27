import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Configure persistent local storage on client devices (desktop & mobile PWA)
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Could not set browserLocalPersistence:', err);
  });
}

const provider = new GoogleAuthProvider();
// Required for app to create and manage the /nalama.family folder
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Local storage key for persistent client device token cache
const STORAGE_KEY_TOKEN = 'nalama_drive_access_token';
const STORAGE_KEY_TOKEN_EXPIRY = 'nalama_drive_token_expiry';

// Cache the access token in memory
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Helper to retrieve saved token if valid
export const getStoredAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  
  if (typeof window !== 'undefined') {
    try {
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      const savedExpiry = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
      
      if (savedToken) {
        // If expiry is stored, ensure it has not passed (with 2 min buffer)
        if (savedExpiry) {
          const expiryTime = Number(savedExpiry);
          if (Date.now() > expiryTime - 2 * 60 * 1000) {
            // Token expired
            localStorage.removeItem(STORAGE_KEY_TOKEN);
            localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
            return null;
          }
        }
        cachedAccessToken = savedToken;
        return savedToken;
      }
    } catch (e) {
      console.warn('Failed reading access token from storage:', e);
    }
  }
  return null;
};

// Helper to save token to local storage
const storeAccessToken = (token: string, expiresInSecs = 3600) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      // OAuth tokens usually last 3600 seconds (1 hour). Store timestamp
      const expiry = Date.now() + expiresInSecs * 1000;
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, String(expiry));
    } catch (e) {
      console.warn('Failed writing access token to storage:', e);
    }
  }
};

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getStoredAccessToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        // User is authenticated in Firebase but access token is missing or expired
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
        localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
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
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
  }
  await auth.signOut();
};
