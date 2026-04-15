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
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function fetch() {
  try {
    console.log('Fetching TWN_Route_Stops...\n');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: tourSheetsId,
      range: `'TWN_Route_Stops'!A:Z`,
    });

    const values = result.data.values || [];
    console.log('Headers:', values[0]);
    console.log('\nFirst 10 rows:');
    for (let i = 1; i <= Math.min(10, values.length - 1); i++) {
      console.log(`  Row ${i}:`, values[i].slice(0, 6));
    }

    fs.writeFileSync('/tmp/route_stops.json', JSON.stringify(values, null, 2));
    console.log(`\n✓ Saved ${values.length} rows to /tmp/route_stops.json`);

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

fetch();
