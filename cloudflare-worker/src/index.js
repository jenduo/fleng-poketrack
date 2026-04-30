// CORS-friendly proxy in front of api-v2.getcollectr.com.
//
// Why: Collectr's API rejects requests whose Origin header isn't
// https://app.getcollectr.com (returns 500 from CloudFront), so the GitHub
// Pages deploy can't call it directly. This Worker forwards the request with
// the right Origin/Referer and returns CORS-friendly headers to the browser.
//
// Routing:
//   /collectr/<rest>  →  https://api-v2.getcollectr.com/<rest>
// Adding a new namespace later? Add another `else if (path.startsWith(...))`
// branch below.

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://jenduong.github.io',
]

const corsHeaders = (origin) => ({
  'access-control-allow-origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
  vary: 'origin',
})

async function proxyCollectr(req, url) {
  const upstream = 'https://api-v2.getcollectr.com' + url.pathname.replace(/^\/collectr/, '') + url.search
  const upstreamRes = await fetch(upstream, {
    method: req.method,
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: req.headers.get('authorization') || '',
      origin: 'https://app.getcollectr.com',
      referer: 'https://app.getcollectr.com/',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
  })
  return upstreamRes
}

export default {
  async fetch(req) {
    const origin = req.headers.get('origin') || ''

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) })
    }

    const url = new URL(req.url)

    let upstreamRes
    if (url.pathname.startsWith('/collectr/')) {
      upstreamRes = await proxyCollectr(req, url)
    } else {
      return new Response('Not found', { status: 404, headers: corsHeaders(origin) })
    }

    const body = await upstreamRes.text()
    return new Response(body, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(origin),
        'content-type': upstreamRes.headers.get('content-type') || 'application/json',
      },
    })
  },
}
