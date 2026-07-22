const fs = require('fs');
const path = require('path');
const https = require('https');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbwzsvUQxHC0FULpZOvJCzYEi0wPz4nx7Ed8oo-W7Ayu1p46F2s2n7gLVTsdWsTA3p-J/exec';

function fetchFromGAS(action) {
  return new Promise((resolve) => {
    const urlStr = `${GAS_URL}?action=${action}`;
    
    function getUrl(urlToFetch, maxRedirects = 5) {
      if (maxRedirects <= 0) {
        resolve(null);
        return;
      }
      
      const req = https.get(urlToFetch, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          getUrl(res.headers.location, maxRedirects - 1);
          return;
        }

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        console.error('Fetch error:', err.message);
        resolve(null);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve(null);
      });
    }

    getUrl(urlStr);
  });
}

async function build() {
  console.log('[Build] Fetching latest snapshot data from Google Apps Script...');
  
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const response = await fetchFromGAS('getAllSnapshotData');

  let snapshotData = {
    teams: [],
    programs: [],
    members: [],
    stats: [],
    timestamp: new Date().toISOString()
  };

  if (response && response.success && response.data) {
    snapshotData = {
      ...response.data,
      timestamp: new Date().toISOString()
    };
    console.log('[Build] Successfully fetched snapshot data!');
    console.log(` - Teams: ${snapshotData.teams ? snapshotData.teams.length : 0}`);
    console.log(` - Programs: ${snapshotData.programs ? snapshotData.programs.length : 0}`);
    console.log(` - Members: ${snapshotData.members ? snapshotData.members.length : 0}`);
  } else {
    console.warn('[Build] Warning: Could not fetch live data from GAS during build. Creating fallback static files.');
  }

  // Save full snapshot JSON
  const snapshotContent = JSON.stringify(snapshotData, null, 2);
  fs.writeFileSync(path.join(dataDir, 'snapshot.json'), snapshotContent);

  // Save individual action endpoint JSONs for fast fetch
  const membersJson = JSON.stringify({ success: true, data: snapshotData.members || [] }, null, 2);
  fs.writeFileSync(path.join(dataDir, 'getMembers.json'), membersJson);

  const programsJson = JSON.stringify({ success: true, data: snapshotData.programs || [] }, null, 2);
  fs.writeFileSync(path.join(dataDir, 'getPrograms.json'), programsJson);

  const teamsJson = JSON.stringify({ success: true, data: snapshotData.teams || [] }, null, 2);
  fs.writeFileSync(path.join(dataDir, 'getTeams.json'), teamsJson);

  const statsJson = JSON.stringify({ success: true, data: snapshotData.stats || [] }, null, 2);
  fs.writeFileSync(path.join(dataDir, 'getStats.json'), statsJson);

  console.log('[Build] Static pre-rendered JSON files generated in /data!');
}

build();
