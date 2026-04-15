const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

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

console.log('Credentials B64:', credsB64.substring(0, 20) + '...');
console.log('Tour Sheets ID:', tourSheetsId);

// Decode base64
const credsJson = JSON.parse(Buffer.from(credsB64, 'base64').toString('utf8'));
console.log('✓ Decoded credentials');

// Create auth
const auth = new google.auth.GoogleAuth({
  credentials: credsJson,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function fetchTwnInfra() {
  try {
    console.log('Authenticating and fetching TWN_INFRA...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: tourSheetsId,
      range: 'TWN_INFRA',
    });

    const values = result.data.values || [];
    console.log(`✓ Retrieved ${values.length} rows from TWN_INFRA`);
    
    console.log('\nHeaders:', values[0]);
    console.log('\nFirst 3 data rows:');
    for (let i = 1; i <= Math.min(3, values.length - 1); i++) {
      console.log(`  Row ${i}:`, values[i]);
    }

    // Save to JSON
    fs.writeFileSync('/tmp/twn_infra_raw.json', JSON.stringify(values, null, 2));
    console.log('\n✓ Saved full data to /tmp/twn_infra_raw.json');

  } catch (error) {
    console.error('ERROR:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

fetchTwnInfra();
