#!/usr/bin/env node
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const SHEET_ID = process.argv[2];

async function inspectSheet() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
    if (!SHEET_ID) throw new Error('Sheet ID required as argument');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID
    });

    console.log(`\n📄 Sheet: ${metadata.data.properties.title}\n`);
    console.log('Tabs:');
    metadata.data.sheets.forEach(sheet => {
      console.log(`  - ${sheet.properties.title}`);
    });

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

inspectSheet();
