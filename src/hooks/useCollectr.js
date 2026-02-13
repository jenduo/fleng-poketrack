import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const getCollectrProfileFn = httpsCallable(functions, 'getCollectrProfile');

export async function getCollectrProfile(profileId, options = {}) {
  const { offset = 0, limit = 100 } = options;

  try {
    const result = await getCollectrProfileFn({ profileId, offset, limit });
    return result.data;
  } catch (error) {
    console.error('Error fetching Collectr profile:', error);
    throw error;
  }
}

// Helper to extract just the profile ID from a full URL
export function extractProfileId(urlOrId) {
  if (urlOrId.includes('getcollectr.com')) {
    const match = urlOrId.match(/\/profile\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }
  return urlOrId;
}
