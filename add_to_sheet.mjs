import fs from 'fs';
import { google } from 'googleapis';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#') && line.includes('=')) {
    const [key, value] = line.split('=');
    env[key.trim()] = value.trim();
  }
});

const credsB64 = env.GOOGLE_SERVICE_ACCOUNT_KEY;
const tourSheetsId = env.TOUR_SHEETS_ID;
const credsJson = JSON.parse(Buffer.from(credsB64, 'base64').toString('utf8'));

const auth = new google.auth.GoogleAuth({
  credentials: credsJson,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function addSheets() {
  try {
    // Load the processed data
    const routeStops = JSON.parse(fs.readFileSync('/tmp/route_stops.json', 'utf8'));
    const infraRaw = JSON.parse(fs.readFileSync('/tmp/twn_infra_raw.json', 'utf8'));
    const tourData = JSON.parse(fs.readFileSync('src/data/tour-data.json', 'utf8'));

    const routeMap = {};
    routeStops.slice(1).forEach(row => {
      routeMap[row[0]] = parseFloat(row[2]);
    });

    const infraMap = {};
    infraRaw.slice(1).forEach(row => {
      infraMap[row[1]] = {
        wc: row[4]?.toUpperCase() === 'Y',
        wcType: row[5],
        wcLoc: row[6],
        bakery: row[7],
        bakeryAddr: row[8],
        distRoute: row[9],
        cafes: row[12]
      };
    });

    const dayBoundaries = [];
    let cumul = 0;
    tourData.rides.forEach(r => {
      dayBoundaries.push({
        day: r.tourDayNum,
        type: r.rideType,
        startCumul: cumul,
        miles: r.miles,
        endCumul: cumul + r.miles
      });
      if (r.rideType === 'ride') cumul += r.miles;
    });

    const days = {};
    Object.entries(routeMap).forEach(([town, routeMP]) => {
      dayBoundaries.forEach(d => {
        if (d.type === 'ride' && routeMP >= d.startCumul && routeMP <= d.endCumul) {
          if (!days[d.day]) days[d.day] = [];
          const dayFromStart = routeMP - d.startCumul;
          const infra = infraMap[town] || {};
          days[d.day].push({ dayFromStart, town, ...infra });
        }
      });
    });

    Object.keys(days).forEach(d => days[d].sort((a, b) => a.dayFromStart - b.dayFromStart));

    const round = n => Math.round(n * 10) / 10;

    // Prepare structured data rows
    const structuredRows = [['Day', 'Mile', 'Service', 'Facilities', 'Town', 'Location']];
    Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
      if (!days[day].length) return;
      days[day].forEach(t => {
        const services = [];
        const facilities = [];
        
        if (t.wc && t.wcType) {
          services.push('WC');
          facilities.push(`${t.wcType}${t.wcLoc ? ` (${t.wcLoc})` : ''}`);
        }
        if (t.bakery) {
          if (!services.includes('F')) services.push('F');
          facilities.push(t.bakery + (t.bakeryAddr ? ` — ${t.bakeryAddr}` : ''));
        }
        if (t.cafes && t.cafes !== '0') {
          if (!services.includes('F')) services.push('F');
          facilities.push('Cafés');
        }

        let distClass = 'on-route';
        if (t.distRoute?.toLowerCase() === 'off-route') distClass = 'off-route';
        else if (t.distRoute?.includes('~')) {
          const m = parseInt(t.distRoute.match(/\d+/)?.[0]);
          if (m >= 200) distClass = `${m}m`;
        }

        const service = services.join('/') || '';
        const fac = facilities.join('; ') || '';
        structuredRows.push([day, round(t.dayFromStart), service, fac, t.town, distClass]);
      });
    });

    // Create sheets
    console.log('Creating new sheets...');
    const batchUpdateRequest = {
      requests: [
        {
          addSheet: {
            properties: {
              title: 'TWN_Daily_Infrastructure',
              gridProperties: { rowCount: structuredRows.length + 100, columnCount: 6 }
            }
          }
        },
        {
          addSheet: {
            properties: {
              title: 'TWN_Infrastructure_Reference',
              gridProperties: { rowCount: 500, columnCount: 6 }
            }
          }
        }
      ]
    };

    const batchRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: tourSheetsId,
      requestBody: batchUpdateRequest
    });

    const sheetIds = batchRes.data.replies.map(r => r.addSheet.properties.sheetId);
    console.log(`✓ Created sheets with IDs: ${sheetIds}`);

    // Add structured data
    console.log('Adding structured data...');
    await sheets.spreadsheets.values.update({
      spreadsheetId: tourSheetsId,
      range: `'TWN_Daily_Infrastructure'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: structuredRows }
    });

    // Add formatted reference
    console.log('Adding formatted reference...');
    const referenceRows = [];
    Object.keys(days).sort((a, b) => parseInt(a) - parseInt(b)).forEach(day => {
      if (!days[day].length) return;
      const dayInfo = dayBoundaries.find(d => d.day == day);
      referenceRows.push([`Day ${day} (${round(dayInfo.miles)} miles)`, '', '', '', '']);
      referenceRows.push(['Mile', 'Service', 'Facilities', 'Town', 'Location']);
      days[day].forEach(t => {
        const services = [];
        const facilities = [];
        
        if (t.wc && t.wcType) {
          services.push('WC');
          facilities.push(`${t.wcType}${t.wcLoc ? ` (${t.wcLoc})` : ''}`);
        }
        if (t.bakery) {
          if (!services.includes('F')) services.push('F');
          facilities.push(t.bakery + (t.bakeryAddr ? ` — ${t.bakeryAddr}` : ''));
        }
        if (t.cafes && t.cafes !== '0') {
          if (!services.includes('F')) services.push('F');
          facilities.push('Cafés');
        }

        let distClass = 'on-route';
        if (t.distRoute?.toLowerCase() === 'off-route') distClass = 'off-route';
        else if (t.distRoute?.includes('~')) {
          const m = parseInt(t.distRoute.match(/\d+/)?.[0]);
          if (m >= 200) distClass = `${m}m`;
        }

        const service = services.join('/') || '';
        const fac = facilities.join('; ') || '';
        referenceRows.push([round(t.dayFromStart), service, fac, t.town, distClass]);
      });
      referenceRows.push(['', '', '', '', '']);
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: tourSheetsId,
      range: `'TWN_Infrastructure_Reference'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: referenceRows }
    });

    console.log(`\n✓ Added ${structuredRows.length} rows to structured data sheet`);
    console.log(`✓ Added ${referenceRows.length} rows to reference sheet`);
    console.log('\n✓ Both sheets added to Google Sheet successfully!');
    console.log(`\nSheets created:`);
    console.log(`  1. TWN_Daily_Infrastructure - structured, queryable data`);
    console.log(`  2. TWN_Infrastructure_Reference - formatted reference tables`);

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

addSheets();
