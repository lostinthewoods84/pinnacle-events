import type {GitHubEnv} from "./admin.ts";import type {RunSignupSecrets} from "./providers/runsignup.ts";
export type ExecutionContextLike={waitUntil(promise:Promise<unknown>):void};
export type DurableObjectStubLike={fetch(input:string|Request,init?:RequestInit):Promise<Response>};
export type DurableObjectNamespaceLike={getByName(name:string):DurableObjectStubLike};
export type Env=RunSignupSecrets&GitHubEnv&{CACHE_TTL_SECONDS?:string;RESULTS_PENDING_DAYS?:string;RACE_CATALOG:DurableObjectNamespaceLike};
