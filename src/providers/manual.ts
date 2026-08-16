import type { ManualConfig, NormalizedEvent } from "../model.ts";
export function normalizeManual(config: ManualConfig): NormalizedEvent {
  return { id: config.id, provider: config.registrationProvider, name: config.name, startDateTime: config.startDateTime, endDateTime: config.endDateTime, location: config.location, registrationUrl: config.registrationUrl, imageUrl: config.imageUrl, distances: config.distances.map((name, i) => ({ id: `${config.id}-${i}`, name })), featured: config.featured ?? false, order: config.order, sourceStatus: "ok" };
}
