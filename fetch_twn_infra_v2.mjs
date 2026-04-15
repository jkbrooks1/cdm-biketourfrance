import fs from 'fs';
import { google } from 'googleapis';

// Read .env file
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

// Decode base64
const credsJson = JSON.parse(Buffer.from(credsB64, 'base64').toString('utf8'));

// Create auth
const auth = new google.auth.GoogleAuth({
  credentials: credsJson,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function fetchTwnInfra() {
  try {
    // Fetch only columns A through N (excluding Google/Apple Maps links)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: tourSheetsId,
      range: `'TWN_Infrastructure'!A:N`,
    });

    const values = result.data.values || [];
    console.log(`✓ Retrieved ${values.length} rows (columns A-N only)`);
    
    console.log('\nHeaders:', values[0]);
    console.log('\nFirst 3 data rows:');
    for (let i = 1; i <= Math.min(3, values.length - 1); i++) {
      console.log(`  Row ${i}:`, values[i]);
    }

    // Save to JSON
    fs.writeFileSync('/tmp/twn_infra_clean.json', JSON.stringify(values, null, 2));
    console.log('\n✓ Saved clean data to /tmp/twn_infra_clean.json');

  } catch (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

fetchTwnInfra();
