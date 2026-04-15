#!/usr/bin/env node
/**
 * Script: validate-and-transform.js
 * Version: 1.0
 * Build: 2
 * Date: 2026-0413
 * AI: Claude Haiku 4.5
 * Purpose: Fetch tour data from Google Sheets, validate against BTF schema, transform to tour-data.json
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SHEETS_ID = process.env.TOUR_SHEETS_ID;
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const TOUR_NAME = process.env.TOUR_NAME || 'Tour';
const TOUR_SLUG = process.env.TOUR_SLUG || 'tour';
const TOUR_START_DATE = process.env.TOUR_START_DATE || '';
const TOUR_END_DATE = process.env.TOUR_END_DATE || '';
const TOUR_DESCRIPTION = process.env.TOUR_DESCRIPTION || '';
const R2_BASE_URL = process.env.R2_BASE_URL || 'https://pub-40b24fc600d44d828529b84a0d97ded7.r2.dev';

// BTF Branding constants
const BRANDING = {
  colors: {
    primary: '#2D5016',
    secondary: '#1B4F72',
    cta: '#0066cc',
    background: '#F5F0E8'
  },
  fonts: {
    primary: 'Montserrat',
    fallback: 'Arial, sans-serif'
  }
};

async function validateAndTransform() {
  const startTime = Date.now();
  
  try {
    if (!SHEETS_ID) throw new Error('TOUR_SHEETS_ID not set');
    if (!SERVICE_ACCOUNT_KEY_BASE64) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set');

    console.log('✓ Validating environment...');

    let serviceAccountInfo;
    try {
      const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
      serviceAccountInfo = JSON.parse(decodedKey);
    } catch (err) {
      throw new Error(`Failed to decode service account key: ${err.message}`);
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✓ Google Sheets API authenticated');

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEETS_ID,
      ranges: [
        'RDE_Days_Master!A:Z',
        'TWN_Narratives!A:Z',
        'RDE_Highlights!A:Z',
        'RDE_Lunch_Options!A:Z',
        'RDE_Media_Assets!A:Z',
        'TWN_Infrastructure!A:Z'
      ]
    });

    console.log('✓ Fetched all Sheets tabs');

    const tabs = {
      rideDays: response.data.valueRanges[0].values || [],
      townNarratives: response.data.valueRanges[1].values || [],
      highlights: response.data.valueRanges[2].values || [],
      lunchOptions: response.data.valueRanges[3].values || [],
      mediaManifest: response.data.valueRanges[4].values || [],
      townsInfrastructure: response.data.valueRanges[5].values || []
    };

    const tourData = parseTourData(tabs);
    console.log(`✓ Parsed ${tourData.rides.length} ride days`);

    const outputPath = path.join(__dirname, '../src/data/tour-data.json');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(tourData, null, 2));
    console.log(`✓ Tour data written to src/data/tour-data.json`);

    const elapsedMs = Date.now() - startTime;
    console.log(`\n✓ Validation and transform complete (${elapsedMs}ms)`);

  } catch (err) {
    console.error(`\n✗ ERROR: ${err.message}`);
    process.exit(1);
  }
}

function parseTourData(tabs) {
  const rideHeader = tabs.rideDays[0] || [];
  const rideHeaderMap = createHeaderMap(rideHeader);
  
  const rides = (tabs.rideDays.slice(1) || []).map((row) => {
    const tourDayRaw = (row[rideHeaderMap['Tour_Day']] || '').trim();
    const rideDayRaw = (row[rideHeaderMap['Ride_Day']] || '').trim().toUpperCase();
    const tourDayNum = parseInt(tourDayRaw);
    if (isNaN(tourDayNum)) return null; // skip empty/malformed rows

    const rideType = rideDayRaw === 'REST'  ? 'rest'    :
                     rideDayRaw === 'TRAIN' ? 'train'   :
                     tourDayNum === 0       ? 'arrival' : 'ride';

    return {
      dayNumber:  `TourDay_${String(tourDayNum).padStart(2, '0')}`, // URL slug
      tourDayNum,  // numeric for display: 1, 2, ...
      rideType,    // 'arrival' | 'ride' | 'rest' | 'train'
      rideDay: rideDayRaw, // original Ride_Day value for lookup in other tabs
      date: row[rideHeaderMap['Date']] || '',
      startTown: row[rideHeaderMap['Start_Town']] || '',
      endTown: row[rideHeaderMap['End_Town']] || '',
      miles: parseFloat(row[rideHeaderMap['Miles']]) || 0,
      elevation: parseFloat(row[rideHeaderMap['Hand coded Elevation']] || row[rideHeaderMap['Elevation']]) || 0,
      rwgpsId: row[rideHeaderMap['RWGPS_Route_ID']] || '',
      pandaImage: row[rideHeaderMap['Panda_Asset_Name']] || ''
    };
  }).filter(Boolean);

  // Deduplicate rides by dayNumber, keeping the first valid (non-empty) entry
  const seenDays = new Set();
  const uniqueRides = [];
  for (const ride of rides) {
    if (!seenDays.has(ride.dayNumber)) {
      seenDays.add(ride.dayNumber);
      uniqueRides.push(ride);
    }
  }
  rides.length = 0;
  rides.push(...uniqueRides);

  const townHeader = tabs.townNarratives[0] || [];
  const townHeaderMap = createHeaderMap(townHeader);

  // Build a lookup map: endTown name → narrative
  const narrativeByTown = {};
  (tabs.townNarratives.slice(1) || []).forEach((row) => {
    const name = (row[townHeaderMap['Overnight Town']] || '').trim();
    const text = row[townHeaderMap['75-Word Write-Up']] || '';
    if (name) narrativeByTown[name] = text;
  });

  const highlightHeader = tabs.highlights[0] || [];
  const highlightHeaderMap = createHeaderMap(highlightHeader);
  const highlightsByDay = {};
  
  (tabs.highlights.slice(1) || []).forEach((row) => {
    const day = row[highlightHeaderMap['Ride Day']];
    if (!highlightsByDay[day]) highlightsByDay[day] = [];
    
    for (let i = 1; i <= 3; i++) {
      const titleKey = `HL${i}_Title`;
      const descKey = `HL${i}_Desc`;
      const title = row[highlightHeaderMap[titleKey]];
      const desc = row[highlightHeaderMap[descKey]];
      
      if (title && desc && highlightsByDay[day].length < 3) {
        highlightsByDay[day].push({ title, description: desc });
      }
    }
  });

  const lunchHeader = tabs.lunchOptions[0] || [];
  const lunchHeaderMap = createHeaderMap(lunchHeader);
  const lunchByDay = {};
  
  (tabs.lunchOptions.slice(1) || []).forEach((row) => {
    const day = row[lunchHeaderMap['Ride_Day']] || row[lunchHeaderMap['Date']];
    if (day) {
      lunchByDay[day] = {
        name: row[lunchHeaderMap['Business_Name']] || '',
        type: row[lunchHeaderMap['Business_Type']] || '',
        milepost: parseFloat(row[lunchHeaderMap['Mile_Post_On_Route']]) || 0
      };
    }
  });

  const mediaHeader = tabs.mediaManifest[0] || [];
  const mediaHeaderMap = createHeaderMap(mediaHeader);
  const mediaRows = tabs.mediaManifest.slice(1) || [];
  
  let logo = 'BTF_LOGO_White_on_Transparent.png';

  // Fallback map keyed by Tour_Day number (0–10)
  // Tour Day 5 = REST, Tour Days 6-9 = Ride Days 5-8
  const PANDA_FALLBACK = {
    '0':  'BTF_CDM_RD00_KICKOFF_PANDA_v2.png',
    '1':  'BTF_CDM_RD01_PANDA_v2.png',
    '2':  'BTF_CDM_RD02_PANDA_v1.png',
    '3':  'BTF_CDM_RD03_PANDA_v1.png',
    '4':  'BTF_CDM_RD04_PANDA_v1.png',
    '5':  'BTF_CDM_RESTDAY_PANDA_v2.png',
    '6':  'BTF_CDM_RD05_PANDA_v1.png',
    '7':  'BTF_CDM_RD06_PANDA_v1.png',
    '8':  'BTF_CDM_RD07_PANDA_v1.png',
    '9':  'BTF_CDM_RD08_PANDA_v1.png',
  };

  const pandaAssets = { ...PANDA_FALLBACK };

  // Media_Manifest entries override fallback; Day_Number maps to Tour_Day
  mediaRows.forEach((row) => {
    const day = row[mediaHeaderMap['Day_Number']];
    const assetName = row[mediaHeaderMap['Panda_Asset_Name']];
    if (day && assetName) {
      const normalizedDay = String(parseInt(day)); // '05' → '5'
      pandaAssets[normalizedDay] = assetName;
    }
  });

  // Parse towns infrastructure data
  const townsInfraHeader = tabs.townsInfrastructure[0] || [];
  const townsInfraHeaderMap = createHeaderMap(townsInfraHeader);
  const townsByRideDay = {};

  (tabs.townsInfrastructure.slice(1) || []).forEach((row) => {
    const rideDay = (row[townsInfraHeaderMap['Ride_Day']] || '').trim();
    if (!rideDay) return;

    if (!townsByRideDay[rideDay]) {
      townsByRideDay[rideDay] = [];
    }

    const boulangieAddress = row[townsInfraHeaderMap['Boulangerie_Address']] || '';
    const appleMapsLinkRaw = row[townsInfraHeaderMap['Apple_Maps_Link']] || '';

    // Append ", France" to Apple Maps links to ensure they resolve to French locations
    let appleMapsLink = appleMapsLinkRaw;
    if (appleMapsLinkRaw && !appleMapsLinkRaw.includes('France')) {
      appleMapsLink = appleMapsLinkRaw.replace('/?address=', '/?address=').replace(/([^=]+)$/, '$1,+France');
    }

    const town = {
      name: row[townsInfraHeaderMap['Town_Name']] || '',
      population: parseInt(row[townsInfraHeaderMap['Population']]) || 0,
      distanceFromStart: parseFloat(row[townsInfraHeaderMap['Distance_From_Start_Miles']]) || 0,
      wcAvailable: (row[townsInfraHeaderMap['WC_Available']] || '').toUpperCase() === 'Y',
      wcType: row[townsInfraHeaderMap['WC_Type']] || '',
      wcLocation: row[townsInfraHeaderMap['WC_Location']] || '',
      boulangerieName: row[townsInfraHeaderMap['Boulangerie_Name']] || '',
      boulangieAddress,
      distFromRoute: row[townsInfraHeaderMap['Distance_From_Route']] || '',
      googleMapsLink: row[townsInfraHeaderMap['Google_Maps_Link']] || '',
      appleMapsLink,
      cafes: row[townsInfraHeaderMap['Cafe_Count']] || '',
      riderNotes: row[townsInfraHeaderMap['Rider_Notes']] || '',
      description: row[townsInfraHeaderMap['Town_Description']] || ''
    };

    if (town.name) {
      townsByRideDay[rideDay].push(town);
    }
  });

  const enrichedRides = rides.map((ride) => ({
    ...ride,
    // highlights/lunch use Ride_Day values from their own sheets
    highlights: highlightsByDay[ride.rideDay] || [],
    lunch: lunchByDay[ride.rideDay] || null,
    pandaImageUrl: pandaAssets[String(ride.tourDayNum)]
      ? `${R2_BASE_URL}/${pandaAssets[String(ride.tourDayNum)]}`
      : null,
    overnightNarrative: narrativeByTown[ride.endTown.trim()] || '',
    towns: townsByRideDay[ride.rideDay] || []
  }));

  const totalMiles = enrichedRides.filter(r => r.rideType === 'ride').reduce((sum, r) => sum + r.miles, 0);
  const totalElevation = enrichedRides.filter(r => r.rideType === 'ride').reduce((sum, r) => sum + r.elevation, 0);

  // Derive start/end dates from ride data (day 0 or day 1 → last ride day)
  const rideDates = enrichedRides
    .filter(r => r.date && r.rideType !== 'train')
    .map(r => r.date);
  const derivedStartDate = rideDates[0] || TOUR_START_DATE;
  const derivedEndDate   = rideDates[rideDates.length - 1] || TOUR_END_DATE;

  // Extract end-to-end RWGPS route ID from arrival day
  const arrivalRide = enrichedRides.find(r => r.rideType === 'arrival');
  const endToEndRwgpsId = arrivalRide?.rwgpsId || '';

  return {
    tourName: TOUR_NAME,
    tourSlug: TOUR_SLUG,
    startDate: derivedStartDate,
    endDate: derivedEndDate,
    description: TOUR_DESCRIPTION,
    totalMiles: totalMiles.toFixed(1),
    totalElevation: Math.round(totalElevation),
    endToEndRwgpsId,
    branding: BRANDING,
    media: {
      r2Base: R2_BASE_URL,
      logo: `${R2_BASE_URL}/${logo}`
    },
    rides: enrichedRides,
    buildDate: new Date().toISOString()
  };
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

validateAndTransform().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
