const pad = (value: number) => String(value).padStart(2, '0');

/** Local build time as YYYYMMDD-HHMM, for try-out build versions. */
export function buildStamp(at: Date): string {
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
}
