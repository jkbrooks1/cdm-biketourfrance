#!/usr/bin/env node
/**
 * Script: populate-tour-dates.js
 * Purpose: Populate the Date column in RDE_Days_Master sheet based on tour start date
 * Usage: node scripts/populate-tour-dates.js
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SHEETS_ID = process.env.TOUR_SHEETS_ID;
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

// Tour dates (using local date to avoid timezone issues)
function createLocalDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date;
}

const TOUR_START_DATE = createLocalDate(2026, 8, 28);
const TOUR_END_DATE = createLocalDate(2026, 9, 7);

async function populateTourDates() {
  try {
    if (!SHEETS_ID) throw new Error('TOUR_SHEETS_ID not set');
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    console.log('✓ Decoding service account credentials...');
    let serviceAccountInfo;
    try {
      const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
      serviceAccountInfo = JSON.parse(decodedKey);
    } catch (err) {
      try {
        serviceAccountInfo = JSON.parse(SERVICE_ACCOUNT_KEY_BASE64);
      } catch (jsonErr) {
        throw new Error(`Failed to parse service account key: ${err.message}`);
      }
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✓ Google Sheets API authenticated');

    // Read RDE_Days_Master to get Tour_Day and Ride_Day columns
    console.log('✓ Reading RDE_Days_Master sheet...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: 'RDE_Days_Master!A:Z'
    });

    const rows = response.data.values || [];
    if (rows.length < 2) {
      throw new Error('RDE_Days_Master sheet appears empty');
    }

    // Create header map
    const header = rows[0];
    const headerMap = {};
    header.forEach((col, idx) => {
      if (col) headerMap[col.trim()] = idx;
    });

    const tourDayCol = headerMap['Tour_Day'];
    const rideTypeCol = headerMap['Ride_Day'];
    const dateCol = headerMap['Date'];

    if (tourDayCol === undefined) throw new Error('Tour_Day column not found');
    if (rideTypeCol === undefined) throw new Error('Ride_Day column not found');
    if (dateCol === undefined) throw new Error('Date column not found');

    console.log(`✓ Found columns: Tour_Day=${tourDayCol}, Ride_Day=${rideTypeCol}, Date=${dateCol}`);

    // Build updates: for each row, calculate the date based on Tour_Day
    const updates = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const tourDayRaw = (row[tourDayCol] || '').trim();
      const rideDayRaw = (row[rideTypeCol] || '').trim().toUpperCase();

      if (!tourDayRaw || isNaN(parseInt(tourDayRaw))) {
        continue; // skip empty rows
      }

      const tourDayNum = parseInt(tourDayRaw);

      // Calculate date: Tour_Day 0 = 8/28 (arrival), Tour_Day 1 = 8/29 (first ride), etc.
      const tourDate = new Date(TOUR_START_DATE);
      tourDate.setDate(tourDate.getDate() + tourDayNum);

      // Format as M/D/YYYY
      const month = tourDate.getMonth() + 1;
      const day = tourDate.getDate();
      const year = tourDate.getFullYear();
      const dateString = `${month}/${day}/${year}`;

      // Row index in A1 notation (add 2 because row 1 is header and sheets are 1-indexed)
      const cellRef = `RDE_Days_Master!${String.fromCharCode(65 + dateCol)}${i + 1}`;

      updates.push({
        range: cellRef,
        values: [[dateString]]
      });

      console.log(`  Tour_Day ${tourDayNum}: ${dateString}`);
    }

    if (updates.length === 0) {
      throw new Error('No rows with Tour_Day values found');
    }

    // Apply all updates
    console.log(`\n✓ Updating ${updates.length} date cells...`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEETS_ID,
      resource: {
        data: updates,
        valueInputOption: 'USER_ENTERED'
      }
    });

    console.log(`✓ Successfully populated dates (${TOUR_START_DATE.toLocaleDateString()} to ${TOUR_END_DATE.toLocaleDateString()})`);

  } catch (err) {
    console.error(`\n✗ Error: ${err.message}`);
    process.exit(1);
  }
}

populateTourDates();
