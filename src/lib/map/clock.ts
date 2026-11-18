// Nigerian local time. The map's clock runs on West Africa Time (Lagos)
// whatever the visitor's own time zone is.

const ZONE = "Africa/Lagos";

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "long",
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface LocalTime {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  /** Minutes since local midnight. */
  minutes: number;
}

export function toLocal(date: Date): LocalTime {
  const parts: Record<string, number> = {};
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    minutes: parts.hour * 60 + parts.minute,
  };
}

/** The moment a Nigerian wall clock shows the given date and time. */
export function fromLocal(local: LocalTime): Date {
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, 0, local.minutes);
  // Find the zone's offset at roughly that moment, then apply it.
  const shown = toLocal(new Date(asUtc));
  const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, 0, shown.minutes);
  return new Date(asUtc - (shownAsUtc - asUtc));
}

/** Day of the year, 1 to 365 (366 in a leap year), for a local date. */
export function dayOfYear(local: LocalTime): number {
  return Math.round(
    (Date.UTC(local.year, local.month - 1, local.day) - Date.UTC(local.year, 0, 0)) / 86400000,
  );
}

/** Local date for a day of the year. */
export function fromDayOfYear(year: number, day: number): { month: number; day: number } {
  const date = new Date(Date.UTC(year, 0, day));
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** "14:05" */
export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** "21 June" */
export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

/** "12 Nov, 10:41" */
export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** "14:05" from minutes since midnight. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
