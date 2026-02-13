const functions = require('firebase-functions');
const fetch = require('node-fetch');

exports.getCollectrProfile = functions.https.onCall(async (data, context) => {
  const { profileId, offset = 0, limit = 100 } = data;

  if (!profileId) {
    throw new functions.https.HttpsError('invalid-argument', 'profileId is required');
  }

  try {
    const response = await fetch(
      `https://api-v2.getcollectr.com/data/showcase/${profileId}?offset=${offset}&limit=${limit}&unstackedView=true&username=00000000-0000-0000-0000-000000000000`,
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'origin': 'https://app.getcollectr.com',
          'referer': 'https://app.getcollectr.com/',
          'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
        }
      }
    );

    if (!response.ok) {
      throw new functions.https.HttpsError('internal', `Collectr API returned ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error fetching Collectr profile:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
