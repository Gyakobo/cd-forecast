# CD-Forecast (web)

Forecast future consumption of controlled medicines (opioids, psychotropic substances and
precursors) in Nigeria, nationally and by zone, state, facility type and ownership.

© 2026 Andrew Gyakobo & Mawuli Gyakobo. All rights reserved. See [LICENSE.md](LICENSE.md).

## Pages
- **Calculator** — one drug: baseline, INCB check, 15-year forecast (low / mid / high) with chart.
- **All Drugs** — every drug for a selection, with INCB status and a 5-year plan.
- **Compare Surveys** — 2017 vs 2019 survey estimates and implied growth.
- **My Data** — enter or import yearly records (saved in the browser; export to CSV).
- **INCB Allowances** — editable allowances per drug.
- **About** — method, caveats, acknowledgements.

## The formula
```
B    = D × 365 / A                                   (stock-out correction)
Q(t) = [ (1−w)·B + w·N ] · (1+g)^n · (1+buffer) + add-on(t)
```
Same math as the CD-Forecast Excel programme and `cd_forecast.py`.

## Run it
No server or install needed: open `index.html` in a browser.

## Publish on GitHub Pages
1. Create a new repository on GitHub (e.g. `cd-forecast`).
2. Upload all files in this folder (keep the `css/` and `js/` folders).
3. In the repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/cd-forecast/`.

Note: GitHub Pages sites are public, even when the repository is private on paid plans.

## Updating the data
`js/data.js` holds the aggregated survey estimates. It is generated from the survey workbooks;
regenerate it when new survey data is added. Records entered on **My Data** stay in each user's
browser — export them as CSV to keep or share.

## Files
```
index.html      page layout
css/style.css   styling
js/engine.js    forecasting math (no page code)
js/app.js       page logic
js/data.js      aggregated survey estimates, INCB allowances, acknowledgements
```
