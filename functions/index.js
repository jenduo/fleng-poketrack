const functions = require('firebase-functions');
const fetch = require('node-fetch');

function decodeJwtUsername(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return payload.username || null;
  } catch (e) {
    return null;
  }
}

const COLLECTR_BROWSER_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'origin': 'https://app.getcollectr.com',
  'referer': 'https://app.getcollectr.com/',
  'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
};

async function collectrGet(url, headers) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  if (!r.ok) {
    throw new functions.https.HttpsError('internal', `Collectr ${r.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

exports.getCollectrProfile = functions.https.onCall(async (data, context) => {
  const { profileId, offset = 0, limit = 100, authToken = null } = data;

  if (!profileId && !authToken) {
    throw new functions.https.HttpsError('invalid-argument', 'profileId or authToken is required');
  }

  const headers = { ...COLLECTR_BROWSER_HEADERS };
  if (authToken) headers.authorization = authToken;

  // Owner mode: with a JWT we ignore profileId and pull every collection the
  // token grants access to. Returns { collections: { name: [products] } }.
  if (authToken) {
    const owner = decodeJwtUsername(authToken);
    if (!owner) throw new functions.https.HttpsError('invalid-argument', 'Invalid JWT (no username claim)');

    const colsResp = await collectrGet(`https://api-v2.getcollectr.com/accounts/${owner}/collections`, headers);
    const cols = colsResp.data || [];
    const out = {};
    for (const c of cols) {
      const items = [];
      let off = 0;
      const pageSize = 200;
      while (true) {
        const cidParam = c.id === owner ? '' : `&collectionId=${c.id}`;
        const url = `https://api-v2.getcollectr.com/collections/${owner}/products?limit=${pageSize}&offset=${off}&unstackedView=true${cidParam}`;
        const j = await collectrGet(url, headers);
        const batch = j.data || [];
        items.push(...batch);
        if (batch.length < pageSize) break;
        off += batch.length;
      }
      out[c.name] = items;
    }
    return { mode: 'owner', collections: out };
  }

  // Anonymous showcase mode (legacy, capped at 30)
  const url = `https://api-v2.getcollectr.com/data/showcase/${profileId}?offset=${offset}&limit=${limit}&unstackedView=true&username=00000000-0000-0000-0000-000000000000`;
  return collectrGet(url, headers);
});
