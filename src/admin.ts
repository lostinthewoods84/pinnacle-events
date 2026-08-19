import { validateConfig } from "./config.ts";
import type { AppConfig, NormalizedEvent } from "./model.ts";
import { escapeHtml } from "./render/page.ts";

export type GitHubEnv = { GITHUB_TOKEN?: string; GITHUB_REPOSITORY?: string };
export type ResultPayloadDiagnostic = {
  topLevelKeys: string[];
  arrayField?: string;
  returnedCount?: number;
  returnedSets: Array<{id?:number;name?:string;publicResults?:string;alternateEventIds:number[];finishers?:number}>;
};
export type ResultsDiagnosticReport = {raceId:number;raceName:string;metadataMs:number;events:Array<{eventId:string;eventName:string;durationMs:number;status:"ok"|"error";resultSets:Array<{id:number;name:string;officialUrl:string}>;payload?:ResultPayloadDiagnostic;error?:string}>};

export function summarizeResultSetPayload(payload:unknown):ResultPayloadDiagnostic{
  if(!payload||typeof payload!=="object"||Array.isArray(payload))return {topLevelKeys:[],returnedSets:[]};
  const root=payload as Record<string,unknown>;
  const topLevelKeys=Object.keys(root).sort();
  const arrayField=topLevelKeys.find(key=>key==="individual_results_sets")??topLevelKeys.find(key=>key.toLowerCase().includes("result")&&Array.isArray(root[key]));
  const raw=arrayField&&Array.isArray(root[arrayField])?root[arrayField] as unknown[]:undefined;
  const returnedSets=(raw??[]).flatMap(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item))return [];
    const set=item as Record<string,unknown>;
    const id=finiteNumber(set.individual_result_set_id);
    const finishers=finiteNumber(set.num_finishers);
    return [{
      ...(id!==undefined?{id}:{}),
      ...(typeof set.individual_result_set_name==="string"?{name:set.individual_result_set_name}:{}),
      ...(typeof set.public_results==="string"?{publicResults:set.public_results}:{}),
      alternateEventIds:Array.isArray(set.alt_event_ids)?set.alt_event_ids.map(finiteNumber).filter((value):value is number=>value!==undefined):[],
      ...(finishers!==undefined?{finishers}:{}),
    }];
  });
  return {topLevelKeys,...(arrayField?{arrayField}:{}),...(raw?{returnedCount:raw.length}:{}),returnedSets};
}

export function parseRaceId(value: string): number | undefined {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  try {
    const url = new URL(trimmed);
    const queryId = url.searchParams.get("raceId");
    if (queryId && /^\d+$/.test(queryId)) return Number(queryId);
    const dashboard = url.pathname.match(/\/Race\/Dashboard\/Overview\/(\d+)/i);
    const numericPath = url.pathname.match(/\/Race\/(\d+)(?:\/|$)/i);
    return Number((dashboard ?? numericPath)?.[1]) || undefined;
  } catch { return undefined; }
}

export function slugForEvent(event: NormalizedEvent): string {
  const year = event.startDateTime.slice(0, 4);
  const base = event.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
  return `${base}-${year}`;
}

export function adminPage(csrf: string, message = ""): string {
  return shell("Pinnacle administration", `<h1>Pinnacle administration</h1>${message ? `<p class="message" role="status">${escapeHtml(message)}</p>` : ""}<h2>Add a RunSignup event</h2><p>Paste the RunSignup dashboard URL, public race URL, or race ID. Nothing is published until the resulting GitHub pull request is merged.</p><form method="post" action="/admin/preview"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><label for="race">RunSignup URL or race ID</label><input id="race" name="race" required autocomplete="off" placeholder="https://runsignup.com/Race/Dashboard/Overview/205693"><button type="submit">Preview event</button></form><h2>Test published results</h2><p>Use a completed race with published results. This makes live, sequential RunSignup requests and does not modify the catalog.</p><form method="post" action="/admin/results-test"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><label for="results-race">Completed RunSignup race ID</label><input id="results-race" name="race" required autocomplete="off" inputmode="numeric" placeholder="205693"><button type="submit">Test results API</button></form>`);
}

export function resultsDiagnosticPage(report:ResultsDiagnosticReport):string{const rows=report.events.map(event=>`<section class="preview"><p class="eyebrow">Event ${escapeHtml(event.eventId)} · ${event.durationMs} ms</p><h2>${escapeHtml(event.eventName)}</h2><p><strong>${event.status==="ok"?"Request succeeded":"Request failed"}</strong></p>${event.error?`<p class="message">${escapeHtml(event.error)}</p>`:""}${event.resultSets.length?`<ul>${event.resultSets.map(set=>`<li><a href="${escapeHtml(set.officialUrl)}">${escapeHtml(set.name)}</a> <span class="eyebrow">Result set ${set.id}</span></li>`).join("")}</ul>`:`<p>No public result sets returned.</p>`}${event.payload?renderPayloadDiagnostic(event.payload):""}</section>`).join("");return shell("Results API diagnostic",`<a href="/admin">← Back to administration</a><h1>Results API diagnostic</h1><p><strong>${escapeHtml(report.raceName)}</strong> · RunSignup race ${report.raceId}</p><p>Race metadata request: ${report.metadataMs} ms</p>${rows||"<p>No events were returned for this race.</p>"}`)}

export function previewPage(event: NormalizedEvent, raceId: number, csrf: string): string {
  const location = [event.location.name,event.location.city,event.location.state].filter(Boolean).join(" · ");
  return shell("Preview event", `<a href="/admin">← Start over</a><h1>Review event</h1><section class="preview"><p class="eyebrow">RunSignup race ${raceId}</p><h2>${escapeHtml(event.name)}</h2><p>${escapeHtml(new Date(event.startDateTime).toLocaleString("en-US",{dateStyle:"full",timeStyle:"short"}))}</p><p>${escapeHtml(location)}</p><p>${event.distances.map(d=>escapeHtml(d.name)).join(" · ") || "No distances supplied"}</p></section><form method="post" action="/admin/submit"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><input type="hidden" name="raceId" value="${raceId}"><label><input type="checkbox" name="featured" value="true"> Feature this event</label><button type="submit">Validate and publish</button></form>`);
}

export function successPage(url: string): string { return shell("Event submitted", `<h1>Event submitted</h1><p>GitHub is validating the event now. If all checks pass, it will merge and deploy automatically. A failed check leaves the request open for investigation instead of publishing it.</p><p><a class="button" href="${escapeHtml(url)}">View validation</a></p><p><a href="/admin">Add another event</a></p>`); }

export async function createEventPullRequest(env: GitHubEnv, raceId: number, eventId: string, featured: boolean, actor: string, fetcher: typeof fetch = fetch): Promise<string> {
  const token = required(env.GITHUB_TOKEN,"GITHUB_TOKEN"); const repo = env.GITHUB_REPOSITORY ?? "lostinthewoods84/pinnacle-events";
  const headers = {"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,"X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"};
  const file = await github(fetcher,`https://api.github.com/repos/${repo}/contents/config/events.json?ref=main`,{headers}) as {content:string;sha:string};
  const config = validateConfig(JSON.parse(decodeBase64(file.content)));
  if (config.events.some(e=>e.provider==="runsignup"&&e.raceId===raceId)) throw new Error("That RunSignup race is already configured.");
  let uniqueId=eventId; let suffix=2; while(config.events.some(e=>e.id===uniqueId)) uniqueId=`${eventId}-${suffix++}`;
  const updated: AppConfig={...config,events:[...config.events,{id:uniqueId,provider:"runsignup",raceId,featured}]};
  const ref = await github(fetcher,`https://api.github.com/repos/${repo}/git/ref/heads/main`,{headers}) as {object:{sha:string}};
  const branch=`amy/add-${uniqueId}-${Date.now().toString(36)}`;
  await github(fetcher,`https://api.github.com/repos/${repo}/git/refs`,{method:"POST",headers,body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ref.object.sha})});
  await github(fetcher,`https://api.github.com/repos/${repo}/contents/config/events.json`,{method:"PUT",headers,body:JSON.stringify({message:`Propose ${uniqueId}`,content:encodeBase64(`${JSON.stringify(updated,null,2)}\n`),sha:file.sha,branch})});
  const pr = await github(fetcher,`https://api.github.com/repos/${repo}/pulls`,{method:"POST",headers,body:JSON.stringify({title:`Add ${uniqueId.replaceAll("-"," ")}`,head:branch,base:"main",body:`Proposed through the Pinnacle Events admin page by ${actor}.\n\nRunSignup race ID: \`${raceId}\`\n\nMerge this PR to publish the event.`})}) as {html_url:string};
  return pr.html_url;
}

export function newCsrf(): string { const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""); }
export function csrfCookie(token:string):string{return `pinnacle_admin_csrf=${token}; Path=/admin; Secure; HttpOnly; SameSite=Strict; Max-Age=3600`;}
export function validCsrf(request:Request,value:FormDataEntryValue|null):boolean{const cookie=request.headers.get("Cookie")?.match(/(?:^|;\s*)pinnacle_admin_csrf=([^;]+)/)?.[1];return typeof value==="string"&&value.length===48&&cookie===value;}
export function accessEmail(request:Request):string|undefined{return request.headers.get("Cf-Access-Authenticated-User-Email")??undefined;}

function shell(title:string,body:string):string{return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | Pinnacle Events</title><style>:root{font-family:Inter,system-ui,sans-serif;color:#182525;background:#f1f6f5}body{max-width:42rem;margin:auto;padding:2rem 1rem}h1{font-size:2rem}form,.preview{display:grid;gap:1rem;background:#fff;border:1px solid #d7e2e0;border-radius:14px;padding:1.25rem;margin:1.25rem 0}label{font-weight:700}input[type=text],input:not([type]){font:inherit;padding:.8rem;border:1px solid #849895;border-radius:8px}button,.button{font:inherit;font-weight:700;padding:.8rem 1rem;background:#14766c;color:#fff;border:0;border-radius:8px;text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #f5b700;outline-offset:3px}.eyebrow{color:#586866;text-transform:uppercase;font-size:.8rem}.message{padding:.8rem;background:#fff3cd;border-radius:8px}</style></head><body><main>${body}</main></body></html>`;}
async function github(fetcher:typeof fetch,url:string,init:RequestInit):Promise<unknown>{const response=await fetcher(url,init);let body:unknown;try{body=await response.json();}catch{body={};}if(!response.ok){const message=(body as {message?:string}).message??`HTTP ${response.status}`;throw new Error(`GitHub: ${message}`);}return body;}
function required(value:string|undefined,name:string):string{if(!value)throw new Error(`${name} is not configured`);return value;}
function encodeBase64(value:string):string{const bytes=new TextEncoder().encode(value);let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
function decodeBase64(value:string):string{const binary=atob(value.replace(/\s/g,""));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
function finiteNumber(value:unknown):number|undefined{const number=Number(value);return Number.isFinite(number)?number:undefined;}
function renderPayloadDiagnostic(payload:ResultPayloadDiagnostic):string{
  const sets=payload.returnedSets.length?`<ul>${payload.returnedSets.map(set=>`<li>ID: ${set.id??"missing"}; name: ${escapeHtml(set.name??"missing")}; public_results: ${escapeHtml(set.publicResults??"missing")}; finishers: ${set.finishers??"not returned"}; alternate event IDs: ${set.alternateEventIds.length?set.alternateEventIds.join(", "):"none"}</li>`).join("")}</ul>`:"<p>No result-set records were present in the returned array.</p>";
  return `<details><summary>Sanitized RunSignup response</summary><p>Top-level fields: ${payload.topLevelKeys.length?payload.topLevelKeys.map(escapeHtml).join(", "):"none"}</p><p>Detected result-set field: ${escapeHtml(payload.arrayField??"none")}</p><p>Returned records: ${payload.returnedCount??"unknown"}</p>${sets}<p class="eyebrow">Credentials, request headers, participant records, and result rows are not displayed.</p></details>`;
}
