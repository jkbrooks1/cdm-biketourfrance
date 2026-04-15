#!/usr/bin/env node
/**
 * Script: inspect-tour-sheet.js
 * Purpose: Verify all required data tabs are in the tour sheet
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const TOUR_SHEETS_ID = process.env.TOUR_SHEETS_ID;

const REQUIRED_TABS = [
  'RDE_Days_Master',
  'TWN_Narratives',
  'RDE_Highlights',
  'RDE_Lunch_Options',
  'RDE_Media_Assets',
  'TWN_Infrastructure'
];

async function inspectSheet() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');
    if (!TOUR_SHEETS_ID) throw new Error('TOUR_SHEETS_ID not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: TOUR_SHEETS_ID
    });

    console.log('\n📊 AVAILABLE TABS IN TOUR SHEET:\n');
    const availableTabs = metadata.data.sheets.map(s => s.properties.title);
    availableTabs.forEach(tab => {
      console.log(`  ✓ ${tab}`);
    });

    console.log('\n📋 REQUIRED TABS FOR DATA PIPELINE:\n');
    REQUIRED_TABS.forEach(tab => {
      const found = availableTabs.includes(tab);
      const symbol = found ? '✓' : '✗';
      console.log(`  ${symbol} ${tab}`);
    });

    const missing = REQUIRED_TABS.filter(tab => !availableTabs.includes(tab));
    if (missing.length > 0) {
      console.log(`\n⚠️  MISSING ${missing.length} REQUIRED TAB(S):`);
      missing.forEach(tab => console.log(`  - ${tab}`));
    } else {
      console.log('\n✓ All required tabs present!');
    }

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

inspectSheet();
