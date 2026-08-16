import rawConfig from "../config/events.json" with { type: "json" };
import { validateConfig } from "./config.ts";
import { isUpcoming, sortEvents, type NormalizedEvent } from "./model.ts";
import { normalizeManual } from "./providers/manual.ts";
import { getRunSignupRace, type RunSignupSecrets } from "./providers/runsignup.ts";
import { renderPage } from "./render/page.ts";
import { securityHeaders } from "./security.ts";

type Env = RunSignupSecrets & { CACHE_TTL_SECONDS?: string };
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).pathname !== "/") return new Response("Not found",{status:404});
  const config = validateConfig(rawConfig); const settled = await Promise.allSettled(config.events.filter(e=>!e.hidden).map(e=>e.provider === "manual" ? Promise.resolve(normalizeManual(e)) : getRunSignupRace(e,env)));
  const events: NormalizedEvent[] = []; let failures=0;
  settled.forEach((result,i)=>{ if(result.status === "fulfilled") events.push(result.value); else { failures++; console.error("event_provider_failure",{eventId:config.events[i]?.id,error:result.reason instanceof Error?result.reason.message:"unknown"}); }});
  const upcoming = sortEvents(events.filter(e=>isUpcoming(e)));
  return new Response(renderPage(upcoming,failures>0),{headers:securityHeaders(Number(env.CACHE_TTL_SECONDS??900))});
}
export default { fetch: handleRequest };
