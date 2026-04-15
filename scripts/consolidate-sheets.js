#!/usr/bin/env node
/**
 * Script: consolidate-sheets.js
 * Purpose: Consolidate all CDM tour data into the main tour sheet with standardized naming
 *
 * Naming convention (3-letter prefix):
 * RDE_ = Ride Event/Details (highlights, lunch, media, route info)
 * TWN_ = Towns/Locations (infrastructure, descriptions, stops)
 * DAY_ = Daily Details (day-by-day breakdown)
 * REF_ = Reference/Config (stats, roster, settings)
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const SOURCE_SHEET_ID = '1esRvXfJxILbAhdCyvliNmwm6h4kul9DXqZ4Q3YOR4wA'; // CDM sheet
const TARGET_SHEET_ID = '1OUtAtMZrE4cR-GDijHu4IY4bbowjs3itHpjSTpq1I8g'; // Tour sheet

// Define tab groupings and new names
const TAB_MAPPING = {
  // From CDM sheet → New name in tour sheet
  // RDE_ = Ride Event Details
  'RD_Highlights': 'RDE_Highlights',
  'Lunch_Option': 'RDE_Lunch_Options',
  'Media_Manifest': 'RDE_Media_Assets',

  // TWN_ = Towns/Locations
  'Raw_Towns': 'TWN_Raw_Reference',
  'Town_Reference': 'TWN_Reference',
  'Towns on Route': 'TWN_Route_Stops',
  'Towns_Infrastructure_Master - Towns_Infrastructure_Master': 'TWN_Infrastructure',
  'Towns_75_WordWrite-ups': 'TWN_Narratives',

  // DAY_ = Daily Details
  'Day_1': 'DAY_01',
  'Day_2': 'DAY_02',
  'Day_3': 'DAY_03',
  'Day_4': 'DAY_04',
  'Day_5': 'DAY_05',
  'Day_6': 'DAY_06',
  'Day_7': 'DAY_07',
  'Day_8': 'DAY_08',

  // RDE_ = Ride Details/Master
  'Ride_Days': 'RDE_Days_Reference',
  'All_Ride_Days': 'RDE_Days_Consolidated',
  'Ride_Days_Master': 'RDE_Days_Master',

  // REF_ = Reference/Config
  'Global_Stats': 'REF_Global_Stats',
  'Short_Itinerary': 'REF_Itinerary',
  'Riders': 'REF_Riders',
  'Element_Positions': 'REF_Element_Layout',
  'README': 'REF_Documentation',
  'Daily updates': 'REF_Daily_Updates',
  'Sheet11': 'REF_Archive'
};

async function consolidateSheets() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    console.log('\n📋 CONSOLIDATION PLAN:\n');

    // Get current sheets
    const sourceMetadata = await sheets.spreadsheets.get({ spreadsheetId: SOURCE_SHEET_ID });
    const targetMetadata = await sheets.spreadsheets.get({ spreadsheetId: TARGET_SHEET_ID });

    const sourceTabs = new Map(sourceMetadata.data.sheets.map(s => [s.properties.title, s.properties.sheetId]));
    const targetTabs = new Map(targetMetadata.data.sheets.map(s => [s.properties.title, s.properties.sheetId]));

    console.log(`Source Sheet: ${sourceMetadata.data.properties.title}`);
    console.log(`Target Sheet: ${targetMetadata.data.properties.title}\n`);

    // Step 1: Copy missing tabs from source to target
    console.log('📤 COPYING TABS FROM CDM SHEET:\n');

    const tabsCopied = [];
    const tabsRenamed = [];

    for (const [sourceTab, newName] of Object.entries(TAB_MAPPING)) {
      if (!sourceTabs.has(sourceTab)) {
        console.log(`  ⚠️  Source tab not found: ${sourceTab}`);
        continue;
      }

      // Check if tab already exists in target
      if (targetTabs.has(sourceTab)) {
        console.log(`  ✓ ${sourceTab} → ${newName} (exists, will rename)`);
        tabsRenamed.push({ old: sourceTab, new: newName });
      } else if (!targetTabs.has(newName)) {
        console.log(`  ✓ ${sourceTab} → ${newName} (will copy)`);
        tabsCopied.push({ source: sourceTab, target: newName });
      } else {
        console.log(`  ⚠️  ${newName} already exists in target`);
      }
    }

    // Step 2: Copy tabs via duplicate sheet method
    if (tabsCopied.length > 0) {
      console.log(`\n🔄 Copying ${tabsCopied.length} tabs...\n`);

      for (const { source, target } of tabsCopied) {
        try {
          const sourceSheetId = sourceTabs.get(source);

          // Use sheets API to duplicate within source, then move to target
          // Actually, we'll use a simpler approach: copy data directly

          // Get all data from source tab
          const sourceData = await sheets.spreadsheets.values.get({
            spreadsheetId: SOURCE_SHEET_ID,
            range: `'${source}'!A:Z`
          });

          // Add new sheet to target
          const addSheetResponse = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: TARGET_SHEET_ID,
            resource: {
              requests: [
                {
                  addSheet: {
                    properties: { title: target }
                  }
                }
              ]
            }
          });

          const newSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;

          // Copy data
          if (sourceData.data.values) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: TARGET_SHEET_ID,
              range: `'${target}'!A:Z`,
              valueInputOption: 'RAW',
              resource: { values: sourceData.data.values }
            });
          }

          console.log(`  ✓ Copied: ${source} → ${target}`);
        } catch (err) {
          console.error(`  ✗ Failed to copy ${source}: ${err.message}`);
        }
      }
    }

    // Step 3: Rename existing tabs
    if (tabsRenamed.length > 0) {
      console.log(`\n✏️  Renaming ${tabsRenamed.length} existing tabs...\n`);

      for (const { old, new: newName } of tabsRenamed) {
        try {
          const sheetId = targetTabs.get(old);

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: TARGET_SHEET_ID,
            resource: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: sheetId,
                      title: newName
                    },
                    fields: 'title'
                  }
                }
              ]
            }
          });

          console.log(`  ✓ Renamed: ${old} → ${newName}`);
        } catch (err) {
          console.error(`  ✗ Failed to rename ${old}: ${err.message}`);
        }
      }
    }

    console.log('\n✓ Consolidation complete!');
    console.log('\n📚 Tab Prefixes:');
    console.log('   RDE_ = Ride Event Details');
    console.log('   TWN_ = Towns/Locations');
    console.log('   DAY_ = Daily Details (Day_01-08)');
    console.log('   REF_ = Reference/Config');

  } catch (err) {
    console.error(`\n✗ ERROR: ${err.message}`);
    process.exit(1);
  }
}

consolidateSheets();
