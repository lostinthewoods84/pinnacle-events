import type { Location } from "../model.ts";
export type ResultSetSummary={id:number;eventId:number;name:string;eventName:string;officialUrl:string};
export type NormalizedRaceResults={catalogId:string;raceId:number;raceName:string;raceDate:string;location?:Partial<Location>;provider:"RunSignup";raceUrl:string;availability:"available"|"pending"|"unavailable";resultSets:ResultSetSummary[];lastChecked:string;providerStatus?:"ok"|"error"};
export function resultCacheTtl(raceDate:string,now=new Date()):number{const age=now.getTime()-new Date(`${raceDate.slice(0,10)}T23:59:59Z`).getTime();if(age<=86400000)return 60;if(age<=14*86400000)return 900;return 86400}
export function includeInResults(race:NormalizedRaceResults,now=new Date(),pendingDays=7):boolean{const age=now.getTime()-new Date(`${race.raceDate.slice(0,10)}T23:59:59Z`).getTime();if(age<0)return false;if(race.availability==="available")return true;return age<=pendingDays*86400000}
export function sortResults(races:NormalizedRaceResults[]):NormalizedRaceResults[]{return [...races].sort((a,b)=>Date.parse(b.raceDate)-Date.parse(a.raceDate))}
