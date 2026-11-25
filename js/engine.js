/*
 * CD-Forecast engine — the forecasting math, independent of the page.
 * © 2026 Andrew Gyakobo & Mawuli Gyakobo. All rights reserved.
 *
 *   1. Stock-out correction   B    = D × 365 / A
 *   2. Need-based blend       M    = (1 − w)·B + w·N
 *   3. Growth                 M · (1 + g)^n
 *   4. Required quantity      Q(t) = M · (1 + g)^n · (1 + buffer) + addon(t)
 *
 * Same math as cd_forecast.py and the CD-Forecast Excel programme.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CDEngine = factory();
})(this, function () {
  "use strict";
  const DAYS = 365;

  // ---------- the formula ----------
  function stockoutAdjusted(dispensed, daysAvailable) {
    const a = daysAvailable == null || daysAvailable === "" ? DAYS : Number(daysAvailable);
    if (!(a > 0 && a <= DAYS)) throw new Error("Days in stock must be between 1 and 365");
    return Number(dispensed) * DAYS / a;
  }

  /**
   * opts: {base, baseYear, growth:{low,mid,high}, buffer, need, needWeight, addons:{year:kg}, horizon}
   * returns [{year, n, addon, low, mid, high}]
   */
  function forecast(opts) {
    const w = opts.need != null && opts.need !== "" && isFinite(opts.need) ? (opts.needWeight || 0) : 0;
    const N = w ? Number(opts.need) : 0;
    const start = (1 - w) * opts.base + w * N;
    const out = [];
    for (let n = 1; n <= (opts.horizon || 15); n++) {
      const year = opts.baseYear + n;
      const addon = Number((opts.addons || {})[year] || 0);
      const row = { year, n, addon };
      for (const k of ["low", "mid", "high"]) {
        row[k] = start * Math.pow(1 + opts.growth[k], n) * (1 + opts.buffer) + addon;
      }
      out.push(row);
    }
    return out;
  }

  function trend(first, last, years) {
    return first > 0 && last > 0 ? Math.pow(last / first, 1 / years) - 1 : null;
  }

  // ---------- survey data ----------
  function makeIndex(D) {
    const c = Object.fromEntries(D.cols.map((k, i) => [k, i]));
    const byDrug = {};
    for (const r of D.rows) {
      const key = r[c.survey] + "|" + r[c.drug];
      (byDrug[key] = byDrug[key] || []).push(r);
    }
    return { D, c, byDrug };
  }

  const matches = (v, f) => f == null || f === "All" || v === f;

  /**
   * f: {zone, state, facilityType, ownership}; scenario 1|2; adjusted bool
   * returns {byYear:{year:kg}, years:[...], average, trend}
   */
  function surveyBaseline(idx, survey, drug, f, scenario, adjusted) {
    const { D, c, byDrug } = idx;
    const p = "s" + scenario, sfx = adjusted ? "" : "_raw";
    const cy = c[p + "_year" + sfx], cp = c[p + "_pooled" + sfx];
    const years = D.surveys[survey].years;
    const byYear = Object.fromEntries(years.map((y) => [y, 0]));
    let average = 0;
    for (const r of byDrug[survey + "|" + drug] || []) {
      if (!matches(r[c.zone], f.zone) || !matches(r[c.state], f.state) ||
          !matches(r[c.facility_type], f.facilityType) || !matches(r[c.ownership], f.ownership)) continue;
      if (r[c.year] in byYear) byYear[r[c.year]] += r[cy];
      average += r[cp];
    }
    return { byYear, years, average, trend: trend(byYear[years[0]], byYear[years[2]], 2) };
  }

  /** records: [{year,state,zone,facilityType,ownership,drug,kg,days,facilities}] */
  function recordAdjustedKg(r) {
    if (r.kg === "" || r.kg == null || !r.drug) return 0;
    const fac = r.facilities === "" || r.facilities == null ? 1 : Number(r.facilities);
    return stockoutAdjusted(r.kg, r.days) * fac;
  }

  function recordsBaseline(records, drug, f, baseYear) {
    const years = [baseYear - 2, baseYear - 1, baseYear];
    const byYear = Object.fromEntries(years.map((y) => [y, 0]));
    let count = 0;
    for (const r of records) {
      if (r.drug !== drug || !matches(r.zone, f.zone) || !matches(r.state, f.state) ||
          !matches(r.facilityType, f.facilityType) || !matches(r.ownership, f.ownership)) continue;
      const y = Number(r.year);
      if (y in byYear) { byYear[y] += recordAdjustedKg(r); count++; }
    }
    return { byYear, years, average: byYear[baseYear], trend: trend(byYear[years[0]], byYear[years[2]], 2), count };
  }

  /** National estimates from both surveys + implied yearly growth (estimates centred 2015 and 2017). */
  function compareSurveys(idx, drug, scenario, adjusted, excludePPMV) {
    const all = { zone: "All", state: "All", facilityType: "All", ownership: "All" };
    const a = surveyBaseline(idx, "2017", drug, all, scenario, adjusted);
    let b = surveyBaseline(idx, "2019", drug, all, scenario, adjusted);
    if (excludePPMV) {
      const p = surveyBaseline(idx, "2019", drug, { ...all, facilityType: "PPMV" }, scenario, adjusted);
      b = { ...b, average: b.average - p.average,
            byYear: Object.fromEntries(Object.entries(b.byYear).map(([y, v]) => [y, v - p.byYear[y]])) };
    }
    const growth = a.average > 0 && b.average > 0 ? Math.pow(b.average / a.average, 1 / 2) - 1 : null;
    return { a, b, ratio: a.average > 0 ? b.average / a.average : null, growth };
  }

  function incbStatus(ratio) {
    if (ratio == null || !isFinite(ratio)) return "";
    return ratio > 1.1 ? "Use above allowance" : ratio < 0.9 ? "Allowance above use" : "Close match";
  }

  return { stockoutAdjusted, forecast, trend, makeIndex, surveyBaseline, recordsBaseline,
           recordAdjustedKg, compareSurveys, incbStatus };
});
