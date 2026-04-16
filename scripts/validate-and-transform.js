#!/usr/bin/env node
/**
 * Script: validate-and-transform.js
 * Version: 2.0
 * Build: 3
 * Date: 2026-04-16
 * AI: Claude Haiku 4.5
 * Purpose: Fetch tour data from Google Sheets, validate against BTF schema, transform to tour-data.json
 *
 * CRITICAL: This is a HARD FAIL build script. Missing or malformed data causes build exit with non-zero status.
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
const R2_BASE_URL = process.env.R2_BASE_URL || 'https://pub-40b24fc600d44d828529b84a0d97ded7.r2.dev';

// These will be read from Tour_Metadata sheet
let TOUR_NAME = '';
let TOUR_SLUG = '';
let TOUR_DESCRIPTION = '';

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

// VALIDATION: Hard fail wrapper
function validateHardFail(condition, message) {
  if (!condition) {
    console.error(`\n✗ FATAL BUILD ERROR: ${message}`);
    process.exit(1);
  }
}

async function validateAndTransform() {
  const startTime = Date.now();

  try {
    validateHardFail(SHEETS_ID, 'TOUR_SHEETS_ID not set');
    validateHardFail(SERVICE_ACCOUNT_KEY_BASE64, 'GOOGLE_SERVICE_ACCOUNT_KEY not set');

    console.log('✓ Validating environment...');

    let serviceAccountInfo;
    try {
      const decodedKey = Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8');
      serviceAccountInfo = JSON.parse(decodedKey);
    } catch (err) {
      try {
        serviceAccountInfo = JSON.parse(SERVICE_ACCOUNT_KEY_BASE64);
      } catch (jsonErr) {
        throw new Error(`Failed to parse service account key (tried both base64 and JSON): ${err.message}`);
      }
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountInfo,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✓ Google Sheets API authenticated');

    // CRITICAL: Fetch ALL THREE required tabs + existing tabs
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEETS_ID,
      ranges: [
        'Tour_Metadata!A:B',
        'RDE_Days_Master!A:Z',
        'TWN_Narratives!A:Z',
        'RDE_Highlights!A:Z',
        'RDE_Lunch_Options!A:Z',
        'RDE_Media_Assets!A:Z',
        'TWN_WC!A:Z',
        'TWN_Cafe_Boulangeries!A:Z'
      ]
    });

    console.log('✓ Fetched all Sheets tabs');

    // Extract tour metadata
    const metadataRows = response.data.valueRanges[0].values || [];
    const metadataMap = {};
    metadataRows.forEach((row) => {
      if (row[0] && row[1]) {
        metadataMap[row[0]] = row[1];
      }
    });
    TOUR_NAME = metadataMap['Tour_Name'] || 'Tour';
    TOUR_SLUG = metadataMap['Tour_Slug'] || 'tour';
    TOUR_DESCRIPTION = metadataMap['Tour_Description'] || '';

    // CRITICAL: Hard fail on missing required tabs
    const tabs = {
      rideDays: response.data.valueRanges[1].values || [],
      townNarratives: response.data.valueRanges[2].values || [],
      highlights: response.data.valueRanges[3].values || [],
      lunchOptions: response.data.valueRanges[4].values || [],
      mediaManifest: response.data.valueRanges[5].values || [],
      wcTowns: response.data.valueRanges[6].values || [],
      cafeBoulangeries: response.data.valueRanges[7].values || [],
      townsInfrastructure: []
    };

    // HARD FAIL: Validate required tabs have data
    validateHardFail(tabs.lunchOptions.length > 0, 'RDE_Lunch_Options tab is empty or missing');
    validateHardFail(tabs.wcTowns.length > 0, 'TWN_WC tab is empty or missing');
    validateHardFail(tabs.cafeBoulangeries.length > 0, 'TWN_Cafe_Boulangeries tab is empty or missing');

    const tourData = parseTourData(tabs);
    console.log(`✓ Parsed ${tourData.rides.length} ride days`);
    console.log(`✓ Integrated route stops from 3 sheets`);

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
    console.error(`\n✗ FATAL: ${err.message}`);
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
    if (isNaN(tourDayNum)) return null;

    const rideType = rideDayRaw === 'REST'  ? 'rest'    :
                     rideDayRaw === 'TRAIN' ? 'train'   :
                     tourDayNum === 0       ? 'arrival' : 'ride';

    return {
      dayNumber:  `TourDay_${String(tourDayNum).padStart(2, '0')}`,
      tourDayNum,
      rideType,
      rideDay: rideDayRaw,
      date: row[rideHeaderMap['Date']] || '',
      startTown: row[rideHeaderMap['Start_Town']] || '',
      endTown: row[rideHeaderMap['End_Town']] || '',
      miles: parseFloat(row[rideHeaderMap['Miles']]) || 0,
      elevation: parseFloat(row[rideHeaderMap['Hand coded Elevation']] || row[rideHeaderMap['Elevation']]) || 0,
      rwgpsId: row[rideHeaderMap['RWGPS_Route_ID']] || '',
      pandaImage: row[rideHeaderMap['Panda_Asset_Name']] || '',
      routeTowns: row[rideHeaderMap['Route_Towns']] || '' // Optional: explicit route towns list
    };
  }).filter(Boolean);

  // Deduplicate rides
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

  // ==================================================
  // SECTION: Parse WC Towns (TWN_WC)
  // ==================================================
  const wcHeader = tabs.wcTowns[0] || [];
  const wcHeaderMap = createHeaderMap(wcHeader);
  const wcByTownNormalized = {}; // key: normalized town name

  (tabs.wcTowns.slice(1) || []).forEach((row) => {
    const townName = (row[wcHeaderMap['Town_Name']] || '').trim();
    if (!townName) return;

    const normTown = normalizeString(townName);
    if (!wcByTownNormalized[normTown]) {
      wcByTownNormalized[normTown] = [];
    }

    wcByTownNormalized[normTown].push({
      town: townName,
      facilityType: row[wcHeaderMap['Facility_Type']] || 'WC',
      location: row[wcHeaderMap['Location']] || '',
      rideDay: (row[wcHeaderMap['Ride_Day']] || '').trim(),
      verified: (row[wcHeaderMap['Verified']] || '').toUpperCase() === 'Y'
    });
  });

  // ==================================================
  // SECTION: Parse Cafe/Boulangeries (TWN_Cafe_Boulangeries)
  // ==================================================
  const cafeHeader = tabs.cafeBoulangeries[0] || [];
  const cafeHeaderMap = createHeaderMap(cafeHeader);
  const cafeByTownNormalized = {};
  const bastideByTownNormalized = {}; // BASTIDE RULE: source of truth

  (tabs.cafeBoulangeries.slice(1) || []).forEach((row) => {
    const townName = (row[cafeHeaderMap['Town_Name']] || '').trim();
    if (!townName) return;

    const normTown = normalizeString(townName);
    const bastideFlag = (row[cafeHeaderMap['Bastide']] || '').trim();

    // BASTIDE CONFLICT CHECK
    if (bastideByTownNormalized[normTown] !== undefined) {
      const existing = bastideByTownNormalized[normTown];
      const incoming = bastideFlag === 'Bastide' ? true : false;
      validateHardFail(existing === incoming,
        `BASTIDE CONFLICT: Town "${townName}" has conflicting Bastide values in TWN_Cafe_Boulangeries`);
    }

    bastideByTownNormalized[normTown] = (bastideFlag === 'Bastide');

    if (!cafeByTownNormalized[normTown]) {
      cafeByTownNormalized[normTown] = [];
    }

    cafeByTownNormalized[normTown].push({
      town: townName,
      name: row[cafeHeaderMap['Cafe_Name']] || row[cafeHeaderMap['Boulangerie_Name']] || '',
      type: row[cafeHeaderMap['Type']] || 'cafe',
      location: row[cafeHeaderMap['Location']] || '',
      rideDay: (row[cafeHeaderMap['Ride_Day']] || '').trim(),
      notes: row[cafeHeaderMap['Notes']] || ''
    });
  });

  // ==================================================
  // SECTION: Parse Lunch Options (RDE_Lunch_Options)
  // ==================================================
  const lunchHeader = tabs.lunchOptions[0] || [];
  const lunchHeaderMap = createHeaderMap(lunchHeader);
  const lunchByDay = {};

  (tabs.lunchOptions.slice(1) || []).forEach((row) => {
    const rideDay = (row[lunchHeaderMap['Ride_Day']] || '').trim();
    if (!rideDay) return;

    lunchByDay[rideDay] = {
      name: row[lunchHeaderMap['Business_Name']] || '',
      type: row[lunchHeaderMap['Business_Type']] || '',
      milepost: parseFloat(row[lunchHeaderMap['Mile_Post_On_Route']]) || 0,
      town: row[lunchHeaderMap['Town']] || row[lunchHeaderMap['Location']] || ''
    };
  });

  // ==================================================
  // SECTION: Build Route Stops (JOIN LOGIC)
  // ==================================================
  function buildRouteStops(ride) {
    const routeStops = [];

    // Determine route towns: use explicit list, or implicit from start/end
    let routeTowns = [];
    if (ride.routeTowns) {
      routeTowns = ride.routeTowns.split(',').map(t => t.trim()).filter(t => t);
    } else {
      // Fallback: include start and end towns
      routeTowns = [ride.startTown, ride.endTown].filter(t => t);
    }

    const routeTownsNormalized = routeTowns.map(t => normalizeString(t));

    // Collect all stops for towns on this route
    const stopsMap = {}; // key: normalized town name, value: array of stops

    // Add WC stops
    routeTownsNormalized.forEach((normTown, idx) => {
      const originalTown = routeTowns[idx];
      if (wcByTownNormalized[normTown]) {
        if (!stopsMap[normTown]) stopsMap[normTown] = [];
        wcByTownNormalized[normTown].forEach(wc => {
          stopsMap[normTown].push({
            town: originalTown,
            renderedTown: applyBastideRule(originalTown, normTown, bastideByTownNormalized),
            name: wc.location || wc.facilityType,
            type: 'wc',
            source: 'TWN_WC',
            verified: wc.verified,
            notes: wc.facilityType
          });
        });
      }
    });

    // Add Cafe/Boulangerie stops
    routeTownsNormalized.forEach((normTown, idx) => {
      const originalTown = routeTowns[idx];
      if (cafeByTownNormalized[normTown]) {
        if (!stopsMap[normTown]) stopsMap[normTown] = [];
        cafeByTownNormalized[normTown].forEach(cafe => {
          stopsMap[normTown].push({
            town: originalTown,
            renderedTown: applyBastideRule(originalTown, normTown, bastideByTownNormalized),
            name: cafe.name,
            type: cafe.type.toLowerCase().includes('boulangerie') ? 'boulangerie' : 'cafe',
            source: 'TWN_Cafe_Boulangeries',
            verified: true,
            notes: cafe.location || cafe.notes
          });
        });
      }
    });

    // Add Lunch stop if it matches a route town
    if (lunchByDay[ride.rideDay]) {
      const lunch = lunchByDay[ride.rideDay];
      const lunchTown = lunch.town || ride.endTown;
      const lunchNormTown = normalizeString(lunchTown);

      if (routeTownsNormalized.includes(lunchNormTown)) {
        const townIdx = routeTownsNormalized.indexOf(lunchNormTown);
        const originalTown = routeTowns[townIdx];

        if (!stopsMap[lunchNormTown]) stopsMap[lunchNormTown] = [];
        stopsMap[lunchNormTown].push({
          town: originalTown,
          renderedTown: applyBastideRule(originalTown, lunchNormTown, bastideByTownNormalized),
          name: lunch.name,
          type: 'lunch',
          source: 'RDE_Lunch_Options',
          verified: true,
          notes: `Mile ${lunch.milepost}`
        });
      } else {
        // HARD FAIL: Lunch stop doesn't match any route town
        validateHardFail(false,
          `UNMATCHED LUNCH: Ride ${ride.rideDay} lunch town "${lunchTown}" not found in route towns`);
      }
    }

    // HARD FAIL: Check for orphaned stops
    Object.keys(stopsMap).forEach(normTown => {
      validateHardFail(routeTownsNormalized.includes(normTown),
        `ORPHANED STOP: Town "${normTown}" in stops map but not in route`);
    });

    // Flatten into array with deduplication
    const seenStops = new Set();
    Object.values(stopsMap).forEach(townStops => {
      townStops.forEach(stop => {
        const stopKey = `${stop.renderedTown}|${stop.type}|${stop.name}`;
        if (!seenStops.has(stopKey)) {
          seenStops.add(stopKey);
          routeStops.push(stop);
        }
      });
    });

    return routeStops;
  }

  // ==================================================
  // SECTION: Render towns with Bastide rule
  // ==================================================
  function applyBastideRule(originalTown, normalizedTown, bastideMap) {
    const isBastide = bastideMap[normalizedTown];

    // HARD FAIL: If town in route and in cafe sheet, Bastide must be deterministic
    if (isBastide !== undefined) {
      return isBastide ? `${originalTown} (B)` : originalTown;
    }

    return originalTown;
  }

  const townHeader = tabs.townNarratives[0] || [];
  const townHeaderMap = createHeaderMap(townHeader);
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

  const mediaHeader = tabs.mediaManifest[0] || [];
  const mediaHeaderMap = createHeaderMap(mediaHeader);
  const mediaRows = tabs.mediaManifest.slice(1) || [];

  let logo = 'BTF_LOGO_White_on_Transparent.png';

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

  mediaRows.forEach((row) => {
    const day = row[mediaHeaderMap['Day_Number']];
    const assetName = row[mediaHeaderMap['Panda_Asset_Name']];
    if (day && assetName) {
      const normalizedDay = String(parseInt(day));
      pandaAssets[normalizedDay] = assetName;
    }
  });

  const DAY_SHAPES = {
    '1': `Bordeaux → La Réole: 45.7 miles, 1,050 ft elevation. Easy roll out through vineyards. Main climb: Sadirac area (mile 18, 2.3 mi, 240 ft gain). Route passes through Sadirac, Créon, Sauveterre-de-Guyenne. Final push into La Réole.`,
    '2': `La Réole → Aiguillon: 28.4 miles, 120 ft elevation. Flat river valley day following Garonne River. Easy pace with minimal elevation. Route passes through Meilhan-sur-Garonne, Marmande, Le Mas d'Agenais, Clairac, Tonneins, Damazan. Perfect recovery day after Day 1.`,
    '3': `Aiguillon → Moissac: 47.5 miles, 160 ft elevation. Longer day with gentle rolling terrain transitioning toward Lot River valley. Route passes through Agen, Bon-Encontre, Boé. Moissac marks entry to abbey country with stunning medieval landscape.`,
    '4': `Moissac → Toulouse: 44.2 miles, 70 ft elevation. Nearly flat day building toward major city. Steady pace through Castelsarrasin, Valence-d'Agen, Montauban. Final approach into Toulouse—urban cycling as route enters metropolitan area.`,
    '5': `REST DAY — Toulouse. Historic city day for resupply and exploration.`,
    '6': `Toulouse → Castelnaudary: 40.1 miles, 190 ft elevation. Gentle rolling exits the city. Transition toward Canal du Midi region. Route climbs slightly through Villefranche-de-Lauragais before arriving at Castelnaudary—the heart of cassoulet country.`,
    '7': `Castelnaudary → Carcassonne: 22.3 miles, 70 ft elevation. Short flat day. Route passes through Bram and Le Somail on or near Canal du Midi. Carcassonne—dramatic medieval fortress city—marks final fortress landmark before Mediterranean approach.`,
    '8': `Carcassonne → Capestang: 57.3 miles, 120 ft elevation. Longest day, but flat. Full day along Canal du Midi—one of the world's most beautiful waterway routes. Route passes through Homps and Paraza. Steady pace through iconic landscape.`,
    '9': `Capestang → Sète: 42.7 miles, 80 ft elevation. Final day to Mediterranean coast. Flat approach through Languedoc wine country. Sète—arrival at salt lagoons and working port—marks Atlantic-to-Mediterranean journey completion.`
  };

  function getWCConfidence(wcType) {
    const typeNorm = (wcType || '').toLowerCase().trim();
    if (typeNorm.includes('public')) return 5;
    if (typeNorm.includes('cafe') || typeNorm.includes('bar')) return 3;
    return 2;
  }

  // ==================================================
  // SECTION: Enrich rides with ALL data including routeStops
  // ==================================================
  const enrichedRides = rides.map((ride) => {
    const rideTimeBase = ride.rideType === 'ride' && ride.miles > 0
      ? ride.miles / 10
      : 0;

    const rideTimeHours = Math.round(rideTimeBase * 2) / 2;

    const dayDurationBase = ride.rideType === 'ride' && ride.miles > 0
      ? rideTimeBase * 1.5
      : 0;

    const dayDurationHours = Math.round(dayDurationBase * 2) / 2;

    let estimatedRideTimeRange = null;
    let estimatedDayDurationRange = null;
    let estimatedFinishTime = null;

    if (ride.rideType === 'ride' && ride.miles > 0) {
      const rideTimeMin = rideTimeBase;
      const rideTimeMax = rideTimeBase + 0.5;
      estimatedRideTimeRange = {
        min: rideTimeMin,
        max: rideTimeMax,
        display: `${rideTimeMin.toFixed(1)} to ${rideTimeMax.toFixed(1)} hours`
      };

      const dayDurationMin = dayDurationBase;
      const dayDurationMax = dayDurationBase + 0.75;
      estimatedDayDurationRange = {
        min: dayDurationMin,
        max: dayDurationMax,
        display: `${dayDurationMin.toFixed(1)} to ${dayDurationMax.toFixed(1)} hours`
      };

      const startHour = 9;
      const startMin = 0;
      const totalMinMin = startHour * 60 + startMin + (dayDurationMin * 60);
      const totalMinMax = startHour * 60 + startMin + (dayDurationMax * 60);

      const finishHourMin = Math.floor(totalMinMin / 60);
      const finishMinMin = Math.round(totalMinMin % 60);
      const finishHourMax = Math.floor(totalMinMax / 60);
      const finishMinMax = Math.round(totalMinMax % 60);

      estimatedFinishTime = {
        min: `${String(finishHourMin).padStart(2, '0')}:${String(finishMinMin).padStart(2, '0')}`,
        max: `${String(finishHourMax).padStart(2, '0')}:${String(finishMinMax).padStart(2, '0')}`,
        display: `${String(finishHourMin).padStart(2, '0')}:${String(finishMinMin).padStart(2, '0')}–${String(finishHourMax).padStart(2, '0')}:${String(finishMinMax).padStart(2, '0')}`
      };
    }

    // CRITICAL: Build route stops for this ride
    const routeStops = buildRouteStops(ride);

    // HARD FAIL: Every ride must have usable planning data
    if (ride.rideType === 'ride') {
      validateHardFail(routeStops.length > 0,
        `NO ROUTE STOPS: Ride ${ride.rideDay} has no stops from required tabs`);
    }

    const towns = [];
    const wcTowns = [];

    return {
      ...ride,
      highlights: highlightsByDay[ride.rideDay] || [],
      lunch: lunchByDay[ride.rideDay] || null,
      routeStops: routeStops, // REQUIRED: First-class data
      pandaImageUrl: pandaAssets[String(ride.tourDayNum)]
        ? `${R2_BASE_URL}/${pandaAssets[String(ride.tourDayNum)]}`
        : null,
      overnightNarrative: narrativeByTown[ride.endTown.trim()] || '',
      towns,
      wcTowns,
      rideTimeHours,
      estimatedRideTimeRange,
      dayDurationHours,
      estimatedDayDurationRange,
      estimatedFinishTime,
      dayShape: DAY_SHAPES[String(ride.tourDayNum)] || null
    };
  });

  const totalMiles = enrichedRides.filter(r => r.rideType === 'ride').reduce((sum, r) => sum + r.miles, 0);
  const totalElevation = enrichedRides.filter(r => r.rideType === 'ride').reduce((sum, r) => sum + r.elevation, 0);

  const rideDates = enrichedRides
    .filter(r => r.date && r.rideType !== 'train')
    .map(r => r.date);
  const derivedStartDate = rideDates[0] || '';
  const derivedEndDate   = rideDates[rideDates.length - 1] || '';

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

// ==================================================
// UTILITY: Deterministic string normalization
// ==================================================
function normalizeString(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .replace(/[^\w\s]/g, ''); // remove non-alphanumeric except spaces
}

validateAndTransform().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
