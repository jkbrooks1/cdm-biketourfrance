#!/usr/bin/env node
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const TOWNS_SHEET_ID = '1esRvXfJxILbAhdCyvliNmwm6h4kul9DXqZ4Q3YOR4wA';
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

async function inspectTownsSheet() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get metadata
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: TOWNS_SHEET_ID
    });

    console.log('\n📋 TOWNS SHEET TABS:\n');
    metadata.data.sheets.forEach((sheet) => {
      console.log(`- "${sheet.properties.title}"`);
    });

    // Get first sheet (All_Ride_Days probably)
    const firstSheetName = metadata.data.sheets[0].properties.title;
    console.log(`\n\n📊 DATA FROM: "${firstSheetName}"\n`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TOWNS_SHEET_ID,
      range: `'${firstSheetName}'!A1:Z5`
    });

    if (response.data.values) {
      console.log('Header Row:', response.data.values[0]);
      console.log('\nSample rows:');
      response.data.values.slice(1, 4).forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, row.slice(0, 8));
      });
    }

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

inspectTownsSheet();
