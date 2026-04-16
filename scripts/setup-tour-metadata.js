#!/usr/bin/env node
/**
 * Script: setup-tour-metadata.js
 * Purpose: Create/update Tour_Metadata sheet with tour metadata
 * Usage: node scripts/setup-tour-metadata.js
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SHEETS_ID = process.env.TOUR_SHEETS_ID;
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const TOUR_NAME = process.env.TOUR_NAME || 'Tour';
const TOUR_SLUG = process.env.TOUR_SLUG || 'tour';
const TOUR_DESCRIPTION = process.env.TOUR_DESCRIPTION || '';

async function setupTourMetadata() {
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

    // Check if Tour_Metadata sheet exists
    console.log('✓ Checking for Tour_Metadata sheet...');
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEETS_ID
    });

    const sheetExists = spreadsheet.data.sheets.some(s => s.properties.title === 'Tour_Metadata');

    if (!sheetExists) {
      console.log('✓ Creating Tour_Metadata sheet...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEETS_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Tour_Metadata'
                }
              }
            }
          ]
        }
      });
    }

    // Write metadata to the sheet
    console.log('✓ Writing tour metadata...');
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEETS_ID,
      resource: {
        data: [
          {
            range: 'Tour_Metadata!A1:B1',
            values: [['Property', 'Value']]
          },
          {
            range: 'Tour_Metadata!A2:B2',
            values: [['Tour_Name', TOUR_NAME]]
          },
          {
            range: 'Tour_Metadata!A3:B3',
            values: [['Tour_Slug', TOUR_SLUG]]
          },
          {
            range: 'Tour_Metadata!A4:B4',
            values: [['Tour_Description', TOUR_DESCRIPTION]]
          }
        ],
        valueInputOption: 'USER_ENTERED'
      }
    });

    console.log('\n✓ Tour metadata sheet created/updated:');
    console.log(`  Tour_Name: ${TOUR_NAME}`);
    console.log(`  Tour_Slug: ${TOUR_SLUG}`);
    console.log(`  Tour_Description: ${TOUR_DESCRIPTION}`);

  } catch (err) {
    console.error(`\n✗ Error: ${err.message}`);
    process.exit(1);
  }
}

setupTourMetadata();
