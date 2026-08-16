export type Location = { name?: string; address?: string; city: string; state: string };
export type Distance = { id: string; name: string; startDateTime?: string; endDateTime?: string; registrationStatus?: string };
export type NormalizedEvent = {
  id: string; provider: string; name: string; startDateTime: string; endDateTime?: string;
  location: Location; registrationUrl: string; imageUrl?: string; distances: Distance[];
  registrationStatus?: string; featured: boolean; order?: number; sourceStatus: "ok" | "error";
};
export type RunSignupConfig = { id: string; provider: "runsignup"; raceId: number; featured?: boolean; hidden?: boolean; order?: number };
export type ManualConfig = { id: string; provider: "manual"; registrationProvider: string; name: string; startDateTime: string; endDateTime?: string; location: Location; distances: string[]; registrationUrl: string; imageUrl?: string; featured?: boolean; hidden?: boolean; order?: number };
export type EventConfig = RunSignupConfig | ManualConfig;
export type AppConfig = { version: 1; events: EventConfig[] };

export function isUpcoming(event: NormalizedEvent, now = new Date()): boolean {
  const date = event.startDateTime.slice(0, 10);
  const offset = event.startDateTime.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1];
  if (!offset) return new Date(event.endDateTime ?? event.startDateTime).getTime() >= now.getTime();
  const cutoff = new Date(`${date}T23:59:59.999${offset}`);
  return cutoff.getTime() >= now.getTime();
}

export function sortEvents(events: NormalizedEvent[]): NormalizedEvent[] {
  return [...events].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || Date.parse(a.startDateTime) - Date.parse(b.startDateTime));
}
