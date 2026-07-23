const fs = require('fs');
const path = require('path');
const https = require('https');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxKNz17fOJGtvpelympncLGwqvRc-eEv0WWBWDrnBrXPP5VVbmejKHUzmxigtlWGhgm/exec';

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

function sanitizeData(item) {
  if (typeof item === 'string') {
    return item
      .replace(/[\uFFFD?]{2,3}인원/g, '연인원')
      .replace(/목[\uFFFD?]+_/g, '목표_')
      .replace(/\uFFFD/g, '');
  }
  if (Array.isArray(item)) {
    return item.map(sanitizeData);
  }
  if (item && typeof item === 'object') {
    const clean = {};
    for (const k in item) {
      let cleanKey = k.replace(/목[\uFFFD?]+_/g, '목표_').replace(/\uFFFD/g, '');
      if (cleanKey === '목표_실인') cleanKey = '목표_실인원';
      clean[cleanKey] = sanitizeData(item[k]);
    }
    return clean;
  }
  return item;
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
    staffs: [],
    attendance: [],
    workLogs: [],
    supervision: [],
    timestamp: new Date().toISOString()
  };

  if (response && response.success && response.data) {
    snapshotData = sanitizeData({
      ...response.data,
      timestamp: new Date().toISOString()
    });
    if (snapshotData.members && Array.isArray(snapshotData.members)) {
      snapshotData.members = snapshotData.members.filter(m => m && m.이름 && String(m.이름).trim() !== '');
    }
    console.log('[Build] Successfully fetched and sanitized snapshot data!');
    console.log(` - Teams: ${snapshotData.teams ? snapshotData.teams.length : 0}`);
    console.log(` - Programs: ${snapshotData.programs ? snapshotData.programs.length : 0}`);
    console.log(` - Members: ${snapshotData.members ? snapshotData.members.length : 0}`);
    console.log(` - Staffs: ${snapshotData.staffs ? snapshotData.staffs.length : 0}`);
    console.log(` - Attendance: ${snapshotData.attendance ? snapshotData.attendance.length : 0}`);
    console.log(` - WorkLogs: ${snapshotData.workLogs ? snapshotData.workLogs.length : 0}`);
  } else {
    console.warn('[Build] Warning: Could not fetch live data from GAS during build. Creating fallback static files.');
  }

  // Save full snapshot JSON
  const snapshotContent = JSON.stringify(snapshotData, null, 2);
  fs.writeFileSync(path.join(dataDir, 'snapshot.json'), snapshotContent);

  // Save individual action endpoint JSONs for fast fetch
  const writeStaticJson = (fileName, data) => {
    fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify({ success: true, data: sanitizeData(data) }, null, 2));
  };

  writeStaticJson('getMembers.json', snapshotData.members || []);
  writeStaticJson('getPrograms.json', snapshotData.programs || []);
  writeStaticJson('getTeams.json', snapshotData.teams || []);
  writeStaticJson('getStats.json', snapshotData.stats || []);
  writeStaticJson('getStaffs.json', snapshotData.staffs || []);
  writeStaticJson('getAttendanceSheet.json', snapshotData.attendance || []);
  writeStaticJson('getDailyWorkLogs.json', snapshotData.workLogs || []);
  writeStaticJson('getSupervision.json', snapshotData.supervision || []);

  console.log('[Build] All static pre-rendered JSON files generated and sanitized in /data!');
}

build();
