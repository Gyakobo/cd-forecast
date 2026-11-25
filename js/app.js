/* CD-Forecast web app · © 2026 Andrew Gyakobo & Mawuli Gyakobo. All rights reserved. */
(function () {
  "use strict";
  const D = window.CD_DATA, E = window.CDEngine, idx = E.makeIndex(D);
  const $ = (id) => document.getElementById(id);
  const drugs = Object.keys(D.categories).sort();
  const states = [...new Set(D.zoneStates.map((p) => p[1]))].sort();
  const zoneOf = Object.fromEntries(D.zoneStates.map(([z, s]) => [s, z]));
  const CATS = ["Opioid medicines", "Psychotropic substances", "Precursors", "Others"];
  const ZONE_LEVEL = "(zone-level)";

  // ---------- storage (per-browser convenience; never required) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  let records = store.get("cdf_records", []);
  let incb = Object.assign({}, D.incb, store.get("cdf_incb", {}));
  let addons = {};

  // ---------- formatting ----------
  function fmt(v, unit) {
    if (v == null || v === "" || !isFinite(v)) return "–";
    const a = Math.abs(v);
    const d = a === 0 ? 0 : a < 1 ? 3 : a < 100 ? 2 : a < 10000 ? 1 : 0;
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + (unit ? " " + unit : "");
  }
  const pct = (v) => (v == null || !isFinite(v) ? "–" : (v * 100).toFixed(1) + "%");
  const times = (v) => (v == null || !isFinite(v) ? "–" : v.toFixed(2) + "×");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const opts = (sel, list, value) => { sel.innerHTML = list.map((v) => `<option${v === value ? " selected" : ""}>${esc(v)}</option>`).join(""); };

  // ---------- controls ----------
  opts($("drug"), drugs, "Morphine");
  opts($("zone"), ["All", ...D.zones], "All");
  opts($("state"), ["All", ...states], "All");
  opts($("facilityType"), ["All", ...D.facilityTypes], "All");
  opts($("rState"), states, "Lagos");
  opts($("rType"), D.facilityTypes, "Secondary");
  opts($("rDrug"), drugs, "Morphine");

  let tab = "calc";
  const num = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };

  function sel() {
    return {
      source: $("source").value, drug: $("drug").value,
      f: { zone: $("zone").value, state: $("state").value, facilityType: $("facilityType").value, ownership: $("ownership").value },
      scenario: Number($("scenario").value), adjusted: $("adjusted").checked,
      recBaseYear: num("recBaseYear"),
      growth: { low: (num("gLow") || 0) / 100, mid: (num("gMid") || 0) / 100, high: (num("gHigh") || 0) / 100 },
      buffer: (num("buffer") || 0) / 100, need: num("need"), needWeight: (num("needW") || 0) / 100,
      yearsAhead: Math.max(1, num("yearsAhead") || 5),
    };
  }

  function syncVisibility(s) {
    const survey = s.source === "2017" || s.source === "2019";
    document.querySelectorAll(".survey-only").forEach((el) => (el.hidden = !survey));
    document.querySelectorAll(".records-only").forEach((el) => (el.hidden = s.source !== "records"));
    document.querySelectorAll(".single-only").forEach((el) => (el.hidden = !(s.source === "single" && tab === "calc")));
    document.querySelectorAll(".calc-only").forEach((el) => (el.hidden = tab !== "calc"));
    document.querySelectorAll(".all-only").forEach((el) => (el.hidden = tab !== "all"));
    const single = s.source === "single" && tab === "calc";
    ["zone", "state", "facilityType", "ownership"].forEach((id) => ($(id).disabled = single));
    $("state").disabled = single || s.source === "2019";
    if (s.source === "2019" && $("state").value !== "All") $("state").value = "All";
    $("selection").hidden = !(tab === "calc" || tab === "all");
  }

  function warning(s) {
    const f = s.f, msgs = [];
    if ((s.source === "2017" || s.source === "2019") && s.scenario === 2 && (f.zone !== "All" || f.state !== "All"))
      msgs.push("The national-average method is national only: set zone and state to All, or switch to the survey's main method.");
    if (f.zone !== "All" && f.state !== "All" && zoneOf[f.state] !== f.zone) msgs.push(`${f.state} is not in the ${f.zone} zone.`);
    if (s.source === "2017" && f.facilityType === "PPMV") msgs.push("The 2017 survey did not cover PPMVs.");
    if (s.source === "records" && !records.length) msgs.push("No records yet: add some on the My Data page.");
    return msgs.join(" ");
  }

  // ---------- baseline for the current selection ----------
  function baseline(s, drug) {
    if (s.source === "2017" || s.source === "2019") {
      const f = s.source === "2019" ? { ...s.f, state: "All" } : s.f;
      const b = E.surveyBaseline(idx, s.source, drug, f, s.scenario, s.adjusted);
      return { ...b, baseYear: D.surveys[s.source].baseYear };
    }
    if (s.source === "records") {
      const by = s.recBaseYear || new Date().getFullYear();
      return { ...E.recordsBaseline(records, drug, s.f, by), baseYear: by };
    }
    const y = num("sYear") || 2026;
    let b = null;
    try { b = E.stockoutAdjusted(num("sKg") || 0, num("sDays")); } catch (e) { b = null; }
    return { byYear: {}, years: [], average: b, trend: null, baseYear: y };
  }
  const isNational = (s) => s.source !== "single" && Object.values(s.f).every((v) => v === "All");

  // ---------- Calculator ----------
  let lastForecast = [];
  function renderCalc(s) {
    const b = baseline(s, s.drug);
    $("tBase").textContent = fmt(b.average);
    $("tBaseSub").textContent = (s.source === "single" ? "stock-out adjusted, " : "") + "base year " + b.baseYear;
    $("tTrend").textContent = pct(b.trend);
    const allow = isNational(s) ? incb[s.drug] : null;
    $("tIncb").textContent = allow != null && allow !== "" ? fmt(Number(allow)) : "–";
    const ratio = allow ? b.average / Number(allow) : null;
    $("tIncbSub").textContent = allow ? `${times(ratio)} · ${E.incbStatus(ratio)}` : isNational(s) ? "no allowance on file" : "national selections only";

    $("yearsTable").innerHTML = b.years.length
      ? `<tr><th>Year</th><th class="n">kg</th></tr>` + b.years.map((y) => `<tr><td>${y}</td><td class="n">${fmt(b.byYear[y])}</td></tr>`).join("") +
        `<tr><td><b>Annual baseline</b></td><td class="n"><b>${fmt(b.average)}</b></td></tr>`
      : `<tr><td>Single figure: ${fmt(num("sKg"))} kg dispensed over ${num("sDays") || 365} days in stock → ${fmt(b.average)} kg/year</td></tr>`;
    const notes = [];
    if (s.source === "2019" && s.drug === "Morphine") notes.push("Caution: one tertiary-hospital record accounts for about half of the 2019 morphine estimate and is under review.");
    if (s.source === "2019") notes.push("2019 survey: estimates scale by geopolitical zone, so the state filter is not available.");
    if (s.source === "records") notes.push(`${b.count || 0} matching record(s).`);
    $("dataNote").textContent = notes.join(" ");

    const base = b.average || 0;
    lastForecast = E.forecast({ base, baseYear: b.baseYear, growth: s.growth, buffer: s.buffer, need: s.need, needWeight: s.needWeight, addons, horizon: 15 });
    $("fcTable").innerHTML =
      `<tr><th>Year</th><th class="n">Add-on (kg)</th><th class="n">Low ${pct(s.growth.low)}</th><th class="n">Mid ${pct(s.growth.mid)}</th><th class="n">High ${pct(s.growth.high)}</th></tr>` +
      lastForecast.map((r) => `<tr><td>${r.year}</td><td class="n"><input type="number" step="any" data-year="${r.year}" value="${addons[r.year] || ""}" placeholder="0"></td>` +
        `<td class="n">${fmt(r.low)}</td><td class="n">${fmt(r.mid)}</td><td class="n">${fmt(r.high)}</td></tr>`).join("");
    drawChart(b, lastForecast);
  }
  $("fcTable").addEventListener("change", (e) => {
    if (!e.target.dataset.year) return;
    const v = e.target.value === "" ? 0 : Number(e.target.value);
    if (v) addons[e.target.dataset.year] = v; else delete addons[e.target.dataset.year];
    render();
  });

  // ---------- chart (inline SVG, hover tooltip) ----------
  function drawChart(b, rows) {
    const W = 680, H = 300, m = { l: 64, r: 70, t: 14, b: 30 };
    const pts = [{ year: b.baseYear, low: b.average || 0, mid: b.average || 0, high: b.average || 0 }, ...rows];
    const xs = pts.map((p) => p.year);
    const ymax = Math.max(...pts.map((p) => p.high), ...pts.map((p) => p.low), 1e-9) * 1.08;
    const ymin = Math.min(0, ...pts.map((p) => p.low));
    const X = (y) => m.l + ((y - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - ymin) / (ymax - ymin || 1)) * (H - m.t - m.b);
    const ticks = niceTicks(ymin, ymax, 5);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Forecast chart, low, mid and high growth">`;
    s += `<g class="grid">` + ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`).join("") + `</g>`;
    s += `<g class="axis">` + ticks.map((t) => `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("");
    s += xs.filter((y, i) => i % 2 === 0).map((y) => `<text x="${X(y)}" y="${H - 10}" text-anchor="middle">${y}</text>`).join("") + `</g>`;
    for (const k of ["high", "mid", "low"]) {
      const d = pts.map((p, i) => (i ? "L" : "M") + X(p.year).toFixed(1) + " " + Y(p[k]).toFixed(1)).join(" ");
      s += `<path d="${d}" fill="none" stroke="var(--${k})" stroke-width="2" stroke-linejoin="round"/>`;
      const last = pts[pts.length - 1];
      s += `<text x="${X(last.year) + 8}" y="${Y(last[k]) + 4}" font-size="12" fill="var(--ink)">${k}</text>`;
    }
    s += `<line id="cx" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>`;
    s += `<g id="dots"></g><rect id="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    $("chart").innerHTML = s;
    const svg = $("chart").querySelector("svg"), hit = $("hit"), cx = $("cx"), dots = $("dots"), tip = $("tip");
    hit.addEventListener("mousemove", (ev) => {
      const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(X(p.year) - sx) < Math.abs(X(best.year) - sx)) best = p;
      cx.setAttribute("x1", X(best.year)); cx.setAttribute("x2", X(best.year)); cx.setAttribute("visibility", "visible");
      dots.innerHTML = ["low", "mid", "high"].map((k) => `<circle cx="${X(best.year)}" cy="${Y(best[k])}" r="4.5" fill="var(--${k})" stroke="#fff" stroke-width="2"/>`).join("");
      tip.innerHTML = `<b>${best.year}${best === pts[0] ? " (baseline)" : ""}</b>` +
        ["high", "mid", "low"].map((k) => `<div><span class="sw" style="background:var(--${k})"></span>${k}: ${fmt(best[k])} kg</div>`).join("");
      tip.hidden = false;
      tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 170) + "px";
      tip.style.top = ev.clientY + 14 + "px";
    });
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cx.setAttribute("visibility", "hidden"); dots.innerHTML = ""; });
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => span / k <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }

  // ---------- All drugs ----------
  let lastAll = [];
  function renderAll(s) {
    const nat = isNational(s), n = s.yearsAhead;
    const rows = drugs.map((d) => {
      const b = baseline(s, d);
      const allow = nat && incb[d] !== "" && incb[d] != null ? Number(incb[d]) : null;
      const ratio = allow ? b.average / allow : null;
      const plan = (g, k) => (b.average || 0) * Math.pow(1 + g, k) * (1 + s.buffer);
      return { drug: d, cat: D.categories[d], b, allow, ratio, status: E.incbStatus(ratio),
               mids: [1, 2, 3, 4, 5].map((k) => plan(s.growth.mid, k)),
               lmh: ["low", "mid", "high"].map((k) => plan(s.growth[k], n)) };
    }).filter((r) => $("showEmpty").checked || r.b.average > 0);
    lastAll = rows;
    const yrs = rows[0] ? rows[0].b.years : [];
    const by = rows[0] ? rows[0].b.baseYear : 0;
    let h = `<tr><th>Drug</th>${yrs.map((y) => `<th class="n">${y}</th>`).join("")}<th class="n">Baseline</th><th class="n">Trend</th>` +
      `<th class="n">INCB</th><th class="n">÷ INCB</th><th>Status</th>${[1, 2, 3, 4, 5].map((k) => `<th class="n">${by + k} mid</th>`).join("")}` +
      `<th class="n">${by + n} low</th><th class="n">${by + n} mid</th><th class="n">${by + n} high</th></tr>`;
    for (const c of CATS) {
      const rs = rows.filter((r) => r.cat === c);
      if (!rs.length) continue;
      h += `<tr class="cat"><td colspan="${13 + yrs.length}">${c}</td></tr>`;
      h += rs.map((r) => `<tr><td>${esc(r.drug)}</td>${yrs.map((y) => `<td class="n">${fmt(r.b.byYear[y])}</td>`).join("")}` +
        `<td class="n"><b>${fmt(r.b.average)}</b></td><td class="n">${pct(r.b.trend)}</td><td class="n">${fmt(r.allow)}</td>` +
        `<td class="n">${times(r.ratio)}</td><td class="${r.status === "Use above allowance" ? "st-above" : r.status === "Allowance above use" ? "st-below" : ""}">${r.status}</td>` +
        r.mids.map((v) => `<td class="n">${fmt(v)}</td>`).join("") + r.lmh.map((v) => `<td class="n">${fmt(v)}</td>`).join("") + `</tr>`).join("");
    }
    $("allTable").innerHTML = h;
  }

  // ---------- Compare surveys ----------
  let lastCmp = [];
  function renderCompare() {
    const sc = Number($("cScenario").value), adj = $("cAdjusted").checked, ex = $("cExPPMV").checked;
    lastCmp = drugs.map((d) => ({ drug: d, cat: D.categories[d], ...E.compareSurveys(idx, d, sc, adj, ex) }))
      .filter((r) => r.a.average > 0 || r.b.average > 0);
    let h = `<tr><th>Drug</th><th class="n">2017 survey (kg/yr, ≈2015)</th><th class="n">2019 survey (kg/yr, ≈2017)</th><th class="n">Change</th><th class="n">Implied growth / yr</th><th class="n">2016 per 2017 survey</th><th class="n">2016 per 2019 survey</th></tr>`;
    for (const c of CATS) {
      const rs = lastCmp.filter((r) => r.cat === c);
      if (!rs.length) continue;
      h += `<tr class="cat"><td colspan="7">${c}</td></tr>` + rs.map((r) => `<tr><td>${esc(r.drug)}</td><td class="n">${fmt(r.a.average)}</td><td class="n">${fmt(r.b.average)}</td>` +
        `<td class="n">${times(r.ratio)}</td><td class="n">${pct(r.growth)}</td><td class="n">${fmt(r.a.byYear[2016])}</td><td class="n">${fmt(r.b.byYear[2016])}</td></tr>`).join("");
    }
    $("cmpTable").innerHTML = h;
  }

  // ---------- My data ----------
  const REC_COLS = ["year", "state", "facility_type", "ownership", "drug", "kg_dispensed", "days_in_stock", "facilities_represented"];
  function renderRecords() {
    $("recCount").textContent = records.length;
    $("recTable").innerHTML = `<tr><th>Year</th><th>State</th><th>Zone</th><th>Facility type</th><th>Ownership</th><th>Drug</th><th class="n">kg dispensed</th><th class="n">Days in stock</th><th class="n">Facilities</th><th class="n">Adjusted kg/yr</th><th></th></tr>` +
      records.map((r, i) => {
        let adj = "–"; try { adj = fmt(E.recordAdjustedKg(r)); } catch (e) { adj = "invalid days"; }
        return `<tr><td>${r.year}</td><td>${esc(r.state)}</td><td>${esc(r.zone || "")}</td><td>${esc(r.facilityType)}</td><td>${esc(r.ownership)}</td><td>${esc(r.drug)}</td>` +
          `<td class="n">${fmt(Number(r.kg))}</td><td class="n">${r.days || 365}</td><td class="n">${r.facilities || 1}</td><td class="n">${adj}</td><td><button class="link" data-del="${i}">Delete</button></td></tr>`;
      }).join("");
  }
  function saveRecords() { store.set("cdf_records", records); renderRecords(); render(); }
  $("recForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    records.push({ year: Number(f.year), state: f.state, zone: zoneOf[f.state] || "", facilityType: f.facilityType, ownership: f.ownership,
                   drug: f.drug, kg: Number(f.kg), days: f.days === "" ? "" : Number(f.days), facilities: f.facilities === "" ? "" : Number(f.facilities) });
    e.target.kg.value = ""; e.target.days.value = ""; e.target.facilities.value = "";
    saveRecords();
  });
  $("recTable").addEventListener("click", (e) => { if (e.target.dataset.del != null) { records.splice(Number(e.target.dataset.del), 1); saveRecords(); } });
  $("recClear").addEventListener("click", () => { if (records.length && confirm("Delete all records saved in this browser?")) { records = []; saveRecords(); } });
  $("recExport").addEventListener("click", () => download("cd-forecast-records.csv", [REC_COLS, ...records.map((r) => [r.year, r.state, r.facilityType, r.ownership, r.drug, r.kg, r.days, r.facilities])]));
  $("recTemplate").addEventListener("click", () => download("cd-forecast-template.csv", [REC_COLS, [2026, "Lagos", "Secondary", "Public", "Morphine", 2.0, 305, 1]]));
  $("recImport").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then((txt) => {
      const rows = parseCSV(txt), head = rows.shift().map((h) => h.trim().toLowerCase());
      const ix = Object.fromEntries(REC_COLS.map((c) => [c, head.indexOf(c)]));
      if (ix.drug < 0 || ix.kg_dispensed < 0 || ix.year < 0) { alert("CSV needs at least: year, drug, kg_dispensed (use the template)."); return; }
      let added = 0, skipped = 0;
      for (const r of rows) {
        if (!r.length || r.every((v) => v.trim() === "")) continue;
        const g = (c) => (ix[c] >= 0 ? (r[ix[c]] || "").trim() : "");
        const rec = { year: Number(g("year")), state: g("state"), zone: zoneOf[g("state")] || "", facilityType: g("facility_type"),
                      ownership: g("ownership"), drug: g("drug"), kg: Number(g("kg_dispensed")),
                      days: g("days_in_stock") === "" ? "" : Number(g("days_in_stock")), facilities: g("facilities_represented") === "" ? "" : Number(g("facilities_represented")) };
        if (!rec.year || !rec.drug || !isFinite(rec.kg)) { skipped++; continue; }
        records.push(rec); added++;
      }
      saveRecords(); e.target.value = "";
      alert(`Imported ${added} record(s)` + (skipped ? `, skipped ${skipped} incomplete row(s).` : "."));
    });
  });

  // ---------- INCB ----------
  function renderIncb() {
    $("incbTable").innerHTML = `<tr><th>Drug</th><th>Category</th><th class="n">Allowance (kg)</th></tr>` +
      drugs.map((d) => `<tr><td>${esc(d)}</td><td>${esc(D.categories[d])}</td><td class="n"><input type="number" step="any" min="0" data-incb="${esc(d)}" value="${incb[d] ?? ""}"></td></tr>`).join("");
  }
  $("incbTable").addEventListener("change", (e) => {
    const d = e.target.dataset.incb; if (!d) return;
    incb[d] = e.target.value === "" ? "" : Number(e.target.value);
    store.set("cdf_incb", incb); render();
  });
  $("incbReset").addEventListener("click", () => { incb = Object.assign({}, D.incb); store.set("cdf_incb", {}); renderIncb(); render(); });

  // ---------- About ----------
  $("ackTable").innerHTML = `<tr><th>#</th><th>Name</th><th>Affiliation</th></tr>` +
    D.acknowledgements.map(([n, a], i) => `<tr><td>${i + 1}</td><td>${esc(n)}</td><td style="white-space:normal">${esc(a)}</td></tr>`).join("");

  // ---------- CSV helpers ----------
  function download(name, rows) {
    const csv = rows.map((r) => r.map((v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function parseCSV(t) {
    const out = []; let row = [], cur = "", q = false;
    t = t.replace(/^﻿/, "");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cur); out.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); out.push(row); }
    return out;
  }
  const r2 = (v) => (v == null || !isFinite(v) ? "" : +v.toFixed(4));
  $("dlCalc").addEventListener("click", () => {
    const s = sel();
    download(`cd-forecast-${s.drug}.csv`, [["year", "addon_kg", "low_kg", "mid_kg", "high_kg"], ...lastForecast.map((r) => [r.year, r.addon, r2(r.low), r2(r.mid), r2(r.high)])]);
  });
  $("dlAll").addEventListener("click", () => {
    const yrs = lastAll[0] ? lastAll[0].b.years : [];
    download("cd-forecast-all-drugs.csv", [["drug", "category", ...yrs.map((y) => "est_" + y), "baseline_kg", "incb_kg", "ratio", "status", "plan_mid_+1", "+2", "+3", "+4", "+5", "low_+N", "mid_+N", "high_+N"],
      ...lastAll.map((r) => [r.drug, r.cat, ...yrs.map((y) => r2(r.b.byYear[y])), r2(r.b.average), r.allow ?? "", r2(r.ratio), r.status, ...r.mids.map(r2), ...r.lmh.map(r2)])]);
  });

  // ---------- wiring ----------
  function render() {
    const s = sel();
    syncVisibility(s);
    const w = warning(s);
    $("warning").hidden = !w; $("warning").textContent = w;
    if (tab === "calc") renderCalc(s);
    if (tab === "all") renderAll(s);
    if (tab === "compare") renderCompare();
  }
  $("tabs").addEventListener("click", (e) => {
    const t = e.target.dataset.tab; if (!t) return;
    tab = t;
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    document.querySelectorAll(".tab").forEach((el) => (el.hidden = el.id !== "tab-" + t));
    if (t === "records") renderRecords();
    if (t === "incb") renderIncb();
    render();
  });
  $("selection").addEventListener("input", render);
  $("selection").addEventListener("change", render);
  ["showEmpty"].forEach((id) => $(id).addEventListener("change", render));
  ["cScenario", "cAdjusted", "cExPPMV"].forEach((id) => $(id).addEventListener("change", render));
  $("drug").addEventListener("change", () => { addons = {}; });
  render();
})();
