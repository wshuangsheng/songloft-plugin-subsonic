import { getIndexes } from './dist/client.js';
import router from './dist/router.js';

// Mock config
global.fetch = async (url) => {
  if (url.includes('getIndexes')) {
    return {
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'ok',
          indexes: {
            index: [{ artist: [{ id: '1', name: 'artist1' }] }]
          }
        }
      })
    };
  } else if (url.includes('getMusicDirectory')) {
    return {
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'ok',
          directory: {
            child: [{ id: '100', title: 'song1', isDir: false }]
          }
        }
      })
    };
  }
};

async function run() {
  const req = {
    method: 'GET',
    path: '/lists/test/items',
    query: 'id=root',
  };
  
  // Actually we need to mock config
  const fs = await import('fs');
  fs.writeFileSync('config.json', JSON.stringify([{name: 'test', url: 'http://fake', username: 'u', password: 'p'}]));
  
  let res = await router.handle(req);
  console.log("Root Items:", res.body);
  
  req.query = 'id=1';
  res = await router.handle(req);
  console.log("Directory Items:", res.body);
}
run();
