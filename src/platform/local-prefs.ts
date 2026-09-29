/**
 * Per-device choices in localStorage; never part of the world or a save. With storage
 * blocked (private mode, site data off) reads find nothing and writes are dropped, so a
 * choice lasts for this page only. `storage` is a getter: with site data blocked,
 * touching `localStorage` itself throws.
 */
export function readPref(
  key: string,
  storage: () => Pick<Storage, 'getItem'> = () => localStorage,
): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** A stored JSON value; null when missing, blocked or not JSON. */
export function readJsonPref(key: string): unknown {
  try {
    return JSON.parse(readPref(key) ?? 'null');
  } catch {
    return null;
  }
}

export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}
