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
    // Get day boundaries from RDE_Days_Master or similar
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: tourSheetsId,
      range: `'RDE_Days_Master'!A:E`,
    });

    const values = result.data.values || [];
    console.log('Headers:', values[0]);
    console.log('\nDay boundaries:');
    for (let i = 1; i < values.length; i++) {
      console.log(`  ${values[i].join(' | ')}`);
    }

    fs.writeFileSync('/tmp/day_boundaries.json', JSON.stringify(values, null, 2));

  } catch (error) {
    console.error('ERROR:', error.message);
  }
}

fetch();
