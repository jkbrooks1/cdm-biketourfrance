#!/usr/bin/env node
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SHEETS_ID = process.env.TOUR_SHEETS_ID;
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

async function inspectSheet() {
  try {
    if (!SHEETS_ID) throw new Error('TOUR_SHEETS_ID not set');
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get metadata about the spreadsheet
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SHEETS_ID
    });

    console.log('\n📋 SHEET NAMES AND STRUCTURE:\n');
    metadata.data.sheets.forEach((sheet) => {
      console.log(`- "${sheet.properties.title}"`);
    });

    // Try to fetch the Towns_Infrastructure_Master sheet
    console.log('\n\n📊 TOWNS_INFRASTRUCTURE_MASTER DATA:\n');

    const townSheets = metadata.data.sheets.filter(s =>
      s.properties.title.includes('Towns') || s.properties.title.includes('Infrastructure')
    );

    if (townSheets.length > 0) {
      for (const sheet of townSheets) {
        console.log(`\nSheet: "${sheet.properties.title}"`);

        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEETS_ID,
          range: `'${sheet.properties.title}'!A1:Z2`
        });

        if (response.data.values) {
          console.log('Header Row:', response.data.values[0]);
          if (response.data.values[1]) {
            console.log('Sample Data:', response.data.values[1]);
          }
        }
      }
    } else {
      console.log('No sheet found with "Towns" or "Infrastructure" in the name.');
      console.log('Fetching all sheets to find the right one...\n');

      const allSheets = metadata.data.sheets.map(s => s.properties.title);
      console.log('Available sheets:', allSheets);
    }

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

inspectSheet();
