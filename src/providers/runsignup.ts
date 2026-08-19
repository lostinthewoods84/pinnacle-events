import type { NormalizedEvent, RunSignupConfig } from "../model.ts";

export type RunSignupSecrets = { RUNSIGNUP_API_KEY: string; RUNSIGNUP_API_SECRET: string; RUNSIGNUP_CALLER_TOKEN: string; RUNSIGNUP_CALLER_SECRET: string; REQUEST_TIMEOUT_MS?: string };
type Fetch = typeof fetch;
const RUNSIGNUP_API_BASE = "https://api.runsignup.com/rest";

export async function getRunSignupRace(config: RunSignupConfig, env: RunSignupSecrets, fetcher: Fetch = fetch): Promise<NormalizedEvent> {
  return normalizeRunSignup(config, await requestRunSignup(`${RUNSIGNUP_API_BASE}/race/${config.raceId}`, env, fetcher));
}
export async function getRunSignupResultSets(raceId:number,eventId:number,env:RunSignupSecrets,fetcher:Fetch=fetch):Promise<unknown>{const url=new URL(`${RUNSIGNUP_API_BASE}/race/${raceId}/results/get-result-sets`);url.searchParams.set("event_id",String(eventId));return requestRunSignup(url,env,fetcher)}
export async function getRunSignupResultSettings(raceId:number,env:RunSignupSecrets,fetcher:Fetch=fetch):Promise<unknown>{return requestRunSignup(`${RUNSIGNUP_API_BASE}/race/${raceId}/results/settings`,env,fetcher)}
async function requestRunSignup(input:string|URL,env:RunSignupSecrets,fetcher:Fetch):Promise<unknown>{
  const url = new URL(input);
  url.searchParams.set("format", "json");
  url.searchParams.set("rsu_api_key", required(env.RUNSIGNUP_API_KEY, "RUNSIGNUP_API_KEY"));
  url.searchParams.set("rsu_api_reg", required(env.RUNSIGNUP_CALLER_TOKEN, "RUNSIGNUP_CALLER_TOKEN"));
  const controller = new AbortController();
  const timeoutMs = Number(env.REQUEST_TIMEOUT_MS ?? 5000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher(url, { headers: { "Accept": "application/json", "X-RSU-API-SECRET": required(env.RUNSIGNUP_API_SECRET, "RUNSIGNUP_API_SECRET"), "X-RSU-API-REG-SECRET": required(env.RUNSIGNUP_CALLER_SECRET, "RUNSIGNUP_CALLER_SECRET") }, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`RunSignup request to ${url.hostname} timed out after ${timeoutMs}ms`);
    throw error;
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`RunSignup returned HTTP ${response.status}`);
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("RunSignup returned malformed JSON"); }
  return payload;
}

export function normalizeRunSignup(config: RunSignupConfig, payload: unknown): NormalizedEvent {
  const root = payload as Record<string, unknown>;
  const race = ((root?.race ?? (Array.isArray(root?.races) ? (root.races as unknown[])[0] : undefined)) as Record<string, unknown> | undefined);
  if (!race || typeof race.name !== "string") throw new Error("RunSignup payload is missing race data");
  const events = Array.isArray(race.events) ? race.events as Record<string, unknown>[] : [];
  const first = events[0] ?? {};
  const start = string(first.start_time) ?? string(race.start_time) ?? string(race.start_date);
  if (!start) throw new Error("RunSignup payload is missing a start time");
  const address = (race.address ?? race.location ?? {}) as Record<string, unknown>;
  const city = string(address.city) ?? string(race.city);
  const state = string(address.state) ?? string(race.state);
  if (!city || !state) throw new Error("RunSignup payload is missing city/state");
  const registrationUrl = string(race.url) ?? string(race.race_url);
  if (!registrationUrl || !registrationUrl.startsWith("https://")) throw new Error("RunSignup payload has no secure race URL");
  return { id: config.id, provider: "RunSignup", name: race.name, startDateTime: normalizeDate(start), endDateTime: string(first.end_time) ? normalizeDate(string(first.end_time)!) : undefined, location: { name: string(address.name) ?? string(race.place), address: string(address.street), city, state }, registrationUrl, imageUrl: string(race.logo_url) ?? string(race.photo_url), distances: events.map((e, i) => ({ id: String(e.event_id ?? i), name: string(e.name) ?? string(e.event_name) ?? "Race", startDateTime: string(e.start_time) ? normalizeDate(string(e.start_time)!) : undefined, endDateTime: string(e.end_time) ? normalizeDate(string(e.end_time)!) : undefined, registrationStatus: string(e.registration_status) })), featured: config.featured ?? false, order: config.order, sourceStatus: "ok" };
}
function string(v: unknown): string | undefined { return typeof v === "string" && v ? v : undefined; }
function required(v: string | undefined, name: string): string { if (!v) throw new Error(`${name} is not configured`); return v; }
function normalizeDate(v: string): string { const parsed = new Date(v); if (Number.isNaN(parsed.getTime())) throw new Error("RunSignup returned an invalid date"); return /(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? v : parsed.toISOString(); }
