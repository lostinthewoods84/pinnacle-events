import type { AppConfig, EventConfig, ManualConfig } from "./model.ts";

const httpsUrl = (value: unknown) => typeof value === "string" && /^https:\/\//i.test(value);
const offsetDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);

export function validateConfig(input: unknown): AppConfig {
  if (!input || typeof input !== "object") throw new Error("Configuration must be an object");
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1 || !Array.isArray(raw.events)) throw new Error("Configuration requires version 1 and an events array");
  const ids = new Set<string>();
  const events = raw.events.map((entry, index) => validateEvent(entry, index));
  for (const event of events) {
    if (ids.has(event.id)) throw new Error(`Duplicate event id: ${event.id}`);
    ids.add(event.id);
  }
  return { version: 1, events };
}

function validateEvent(input: unknown, index: number): EventConfig {
  if (!input || typeof input !== "object") throw new Error(`Event ${index} must be an object`);
  const e = input as Record<string, unknown>;
  if (typeof e.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) throw new Error(`Event ${index} has an invalid id`);
  if (e.provider === "runsignup") {
    if (!Number.isInteger(e.raceId) || Number(e.raceId) <= 0) throw new Error(`${e.id}: raceId must be a positive integer`);
    if (e.resultsUrlOverride !== undefined && !httpsUrl(e.resultsUrlOverride)) throw new Error(`${e.id}: resultsUrlOverride must use HTTPS`);
    if (e.resultsHidden !== undefined && typeof e.resultsHidden !== "boolean") throw new Error(`${e.id}: resultsHidden must be boolean`);
    return e as EventConfig;
  }
  if (e.provider !== "manual") throw new Error(`${e.id}: unsupported provider`);
  const requiredStrings = ["registrationProvider", "name"] as const;
  for (const key of requiredStrings) if (typeof e[key] !== "string" || !e[key]) throw new Error(`${e.id}: ${key} is required`);
  if (!offsetDate(e.startDateTime) || (e.endDateTime && !offsetDate(e.endDateTime))) throw new Error(`${e.id}: date-times require UTC or a numeric offset`);
  if (!httpsUrl(e.registrationUrl) || (e.imageUrl && !httpsUrl(e.imageUrl))) throw new Error(`${e.id}: URLs must use HTTPS`);
  if (!e.location || typeof e.location !== "object") throw new Error(`${e.id}: location is required`);
  const location = e.location as Record<string, unknown>;
  if (!location.city || !location.state) throw new Error(`${e.id}: location city and state are required`);
  if (!Array.isArray(e.distances) || e.distances.some(d => typeof d !== "string" || !d)) throw new Error(`${e.id}: distances must be strings`);
  return e as unknown as ManualConfig;
}
