import type { NormalizedEvent } from "../model.ts";
import { styles } from "./styles.ts";
export function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
function card(event: NormalizedEvent): string {
  const date = new Date(event.startDateTime); const month = new Intl.DateTimeFormat("en-US",{month:"short",timeZone:"UTC"}).format(date); const day = new Intl.DateTimeFormat("en-US",{day:"2-digit",timeZone:"UTC"}).format(date);
  const where = [event.location.name,event.location.city,event.location.state].filter(Boolean).map(escapeHtml).join(" · ");
  const distances = event.distances.length ? `<ul class="distances" aria-label="Distances">${event.distances.map(d=>`<li>${escapeHtml(d.name)}</li>`).join("")}</ul>` : "";
  return `<article class="card"><div class="date" aria-label="${escapeHtml(month)} ${escapeHtml(day)}"><span>${escapeHtml(month)}</span><strong>${escapeHtml(day)}</strong></div><div class="content"><h2>${escapeHtml(event.name)}</h2><p class="meta">${where}</p>${distances}<a class="action" href="${escapeHtml(event.registrationUrl)}" aria-label="View event: ${escapeHtml(event.name)}">View event</a></div></article>`;
}
export function renderPage(events: NormalizedEvent[], hadFailures = false): string {
  const body = events.length ? `<section class="events" aria-label="Upcoming events">${events.map(card).join("")}</section>` : `<p class="empty">No upcoming events are currently listed. Please check back soon.</p>`;
  const notice = hadFailures && !events.length ? `<p class="notice" role="status">We could not load the event list right now. Please try again shortly.</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upcoming races | Pinnacle Race Timing</title><style>${styles}</style></head><body><main><h1 class="sr-only" style="position:absolute;left:-10000px">Upcoming races</h1>${notice||body}</main></body></html>`;
}
