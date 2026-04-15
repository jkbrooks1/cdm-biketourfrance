#!/usr/bin/env node
/**
 * Script: add-town-descriptions.js
 * Purpose: Pull 25-word town descriptions from CDM_Tour_Towns_by_Ride_Day sheet's Town_Reference tab
 * and add them to the Towns_Infrastructure_Master sheet as a new column.
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const CDM_TOWNS_SHEET_ID = '1esRvXfJxILbAhdCyvliNmwm6h4kul9DXqZ4Q3YOR4wA';
const TARGET_SHEET_ID = '1OUtAtMZrE4cR-GDijHu4IY4bbowjs3itHpjSTpq1I8g';

async function addTownDescriptions() {
  try {
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
    const serviceAccountInfo = JSON.parse(decodedKey);

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✓ Google Sheets API authenticated');

    // Step 1: Fetch Town_Reference tab from CDM sheet to build description map
    console.log('\n📖 Fetching town descriptions from Town_Reference tab...');

    const townRefResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: CDM_TOWNS_SHEET_ID,
      range: 'Town_Reference!A:H'
    });

    const townRefData = townRefResponse.data.values || [];
    const townRefHeader = townRefData[0] || [];
    const townRefHeaderMap = createHeaderMap(townRefHeader);

    // Build map: town name → description
    const descriptionByTown = {};
    (townRefData.slice(1) || []).forEach((row) => {
      const displayTown = (row[townRefHeaderMap['Display Town']] || '').trim();
      const description = (row[townRefHeaderMap['25-word Town Note']] || '').trim();
      if (displayTown && description) {
        descriptionByTown[displayTown] = description;
      }
    });

    console.log(`✓ Loaded ${Object.keys(descriptionByTown).length} town descriptions`);

    // Step 2: Fetch current Towns_Infrastructure_Master sheet
    console.log('\n🏘️  Fetching Towns_Infrastructure_Master data...');

    const infraResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: TARGET_SHEET_ID,
      range: '\'Towns_Infrastructure_Master - Towns_Infrastructure_Master\'!A:O'
    });

    const infraData = infraResponse.data.values || [];
    const infraHeader = infraData[0] || [];
    const infraHeaderMap = createHeaderMap(infraHeader);

    // Check if Town_Description column exists; if not, add it
    let descColIndex = infraHeaderMap['Town_Description'];
    if (descColIndex === undefined) {
      descColIndex = infraHeader.length;
      infraHeader.push('Town_Description');
      console.log(`✓ Added Town_Description column at index ${descColIndex}`);
    }

    // Step 3: Update infrastructure rows with descriptions
    const updatedData = [infraHeader];
    let matchCount = 0;

    (infraData.slice(1) || []).forEach((row) => {
      const townName = (row[infraHeaderMap['Town_Name']] || '').trim();

      // Pad row to ensure it has enough cells for the description column
      while (row.length <= descColIndex) {
        row.push('');
      }

      // Populate description if available
      if (townName && descriptionByTown[townName]) {
        row[descColIndex] = descriptionByTown[townName];
        matchCount++;
      } else if (!row[descColIndex]) {
        row[descColIndex] = '';
      }

      updatedData.push(row);
    });

    console.log(`✓ Matched and updated ${matchCount} towns with descriptions`);

    // Step 4: Write updated data back to the sheet
    console.log('\n✍️  Writing updated data back to Google Sheet...');

    await sheets.spreadsheets.values.update({
      spreadsheetId: TARGET_SHEET_ID,
      range: '\'Towns_Infrastructure_Master - Towns_Infrastructure_Master\'!A:O',
      valueInputOption: 'RAW',
      resource: {
        values: updatedData
      }
    });

    console.log(`✓ Successfully updated Towns_Infrastructure_Master sheet`);
    console.log(`\n✓ Added town descriptions to ${matchCount} towns`);

  } catch (err) {
    console.error(`\n✗ ERROR: ${err.message}`);
    process.exit(1);
  }
}

function createHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((header, idx) => {
    if (header) {
      map[header.trim()] = idx;
    }
  });
  return map;
}

addTownDescriptions();
