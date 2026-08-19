import { isUpcoming, sortEvents } from "./model.ts";
import { getRunSignupRace,getRunSignupResultSets,getRunSignupResultSettings } from "./providers/runsignup.ts";
import { renderPage } from "./render/page.ts";
import { securityHeaders } from "./security.ts";
import { includeInResults,sortResults,type NormalizedRaceResults } from "./results/model.ts";
import { renderResultsPage } from "./results/render.ts";
import { accessEmail, adminPage, createEventPullRequest, csrfCookie, newCsrf, parseRaceId, previewPage, resultsDiagnosticPage, slugForEvent, successPage, summarizeResultSetPayload, validCsrf,type ResultsDiagnosticReport } from "./admin.ts";
import {normalizeExternalResultLinks,normalizeResultSets} from "./results/discover.ts";
import rawConfig from "../config/events.json" with {type:"json"};import {buildCatalogSnapshot,type CatalogSnapshot} from "./catalog.ts";import {validateConfig} from "./config.ts";import type {Env,ExecutionContextLike} from "./env.ts";export {RaceCatalogCache} from "./race-cache.ts";

export async function handleRequest(request:Request,env:Env,context?:ExecutionContextLike):Promise<Response>{
  const pathname=new URL(request.url).pathname;
  if(pathname.startsWith("/admin"))return handleAdmin(request,env,pathname);
  if(pathname==="/results")return handleResults(request,env,context);
  if (pathname !== "/") return new Response("Not found",{status:404});
  const snapshot=await catalogSnapshot(env,context);if(!snapshot)return new Response(renderPage([],true),{headers:securityHeaders(30)});
  const upcoming=sortEvents(snapshot.events.filter(e=>isUpcoming(e)));
  return new Response(renderPage(upcoming,snapshot.failures>0),{headers:securityHeaders(Number(env.CACHE_TTL_SECONDS??900))});
}
async function handleResults(request:Request,env:Env,context?:ExecutionContextLike):Promise<Response>{const url=new URL(request.url);const snapshot=await catalogSnapshot(env,context);if(!snapshot)return new Response(renderResultsPage([],url.searchParams.get("q")??"",url.searchParams.get("year")??"",true),{headers:securityHeaders(30)});const visible=sortResults(snapshot.results.filter(race=>includeInResults(race,new Date(),Number(env.RESULTS_PENDING_DAYS??7))));return new Response(renderResultsPage(visible,url.searchParams.get("q")??"",url.searchParams.get("year")??"",snapshot.failures>0),{headers:securityHeaders(60)})}

async function catalogSnapshot(env:Env,context?:ExecutionContextLike):Promise<CatalogSnapshot|undefined>{const stub=env.RACE_CATALOG.getByName("catalog");const response=await stub.fetch("https://catalog/snapshot");if(response.ok)return await response.json() as CatalogSnapshot;if(context)context.waitUntil(refreshCatalog(env));return undefined}
export async function refreshCatalog(env:Env):Promise<void>{const stub=env.RACE_CATALOG.getByName("catalog");const previousResponse=await stub.fetch("https://catalog/snapshot");const previous=previousResponse.ok?await previousResponse.json() as CatalogSnapshot:undefined;const snapshot=await buildCatalogSnapshot(validateConfig(rawConfig).events,env);if(previous&&snapshot.failedIds.length){const failed=new Set(snapshot.failedIds);snapshot.events.push(...previous.events.filter(event=>failed.has(event.id)));snapshot.results.push(...previous.results.filter(result=>failed.has(result.catalogId)))}const response=await stub.fetch("https://catalog/snapshot",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(snapshot)});if(!response.ok)throw new Error(`Catalog snapshot write returned HTTP ${response.status}`)}

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
    if(pathname==="/admin/results-test"){
      const raceId=parseRaceId(String(form.get("race")??""));if(!raceId)throw new Error("Enter a valid completed RunSignup race ID.");
      const metadataStarted=Date.now();const race=await getRunSignupRace({id:`results-test-${raceId}`,provider:"runsignup",raceId},env);const report:ResultsDiagnosticReport={raceId,raceName:race.name,metadataMs:Date.now()-metadataStarted,events:[]};
      for(const event of race.distances){const started=Date.now();const eventId=Number(event.id);if(!Number.isInteger(eventId)){report.events.push({eventId:event.id,eventName:event.name,durationMs:Date.now()-started,status:"error",resultSets:[],error:"RunSignup returned a non-numeric event ID."});continue}let diagnostic:ReturnType<typeof summarizeResultSetPayload>|undefined;try{const payload=await getRunSignupResultSets(raceId,eventId,env);diagnostic=summarizeResultSetPayload(payload);const sets=normalizeResultSets(raceId,eventId,event.name,payload);report.events.push({eventId:event.id,eventName:event.name,durationMs:Date.now()-started,status:"ok",resultSets:sets.map(set=>({id:set.id,name:set.name,officialUrl:set.officialUrl})),payload:diagnostic})}catch(error){report.events.push({eventId:event.id,eventName:event.name,durationMs:Date.now()-started,status:"error",resultSets:[],...(diagnostic?{payload:diagnostic}:{}),error:error instanceof Error?error.message:"Unknown RunSignup error"})}}
      const settingsStarted=Date.now();try{const links=normalizeExternalResultLinks(raceId,await getRunSignupResultSettings(raceId,env));report.settingsMs=Date.now()-settingsStarted;report.externalResultLinks=links.map(link=>({name:link.name,officialUrl:link.officialUrl}))}catch(error){report.settingsMs=Date.now()-settingsStarted;report.settingsError=error instanceof Error?error.message:"Unknown RunSignup error"}
      return html(resultsDiagnosticPage(report),200,csrfCookie(token));
    }
    if(pathname==="/admin/submit"){
      const raceId=Number(form.get("raceId"));if(!Number.isInteger(raceId)||raceId<=0)throw new Error("Invalid event request.");
      const event=await getRunSignupRace({id:`submit-${raceId}`,provider:"runsignup",raceId},env);if(!isUpcoming(event))throw new Error("Completed races cannot be added to the upcoming event list.");
      const url=await createEventPullRequest(env,raceId,slugForEvent(event),form.get("featured")==="true",email);return html(successPage(url));
    }
  }catch(error){console.error("admin_request_failure",{actor:email,path:pathname,error:error instanceof Error?error.message:"unknown"});return html(adminPage(token,error instanceof Error?error.message:"Unable to complete request."),400,csrfCookie(token));}
  return new Response("Not found",{status:404});
}
function html(body:string,status=200,cookie?:string):Response{const headers=securityHeaders(0);headers.set("Cache-Control","no-store");headers.set("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");if(cookie)headers.set("Set-Cookie",cookie);return new Response(body,{status,headers});}
export default {fetch:handleRequest,scheduled(_controller:unknown,env:Env,context:ExecutionContextLike){context.waitUntil(refreshCatalog(env));}};
