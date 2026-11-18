/** Low-precision solar position (NOAA / Meeus), enough for map lighting. */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Abuja / geographic centre of Nigeria — used for “live” sky. */
export const NIGERIA_ORIGIN = { lat: 9.08, lon: 8.68 };

interface Ephemeris {
  declination: number;
  equationOfTime: number;
}

function ephemeris(date: Date): Ephemeris {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const t = (julianDay - 2451545) / 36525;
  const meanLong = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = meanAnomaly * RAD;
  const centre =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLong =
    (meanLong + centre - 0.00569 - 0.00478 * Math.sin(omega)) * RAD;
  const meanObliquity =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * RAD;
  const declination =
    Math.asin(Math.sin(obliquity) * Math.sin(apparentLong)) * DEG;

  const y = Math.tan(obliquity / 2) ** 2;
  const l = meanLong * RAD;
  const equationOfTime =
    4 *
    DEG *
    (y * Math.sin(2 * l) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l) -
      0.5 * y * y * Math.sin(4 * l) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));

  return { declination, equationOfTime };
}

function utcMinutes(date: Date): number {
  return (
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60
  );
}

/** Point on Earth where the sun is directly overhead. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const { declination, equationOfTime } = ephemeris(date);
  const lon = (720 - utcMinutes(date) - equationOfTime) / 4;
  return { lat: declination, lon: ((lon + 540) % 360) - 180 };
}

export interface SunPosition {
  /** Degrees above the horizon. Negative at night. */
  altitude: number;
  /** Compass bearing in degrees, clockwise from north. */
  azimuth: number;
}

export function sunPosition(
  date: Date,
  lat = NIGERIA_ORIGIN.lat,
  lon = NIGERIA_ORIGIN.lon
): SunPosition {
  const { declination, equationOfTime } = ephemeris(date);
  const solarTime = utcMinutes(date) + equationOfTime + 4 * lon;
  const hourAngle = (solarTime / 4 - 180) * RAD;
  const phi = lat * RAD;
  const delta = declination * RAD;
  const sinAlt =
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
  const azimuth =
    (Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)
    ) *
      DEG +
      180 +
      360) %
    360;
  return { altitude, azimuth };
}

/** Unit vector toward the sun: +x east, +y up, +z south. */
export function sunDirection(
  date: Date,
  lat = NIGERIA_ORIGIN.lat,
  lon = NIGERIA_ORIGIN.lon
): [number, number, number] {
  const { altitude, azimuth } = sunPosition(date, lat, lon);
  const alt = altitude * RAD;
  const az = azimuth * RAD;
  return [
    Math.cos(alt) * Math.sin(az),
    Math.sin(alt),
    -Math.cos(alt) * Math.cos(az),
  ];
}

/** Fractional hour + day-of-year in Africa/Lagos (WAT), from the device clock. */
export function nigeriaClockParts(date = new Date()): {
  hour: number;
  dayOfYear: number;
  label: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const hour = get("hour") + get("minute") / 60 + get("second") / 3600;
  const month = get("month");
  const day = get("day");
  const year = date.getFullYear();
  // Approximate day-of-year in WAT calendar date
  const start = Date.UTC(year, 0, 0);
  const watNoon = Date.UTC(year, month - 1, day, 12);
  const dayOfYear = Math.max(1, Math.min(365, Math.round((watNoon - start) / 86400000)));

  const hh = String(Math.floor(hour) % 24).padStart(2, "0");
  const mm = String(Math.floor((hour % 1) * 60)).padStart(2, "0");

  return { hour, dayOfYear, label: `${hh}:${mm}` };
}

export function formatSunLine(date = new Date(), lat = NIGERIA_ORIGIN.lat, lon = NIGERIA_ORIGIN.lon): string {
  const { altitude } = sunPosition(date, lat, lon);
  const rounded = Math.round(altitude);
  return rounded >= 0
    ? `sun ${rounded}° above the horizon`
    : `sun ${Math.abs(rounded)}° below the horizon`;
}

export interface SunTimes {
  /** Null when the sun does not cross the horizon that day. */
  rise: Date | null;
  set: Date | null;
}

/** Sunrise and sunset on the UTC day of `date`. */
export function sunTimes(
  date: Date,
  lat = NIGERIA_ORIGIN.lat,
  lon = NIGERIA_ORIGIN.lon
): SunTimes {
  const noon = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
  );
  const { declination, equationOfTime } = ephemeris(noon);
  const phi = lat * RAD;
  const delta = declination * RAD;
  // 90.833 degrees: the sun's upper edge on the horizon, with refraction.
  const cosH =
    (Math.cos(90.833 * RAD) - Math.sin(phi) * Math.sin(delta)) /
    (Math.cos(phi) * Math.cos(delta));
  if (cosH < -1 || cosH > 1) return { rise: null, set: null };
  const half = Math.acos(cosH) * DEG * 4;
  const solarNoon = 720 - 4 * lon - equationOfTime;
  const midnight = noon.getTime() - 12 * 3600000;
  return {
    rise: new Date(midnight + (solarNoon - half) * 60000),
    set: new Date(midnight + (solarNoon + half) * 60000),
  };
}
