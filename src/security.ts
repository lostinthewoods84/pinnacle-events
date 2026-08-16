export function securityHeaders(cacheSeconds = 300): Headers {
  return new Headers({"Content-Type":"text/html; charset=utf-8","Cache-Control":`public, max-age=${Math.min(cacheSeconds,60)}, s-maxage=${cacheSeconds}`,"Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors https://pinnacle-timing.com https://www.pinnacle-timing.com; base-uri 'none'; form-action 'none'","Referrer-Policy":"strict-origin-when-cross-origin","X-Content-Type-Options":"nosniff","Permissions-Policy":"camera=(), microphone=(), geolocation=()"});
}
