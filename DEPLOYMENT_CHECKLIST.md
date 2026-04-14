# Deployment Checklist

## Pre-Deployment

- [ ] All Astro pages created and tested locally
- [ ] .env file created with all required variables filled in
- [ ] npm install completed
- [ ] npm run build succeeds locally
- [ ] npm run preview works at http://localhost:3000
- [ ] validate-and-transform.js runs without errors
- [ ] src/data/tour-data.json generated and contains expected data

## GitHub Setup

- [ ] Git repo initialized and committed
- [ ] Repo pushed to GitHub (github.com/jkbrooks1/cdm-biketourfrance)

## GitHub Actions Secrets

Add these 11 secrets to GitHub repo (Settings → Secrets and variables → Actions):

- [ ] TOUR_SHEETS_ID
- [ ] GOOGLE_SERVICE_ACCOUNT_KEY
- [ ] TOUR_NAME
- [ ] TOUR_SLUG
- [ ] TOUR_START_DATE
- [ ] TOUR_END_DATE
- [ ] TOUR_DESCRIPTION
- [ ] R2_BASE_URL
- [ ] CLOUDFLARE_API_TOKEN
- [ ] CLOUDFLARE_ACCOUNT_ID
- [ ] CLOUDFLARE_PROJECT_NAME

## Cloudflare Pages

- [ ] Project created (cdm-biketourfrance)
- [ ] Build command set to: npm run build
- [ ] Output directory set to: dist
- [ ] First build attempted (will succeed once secrets are in place)

## Testing

- [ ] Trigger workflow manually from GitHub Actions tab
- [ ] Verify build succeeds in GitHub Actions logs
- [ ] Visit cdm-biketourfrance.pages.dev
- [ ] Verify landing page displays
- [ ] Verify ride day pages are accessible (/1, /2, etc.)
- [ ] Verify logistics page loads
- [ ] Verify contact page loads
- [ ] Verify images load from R2
- [ ] Verify navigation works

## Post-Deployment

- [ ] Site live and accessible
- [ ] Daily schedule working (check back tomorrow)
- [ ] Manual trigger tested
- [ ] Ready for custom domain setup (optional, separate process)

## Troubleshooting

If build fails:
- Check GitHub Actions logs for error message
- Verify all secrets are set correctly
- Verify Sheets tabs exist and have correct names
- Verify service account key is base64-encoded correctly
- Run npm run build locally to test

If site doesn't show pages:
- Verify tour-data.json generated correctly
- Check Ride_Days_Master tab has data rows
- Check tab names match exactly (case-sensitive)

If images missing:
- Verify R2_BASE_URL in secrets
- Verify panda filenames in Media_Manifest match exactly
- Verify files exist in R2 bucket
