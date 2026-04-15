#!/usr/bin/env node
/**
 * Script: rename-tour-tabs.js
 * Purpose: Rename existing tour sheet tabs to use the 3-letter prefix system
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const TARGET_SHEET_ID = '1OUtAtMZrE4cR-GDijHu4IY4bbowjs3itHpjSTpq1I8g';

const EXISTING_RENAMES = {
  'Ride_Days_Master': 'RDE_Days_Master',
  'Towns_Infrastructure_Master - Towns_Infrastructure_Master': 'TWN_Infrastructure',
  'Towns_75_WordWrite-ups': 'TWN_Narratives',
  'RD_Highlights': 'RDE_Highlights',
  'Lunch_Option': 'RDE_Lunch_Options',
  'Media_Manifest': 'RDE_Media_Assets',
  'Towns on Route': 'TWN_Route_Stops',
  'Global_Stats': 'REF_Global_Stats',
  'Short_Itinerary': 'REF_Itinerary',
  'Riders': 'REF_Riders',
  'Element_Positions': 'REF_Element_Layout',
  'Daily updates': 'REF_Daily_Updates',
  'Sheet11': 'REF_Archive'
};

async function renameTabs() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const metadata = await sheets.spreadsheets.get({ spreadsheetId: TARGET_SHEET_ID });
    const tabMap = new Map(metadata.data.sheets.map(s => [s.properties.title, s.properties.sheetId]));

    console.log('\n✏️  RENAMING EXISTING TABS:\n');

    const requests = [];
    for (const [oldName, newName] of Object.entries(EXISTING_RENAMES)) {
      if (tabMap.has(oldName)) {
        const sheetId = tabMap.get(oldName);
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              title: newName
            },
            fields: 'title'
          }
        });
        console.log(`  ✓ ${oldName} → ${newName}`);
      }
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: TARGET_SHEET_ID,
        resource: { requests }
      });

      console.log(`\n✓ Renamed ${requests.length} tabs!`);
    } else {
      console.log('  No tabs to rename');
    }

  } catch (err) {
    console.error(`\n✗ ERROR: ${err.message}`);
    process.exit(1);
  }
}

renameTabs();
