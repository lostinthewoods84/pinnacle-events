# Pinnacle Events

A server-rendered Cloudflare Worker that publishes Pinnacle Race Timing's approved upcoming events. RunSignup remains the source of truth for RunSignup race content; `config/events.json` controls which races appear and supports manually maintained events from other providers.

## Architecture

The Worker reads version-controlled configuration, fetches each approved RunSignup race server-side, normalizes all providers into one model, filters completed races, and returns isolated HTML suitable for a Squarespace iframe. One provider failure does not suppress valid events. Successful HTML is cached at Cloudflare for 15 minutes by default.

## Local setup

Requirements: Node.js 24 and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
npm test
npm run typecheck
npm run dev
```

Create `.dev.vars` locally with these names. Never commit the values:

```dotenv
RUNSIGNUP_API_KEY=
RUNSIGNUP_API_SECRET=
RUNSIGNUP_CALLER_TOKEN=
RUNSIGNUP_CALLER_SECRET=
```

The adapter uses RunSignup's v2 key (`rsu_api_key` plus `X-RSU-API-SECRET`) and API caller identification (`rsu_api_reg` plus `X-RSU-API-REG-SECRET`). Confirm the account-specific access scope with RunSignup before production use.

## Managing events

Edit `config/events.json`, run `npm run check`, and open a pull request.

RunSignup event:

```json
{"id":"all-out-2027","provider":"runsignup","raceId":123456,"featured":true}
```

Manual event:

```json
{"id":"drummer-hill-2027","provider":"manual","registrationProvider":"UltraSignup","name":"Drummer Hill Trail Race","startDateTime":"2027-10-16T08:00:00-04:00","location":{"name":"Race venue","city":"Keene","state":"NH"},"distances":["12.5K","25K","37.5K","50K"],"registrationUrl":"https://example.com/race"}
```

Use `"hidden": true` to temporarily suppress an event. Remove its record to delete it. IDs must be unique lowercase slugs, URLs must use HTTPS, and manual date-times must include `Z` or a numeric UTC offset. Events remain visible through 11:59:59 p.m. on their local race date.

## Deployment

1. In Cloudflare Workers & Pages, connect this GitHub repository using Workers Builds.
2. Set production branch to `main`; build command `npx wrangler deploy`; deploy command can remain empty if the integration runs the build command as deployment.
3. Add all four RunSignup values under Worker Settings > Variables and Secrets as encrypted secrets.
4. Confirm the Worker name is `pinnacle-events` and attach `events.pinnacle-timing.com`. `wrangler.jsonc` is authoritative.
5. Verify a preview before merging. CI runs validation and tests for every PR.

No production credentials, DNS, Squarespace content, or Cloudflare console state are managed by this repository.

## Squarespace embed

Add this to a Squarespace Code Block after the custom domain is verified:

```html
<iframe src="https://events.pinnacle-timing.com" title="Upcoming Pinnacle Race Timing events" loading="lazy" style="width:100%;min-height:720px;border:0" referrerpolicy="strict-origin-when-cross-origin"></iframe>
```

The Worker permits framing only from the apex and `www` Pinnacle domains. Add a documented Squarespace preview origin to `src/security.ts` only if testing proves it necessary.

## Tests and troubleshooting

Run `npm run check`. Tests cover configuration, normalization, grouping, HTTP failures, malformed payloads, authentication headers, completion cutoff, sorting, HTML escaping, rendering, and security headers.

- **401/403 from RunSignup:** verify the v2 key, header secret, caller token/secret, and race access scope. Secrets never appear in logs.
- **429:** the affected card is omitted for that request; other cards still render. Check Worker logs and retry after the cache interval.
- **Stale content:** successful HTML uses `s-maxage` from `CACHE_TTL_SECONDS`, default 900 seconds. Deploying a new version purges Worker code but not necessarily every cached response.
- **Iframe blocked:** inspect `Content-Security-Policy`; ensure the page uses an approved Pinnacle HTTPS origin and no proxy adds `X-Frame-Options`.
- **Build failure:** confirm Node 24, run `npm ci && npm run check`, and ensure Worker/config names agree.

## Rollback

Revert the offending Git commit and merge the revert, or select the last known-good Worker version in Cloudflare. Keep the old Squarespace Events collection under **Not Linked** throughout validation so the previous homepage block can be restored quickly. Do not edit deployed Worker code in the Cloudflare console.

Facebook Event creation remains manual in the MVP.
