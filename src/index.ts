import rawConfig from "../config/events.json" with { type: "json" };
import { validateConfig } from "./config.ts";
import { isUpcoming, sortEvents, type NormalizedEvent } from "./model.ts";
import { normalizeManual } from "./providers/manual.ts";
import { getRunSignupRace, type RunSignupSecrets } from "./providers/runsignup.ts";
import { renderPage } from "./render/page.ts";
import { securityHeaders } from "./security.ts";
import { discoverRaceResults } from "./results/discover.ts";
import { includeInResults,sortResults,type NormalizedRaceResults } from "./results/model.ts";
import { renderResultsPage } from "./results/render.ts";
import { mapSequential } from "./serial.ts";
import { accessEmail, adminPage, createEventPullRequest, csrfCookie, newCsrf, parseRaceId, previewPage, slugForEvent, successPage, validCsrf, type GitHubEnv } from "./admin.ts";

type Env = RunSignupSecrets & GitHubEnv & { CACHE_TTL_SECONDS?: string; RESULTS_PENDING_DAYS?: string };
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const pathname=new URL(request.url).pathname;
  if(pathname.startsWith("/admin"))return handleAdmin(request,env,pathname);
  if(pathname==="/results")return handleResults(request,env);
  if (pathname !== "/") return new Response("Not found",{status:404});
  const config = validateConfig(rawConfig); const visibleConfig=config.events.filter(e=>!e.hidden); const settled = await mapSequential(visibleConfig,e=>e.provider === "manual" ? Promise.resolve(normalizeManual(e)) : getRunSignupRace(e,env));
  const events: NormalizedEvent[] = []; let failures=0;
  settled.forEach((result,i)=>{ if(result.status === "fulfilled") events.push(result.value); else { failures++; console.error("event_provider_failure",{eventId:visibleConfig[i]?.id,error:result.reason instanceof Error?result.reason.message:"unknown"}); }});
  const upcoming = sortEvents(events.filter(e=>isUpcoming(e)));
  return new Response(renderPage(upcoming,failures>0),{headers:securityHeaders(Number(env.CACHE_TTL_SECONDS??900))});
}
async function handleResults(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);const config=validateConfig(rawConfig);const candidates=config.events.filter((event):event is Extract<typeof event,{provider:"runsignup"}>=>event.provider==="runsignup"&&!event.hidden&&!event.resultsHidden);const settled=await mapSequential(candidates,event=>discoverRaceResults(event,env));const races:NormalizedRaceResults[]=[];let failures=0;settled.forEach((result,i)=>{if(result.status==="fulfilled")races.push(result.value);else{failures++;console.warn("results_provider_failure",{raceId:candidates[i]?.raceId,category:result.reason instanceof Error?result.reason.message:"unknown"})}});const visible=sortResults(races.filter(race=>includeInResults(race,new Date(),Number(env.RESULTS_PENDING_DAYS??7))));return new Response(renderResultsPage(visible,url.searchParams.get("q")??"",url.searchParams.get("year")??"",failures>0),{headers:securityHeaders(60)})}

async function handleAdmin(request:Request,env:Env,pathname:string):Promise<Response>{
  const email=accessEmail(request);if(!email)return new Response("This page requires Cloudflare Access.",{status:403});
  const token=newCsrf();
  if(request.method==="GET"&&pathname==="/admin")return html(adminPage(token),200,csrfCookie(token));
  if(request.method!=="POST")return new Response("Not found",{status:404});
  const form=await request.formData();if(!validCsrf(request,form.get("csrf")))return new Response("Invalid or expired form. Return to /admin and try again.",{status:403});
  try{
    if(pathname==="/admin/preview"){
      const raceId=parseRaceId(String(form.get("race")??""));if(!raceId)return html(adminPage(token,"Enter a valid RunSignup URL or race ID."),400,csrfCookie(token));
      const event=await getRunSignupRace({id:`preview-${raceId}`,provider:"runsignup",raceId},env);return html(previewPage(event,raceId,token),200,csrfCookie(token));
    }
    if(pathname==="/admin/submit"){
      const raceId=Number(form.get("raceId"));if(!Number.isInteger(raceId)||raceId<=0)throw new Error("Invalid event request.");
      const event=await getRunSignupRace({id:`submit-${raceId}`,provider:"runsignup",raceId},env);if(!isUpcoming(event))throw new Error("Completed races cannot be added to the upcoming event list.");
      const url=await createEventPullRequest(env,raceId,slugForEvent(event),form.get("featured")==="true",email);return html(successPage(url));
    }
  }catch(error){console.error("admin_event_failure",{actor:email,error:error instanceof Error?error.message:"unknown"});return html(adminPage(token,error instanceof Error?error.message:"Unable to create event."),400,csrfCookie(token));}
  return new Response("Not found",{status:404});
}
function html(body:string,status=200,cookie?:string):Response{const headers=securityHeaders(0);headers.set("Cache-Control","no-store");headers.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");if(cookie)headers.set("Set-Cookie",cookie);return new Response(body,{status,headers});}
export default { fetch: handleRequest };
