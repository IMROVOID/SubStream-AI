/**
 * Utility for managing authentication state in Cookies with 30-day persistence
 * and localStorage fallback.
 */

export function setCookie(name: string, value: string, days = 30): void {
  try {
    const maxAge = days * 24 * 60 * 60;
    const encodedValue = encodeURIComponent(value);
    document.cookie = `${name}=${encodedValue}; max-age=${maxAge}; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('Failed to set cookie:', e);
  }
}

export function getCookie(name: string): string | null {
  try {
    const cookies = document.cookie ? document.cookie.split('; ') : [];
    for (const cookie of cookies) {
      const [key, ...valParts] = cookie.split('=');
      if (key.trim() === name) {
        return decodeURIComponent(valParts.join('='));
      }
    }
  } catch (e) {
    console.warn('Failed to read cookie:', e);
  }
  return null;
}

export function removeCookie(name: string): void {
  try {
    document.cookie = `${name}=; max-age=0; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('Failed to remove cookie:', e);
  }
}

/**
 * Stores an auth item in both cookies (for 30 days) and localStorage as a fallback.
 */
export function setAuthItem(key: string, value: string, days = 30): void {
  setCookie(key, value, days);
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('localStorage setItem failed:', e);
  }
}

/**
 * Retrieves an auth item, preferring cookie storage and falling back to localStorage.
 */
export function getAuthItem(key: string): string | null {
  const cookieVal = getCookie(key);
  if (cookieVal !== null && cookieVal !== '') {
    return cookieVal;
  }
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * Removes an auth item from both cookies and localStorage.
 */
export function removeAuthItem(key: string): void {
  removeCookie(key);
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('localStorage removeItem failed:', e);
  }
}
