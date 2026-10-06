/**
 * Contact Picker Utility for Nalama.family
 * Leverages the native Web Contact Picker API (navigator.contacts.select)
 * available in modern mobile browsers (Android Chrome, Edge, Samsung Internet, PWAs)
 * with graceful fallback to cached family members and recent contacts.
 */

export interface ContactItem {
  name?: string;
  email: string;
}

const RECENT_CONTACTS_KEY = 'nalama_recent_caregiver_contacts';

/**
 * Checks if the browser natively supports the Web Contact Picker API.
 */
export function isContactPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window &&
    typeof (navigator as any).contacts?.select === 'function'
  );
}

/**
 * Invokes the native system contact picker to select a contact and retrieve their email.
 * Returns the selected contact's email and name, or null if the user cancelled.
 */
export async function pickContactEmail(): Promise<ContactItem | null> {
  if (!isContactPickerSupported()) {
    return null;
  }

  try {
    const contactsManager = (navigator as any).contacts;
    let propsToRequest = ['email'];
    
    // Check supported properties if getProperties is available
    if (typeof contactsManager.getProperties === 'function') {
      const supported = await contactsManager.getProperties();
      if (!supported.includes('email')) {
        throw new Error('Your device contact picker does not support email selection.');
      }
      propsToRequest = supported.includes('name') ? ['name', 'email'] : ['email'];
    }

    const results = await contactsManager.select(propsToRequest, { multiple: false });

    if (!results || !Array.isArray(results) || results.length === 0) {
      return null; // User dismissed or cancelled the picker
    }

    const selected = results[0];
    const email = Array.isArray(selected.email) ? selected.email[0] : selected.email;
    const name = Array.isArray(selected.name) ? selected.name[0] : selected.name;

    if (!email || typeof email !== 'string' || !email.trim()) {
      const contactLabel = name ? `"${name}"` : 'The selected contact';
      throw new Error(`${contactLabel} does not have an email address in your device contacts.`);
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof name === 'string' ? name.trim() : undefined;

    // Cache to recent contacts for quick lookup later
    saveRecentContact(cleanEmail, cleanName);

    return {
      email: cleanEmail,
      name: cleanName
    };
  } catch (err: any) {
    // If the user cancelled or aborted the operation, treat as clean dismissal
    if (
      err.name === 'AbortError' ||
      err.name === 'SecurityError' && err.message?.includes('User cancelled') ||
      err.message?.toLowerCase().includes('cancel')
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Retrieves recently used contacts from localStorage.
 */
export function getRecentContacts(): ContactItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && typeof item.email === 'string' && item.email.includes('@'));
    }
  } catch (e) {
    console.warn('Failed to parse recent contacts:', e);
  }
  return [];
}

/**
 * Saves a contact into the recent contacts list (max 10 recent items).
 */
export function saveRecentContact(email: string, name?: string): void {
  if (typeof window === 'undefined' || !email || !email.includes('@')) return;
  try {
    const existing = getRecentContacts();
    const cleanEmail = email.trim().toLowerCase();
    // Remove if already exists to bump to top
    const filtered = existing.filter(c => c.email.toLowerCase() !== cleanEmail);
    const updated: ContactItem[] = [
      { email: cleanEmail, name: name?.trim() || undefined },
      ...filtered
    ].slice(0, 10);
    localStorage.setItem(RECENT_CONTACTS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save recent contact:', e);
  }
}
