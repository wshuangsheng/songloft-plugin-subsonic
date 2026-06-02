import { getIndexes, getMusicDirectory } from './dist/client.js';

// Mock config
const config = { url: 'http://fake', username: 'u', password: 'p' };

// Mock fetch
global.fetch = async (url) => {
  if (url.includes('getIndexes')) {
    return {
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'failed',
          error: { code: 0, message: 'Method not found: getIndexes' }
        }
      })
    };
  } else if (url.includes('getMusicDirectory')) {
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found'
    };
  }
};

async function run() {
  try {
    await getIndexes(config);
  } catch (e) {
    console.log('lxserver getIndexes error:', e.message);
  }

  try {
    await getMusicDirectory(config, '1');
  } catch (e) {
    console.log('mqmusic getDirectory error:', e.message);
  }
}
run();
