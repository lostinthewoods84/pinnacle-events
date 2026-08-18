import type { NormalizedRaceResults } from "./model.ts";
type Entry={expires:number;value:NormalizedRaceResults};const entries=new Map<number,Entry>();
export function cachedResult(raceId:number,now=Date.now()):NormalizedRaceResults|undefined{const entry=entries.get(raceId);return entry&&entry.expires>now?entry.value:undefined}
export function storeResult(value:NormalizedRaceResults,ttlSeconds:number,now=Date.now()):void{entries.set(value.raceId,{value,expires:now+ttlSeconds*1000})}
export function clearResultsCache():void{entries.clear()}
