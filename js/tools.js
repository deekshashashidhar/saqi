'use strict';
/* Saqi tools: water mix, sensor check, drip health, crop planner, date harvest, water sharing, adviser triage. */

/* ---------- small SVG chart ---------- */
function svgChart(series, { w = 520, h = 220, xlab = '', ylab = '', marker = null, shade = null, xfmt = v => fmt(v) } = {}) {
  const all = series.flatMap(s => s.pts);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys, 0), y1 = Math.max(...ys, 0);
  if (y1 === y0) y1 = y0 + 1;
  const pad = (y1 - y0) * 0.08; y1 += pad; if (y0 < 0) y0 -= pad;
  const L = 52, R = 12, T = 28, B = 36;
  const X = x => L + (x - x0) / ((x1 - x0) || 1) * (w - L - R);
  const Y = y => T + (y1 - y) / (y1 - y0) * (h - T - B);
  let g = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="max-width:${w}px">`;
  if (shade) g += `<rect x="${X(shade[0])}" y="${T}" width="${Math.max(0, X(shade[1]) - X(shade[0]))}" height="${h - T - B}" fill="var(--chart-shade)"/>`;
  for (let i = 0; i <= 4; i++) {
    const yv = y0 + (y1 - y0) * i / 4;
    g += `<line x1="${L}" x2="${w - R}" y1="${Y(yv)}" y2="${Y(yv)}" stroke="var(--chart-grid)"/><text x="${L - 5}" y="${Y(yv) + 4}" font-size="10" text-anchor="end" fill="var(--chart-axis)">${fmt(yv)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const xv = x0 + (x1 - x0) * i / 4;
    g += `<text x="${X(xv)}" y="${h - B + 14}" font-size="10" text-anchor="middle" fill="var(--chart-axis)">${xfmt(xv)}</text>`;
  }
  if (y0 < 0) g += `<line x1="${L}" x2="${w - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--chart-axis)" stroke-dasharray="3 3"/>`;
  series.forEach(s => {
    g += `<polyline fill="none" stroke="${s.color}" stroke-width="2.4" points="${s.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/>`;
  });
  if (marker) g += `<line x1="${X(marker[0])}" x2="${X(marker[0])}" y1="${T}" y2="${h - B}" stroke="var(--chart-profit)" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="${X(marker[0])}" cy="${Y(marker[1])}" r="5" fill="var(--chart-profit)"/>`;
  g += `<text x="${(L + w - R) / 2}" y="${h - 4}" font-size="11" text-anchor="middle" fill="var(--chart-text)">${xlab}</text>`;
  g += `<text x="12" y="${(T + h - B) / 2}" font-size="11" text-anchor="middle" fill="var(--chart-text)" transform="rotate(-90 12 ${(T + h - B) / 2})">${ylab}</text>`;
  g += series.map((s, i) => `<g transform="translate(${L + i * 155},6)"><rect width="12" height="4" y="4" rx="2" fill="${s.color}"/><text x="16" y="10" font-size="10" fill="var(--chart-text)">${s.label}</text></g>`).join('');
  return g + '</svg>';
}

/* ---------- Water mix ---------- */
function renderBlend() {
  const s = state.blend, sel = $('#blBlock');
  sel.innerHTML = state.blocks.map((b, i) => `<option value="${i}">${i + 1}. ${esc(b.name)} (${CROPS[b.crop].name})</option>`).join('');
  sel.value = s.block;
  const r = results[s.block];
  if (!r) { $('#blendOut').innerHTML = '<p class="muted">Add a block first.</p>'; return; }
  const rev = weeklyRevenue(r.crop, r.b.area, 1);
  const drainage = state.drainage || 'good';
  const o = Engine.optimiseBlend({ netMm: r.today.netNeed, area: r.b.area, Ea: r.today.Ea, crop: r.crop, A: s.a, B: s.b, dailyRevenue: rev, drainage });
  const b = o.best;
  const rowOf = (label, p, hl) => `<tr class="${hl ? 'hl' : ''}"><td>${label}</td><td class="num">${fmt(p.ecw, 1)}</td><td class="num">${fmt(p.V, 1)}</td><td class="num">${fmt(p.cost)}</td><td class="num">${pct(p.y)}</td><td class="num"><b>${fmt(p.profit)}</b></td><td>${p.feasible ? (p.capped ? '<span class="tag amber">drain cap</span>' : '') : '<span class="tag red">well too small</span>'}</td></tr>`;
  const firstInfeasible = o.curve.find(p => !p.feasible);
  $('#blendOut').innerHTML = `<h3>Best mix for today</h3>
    <div class="verdict">${pct(1 - b.f)} ${esc(s.a.name)} + ${pct(b.f)} ${esc(s.b.name)}</div>
    <div>${fmt(b.vA, 1)} m³ of A + ${fmt(b.vB, 1)} m³ of B → mixed EC <b>${fmt(b.ecw, 1)} dS/m</b>, salt flush ${pct(b.LR)}, expected yield ${pct(b.y)}.</div>
    ${b.capped ? `<div class="alert amber" style="margin-top:.55rem"><b>Drainage ceiling reached (${drainage}, max LF ${pct(o.drainCap)}):</b> blending more salty water increases root-zone ECe rather than flushing safely.</div>` : ''}
    <div class="tablewrap" style="margin:.6rem 0"><table><tr><th>Option</th><th class="num">EC</th><th class="num">m³/day</th><th class="num">Water AED</th><th class="num">Yield</th><th class="num">Profit AED/day</th><th></th></tr>
    ${rowOf('Only ' + esc(s.a.name), o.freshOnly)}${rowOf('Only ' + esc(s.b.name), o.wellOnly)}${rowOf('<b>Saqi mix</b>', b, true)}</table></div>
    <p>Compared with fresh water only: <b class="good">${fmt(b.profit - o.freshOnly.profit)} AED/day</b> (≈ ${fmt((b.profit - o.freshOnly.profit) * 30)} AED/month) and <b>${fmt(o.freshOnly.vA - b.vA, 1)} m³/day</b> less desalinated water.</p>
    ${svgChart([{ pts: o.curve.map(p => [p.f * 100, p.profit]), color: 'var(--chart-profit)', label: 'Profit AED/day' }, { pts: o.curve.map(p => [p.f * 100, p.cost]), color: 'var(--chart-cost)', label: 'Water cost AED/day' }],
      { xlab: '% of ' + esc(s.b.name) + ' in the mix', ylab: 'AED / day', marker: [b.f * 100, b.profit], shade: firstInfeasible ? [firstInfeasible.f * 100, 100] : null })}
    <p class="muted">Crop need today: ${fmt(r.today.netNeed, 1)} mm. More salty water is cheaper, but it needs more flushing water and costs yield once it passes the crop's limit. Red zone = beyond what the well can supply.</p>`;
}

/* ---------- Sensor check ---------- */
/* Modeled root-zone ECe: Saqi's daily salt balance after 30 days of the farmer's fixed habit
 * (same transient model as the 60-day forecast; avoids the unrealistic instant steady state). */
const SENSOR_MODEL_DAY = 30;
function modeledSoilECeFor(r) {
  const pts = r?.salt?.habit?.series;
  return pts && pts.length ? pts[Math.min(SENSOR_MODEL_DAY, pts.length) - 1].ece : null;
}
function renderSensor() {
  const s = state.sensor, soil = SOILS[s.soil] || SOILS.sand;
  const sel = $('#snSoil'); if (!sel.options.length) sel.innerHTML = Object.entries(SOILS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  if (!(+s.block < state.blocks.length)) s.block = 0;
  const bsel = $('#snBlock');
  if (bsel) { bsel.innerHTML = state.blocks.map((b, i) => `<option value="${i}">Valve ${i + 1} · ${esc(b.name)}</option>`).join(''); bsel.value = String(+s.block || 0); }
  const measured = s.eceSource === 'measured';
  const r = results[+s.block || 0];
  const modeledEce = modeledSoilECeFor(r);
  const ece = measured ? (+s.ece || 0) : (modeledEce ?? 0);
  if ($('#snEceField')) $('#snEceField').hidden = !measured;
  if ($('#snFlushRow')) $('#snFlushRow').hidden = !measured; // only a measured reading may change tonight's flush
  if (!measured && $('#calEce') && document.activeElement !== $('#calEce')) $('#calEce').value = (+ece).toFixed(1);
  const app = +s.reading, bias = s.k * ece * app / 10, tru = Math.max(0, app - bias);
  const refill = soil.fc - 0.5 * (soil.fc - soil.wp);
  const dec = v => v < refill ? { t: 'IRRIGATE NOW', c: 'bad' } : v > soil.fc ? { t: 'Too wet: skip', c: 'warn' } : { t: 'Wait', c: 'good' };
  const da = dec(app), dt = dec(tru);
  const mm = Math.max(0, (soil.fc - tru) / 100 * s.depth * 10);
  const scale = soil.fc * 1.6, P = v => Math.min(100, v / scale * 100);
  const gauge = (v, color) => `<div style="position:relative;height:22px;background:linear-gradient(90deg,rgba(220,76,62,0.45) 0 ${P(soil.wp)}%,rgba(232,185,78,0.42) ${P(soil.wp)}% ${P(refill)}%,rgba(102,194,142,0.42) ${P(refill)}% ${P(soil.fc)}%,rgba(152,207,240,0.42) ${P(soil.fc)}%);border-radius:8px">
    <div style="position:absolute;left:calc(${P(v)}% - 2px);top:-3px;width:4px;height:28px;background:${color};border-radius:2px"></div></div>`;
  const eceLine = measured
    ? `<div class="alert blue"><span class="alert-body">Soil salinity: <b>${fmt(ece, 1)} dS/m</b>, <b>measured</b>.${modeledEce != null ? ` For comparison, Saqi's model for ${esc(r.b.name)} gives ${fmt(modeledEce, 1)} dS/m.` : ''}</span></div>`
    : `<div class="alert blue"><span class="alert-body">Soil salinity: <b>${fmt(ece, 1)} dS/m</b>, <b>modeled</b>: where ${r ? esc(r.b.name) : 'this block'}'s root zone is after ${SENSOR_MODEL_DAY} days of the fixed ${r ? r.b.habitMin + '-minute ' : ''}habit with ${fmt(+state.water.ec, 1)} dS/m water (Saqi's daily salt balance, from an <b>assumed</b> start of ${r ? fmt(r.salt.startECe, 1) : '–'} dS/m). No soil probe needed. Switch to "Measured" if you have a reading.</span></div>`;
  $('#sensorOut').innerHTML = eceLine + `
    <div class="grid g2">
      <div><div class="muted">Sensor says</div><div class="big" style="color:var(--muted-foreground)">${fmt(app, 1)}%</div><div class="${da.c}"><b>${da.t}</b></div></div>
      <div><div class="muted">Salt-corrected</div><div class="big">${fmt(tru, 1)}%</div><div class="${dt.c}"><b>${dt.t}</b></div></div>
    </div>
    <div style="margin:.8rem 0">${gauge(app, 'var(--muted-foreground)')}<div style="height:6px"></div>${gauge(tru, 'var(--water)')}
    <div class="muted" style="display:flex;justify-content:space-between"><span>dry (wilting ${soil.wp}%)</span><span>refill ${fmt(refill, 0)}%</span><span>full (field capacity ${soil.fc}%)</span></div></div>
    ${dt.c === 'bad' && da.c !== 'bad'
      ? `<div class="alert red"><span class="alert-body">⚠ <b>Salt is fooling the sensor.</b> It reads ${fmt(bias, 1)} points too wet, so the grower would wait while the roots are already below the refill point (${fmt(refill, 1)}%).</span></div>`
      : da.t !== dt.t
        ? `<div class="alert amber"><span class="alert-body">⚠ <b>Salt is fooling the sensor.</b> It reads ${fmt(bias, 1)} points too wet, making the soil look over-saturated when it is actually only ${fmt(tru - refill, 1)} points above the refill point.</span></div>`
        : `<div class="alert green"><span class="alert-body">The sensor's decision is right here. The salt error (${fmt(bias, 1)} points) does not change it.</span></div>`}
    ${tru < soil.fc ? `<p>To refill ${s.depth} cm of root zone: <b>${fmt(mm, 1)} mm = ${fmt(mm, 1)} litres per m²</b> (before salt flush and system losses).</p>` : ''}
    ${state.drainage === 'poor' ? `<div class="alert amber"><span class="alert-body">⚠ <b>Poor drainage warning:</b> Excess leaching water cannot drain below roots here; avoid aggressive flushing until subsurface drainage improves.</span></div>` : ''}
    <p class="muted"><b>How the correction works:</b> salt makes soil water conduct electricity, and cheap capacitive sensors mistake that for extra water. The saltier and wetter the soil, the bigger the error, so Saqi subtracts k × soil ECe × reading ÷ 10. k = ${fmt(s.k, 2)} is ${+s.k === 0.35 ? 'an <b>assumed</b> default' : 'calibrated for this farm'}; one oven-dried soil sample (below) sets it for your sensor. Sandy soil holds only about ${soil.fc - soil.wp} points of usable water, so a 2–3 point error is a big part of the plant's reserve.</p>
    <p class="muted"><b>How this relates to Today:</b> Today's runtimes come from weather, crop and water salt. This page is a field cross-check: if the corrected reading says "Irrigate now" before tonight's slot, the root zone is drier than planned. Give a short refill (amount above) and check the drip lines.</p>`;
}

/* ---------- Drip health ---------- */
function renderDrip() {
  $('#dripCards').innerHTML = state.blocks.map((b, i) => {
    const flow = Engine.resolveBlockFlow(b);
    const log = state.flowLog[i] || []; const f = Engine.flowCheck(log, flow);
    const ratios = log.map(p => p.flow / (flow || 1));
    const w = 320, h = 90, X = j => 8 + j / Math.max(1, ratios.length - 1) * (w - 16), Y = v => h - 8 - (Math.min(1.4, Math.max(0.5, v)) - 0.5) / 0.9 * (h - 16);
    const spark = `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px"><rect x="8" y="${Y(1.12)}" width="${w - 16}" height="${Y(0.88) - Y(1.12)}" fill="rgba(102,194,142,0.18)" rx="4"/>
      <line x1="8" x2="${w - 8}" y1="${Y(1)}" y2="${Y(1)}" stroke="var(--good)" stroke-dasharray="3 3"/>
      <polyline fill="none" stroke="${f.status === 'ok' ? 'var(--water)' : 'var(--destructive)'}" stroke-width="2.2" points="${ratios.map((v, j) => X(j) + ',' + Y(v)).join(' ')}"/>
      ${ratios.map((v, j) => `<circle cx="${X(j)}" cy="${Y(v)}" r="2.5" fill="${v < 0.88 || v > 1.12 ? 'var(--destructive)' : 'var(--water)'}"/>`).join('')}</svg>`;
    const r = results[i]; const mins = (r && r.today.minutes != null) ? r.today.minutes : b.habitMin;
    let msg = '<span class="tag green">Healthy</span> Flow within ±12% of design.';
    if (f.status === 'clog') msg = `<span class="tag red">Clogging</span> Delivering ${pct(f.ratio)} of design flow, so plants get ≈ <b>${fmt((1 - f.ratio) * (r ? r.today.m3 : 0), 1)} m³ less</b> than planned today. Flush the laterals and acid-clean the emitters (salt and lime scale). Do <b>not</b> just run longer: the blocked drippers stay dry while the open ones get too much.`;
    if (f.status === 'leak') msg = `<span class="tag red">Leak / burst</span> Flow is ${pct(f.ratio)} of design: ≈ <b>${fmt((f.ratio - 1) * flow * mins / 60, 1)} m³ lost</b> per irrigation. Walk the line and look for a burst lateral, a missing end cap or a broken fitting.`;
    return `<div class="card"><div class="row" style="justify-content:space-between"><h3>Valve ${i + 1} · ${esc(b.name)}</h3><span class="muted">block flow ${fmt(flow, 1)} m³/h</span></div>
      ${spark}<div class="muted">Last 14 days, measured ÷ design flow (green band = normal)</div><p>${msg}</p>
      <div class="row"><input type="number" step="0.1" placeholder="Today's flow m³/h" data-flowin="${i}" style="max-width:180px"><button class="btn sm" data-flowbtn="${i}">Log reading</button></div></div>`;
  }).join('');
  $$('[data-flowbtn]').forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.flowbtn, v = +$(`[data-flowin="${i}"]`).value;
    if (!(v > 0)) { toast('Enter the flow in m³/h (meter reading ÷ pump hours)'); return; }
    const log = state.flowLog[i] || (state.flowLog[i] = []); const today = isoDaysAgo(0);
    const last = log[log.length - 1];
    if (last && last.date === today) last.flow = v; else log.push({ date: today, flow: v });
    while (log.length > 30) log.shift();
    save(); renderAll(); toast('Reading saved');
  });
}

/* ---------- Crop suitability estimate (modeled root-zone salinity) ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SUIT_RANK = { Good: 2, Marginal: 1, Poor: 0 };
const waterDiff = (cur, best) => {
  const d = cur.sp.totM3 - best.sp.totM3;
  return d >= 0 ? `while using <b>${fmt(d)} m³/ha less water</b> (${pct(cur.sp.totM3 > 0 ? d / cur.sp.totM3 : 0)} less)` : `but needs ${fmt(-d)} m³/ha more water`;
};
function renderPlanner() {
  const p = state.planner;
  const drainage = state.drainage || 'good';
  const plDr = $('#plDrainage'); if (plDr && !plDr.options.length) plDr.innerHTML = Object.entries(DRAINAGE).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  const ss = $('#plSystem'); if (!ss.options.length) ss.innerHTML = Object.entries(SYSTEMS).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  const sc = $('#plCurrent'); if (!sc.options.length) sc.innerHTML = Object.entries(CROPS).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('');
  const ecw = +state.water.ec, cost = +state.water.cost, Ea = SYSTEMS[p.system].eff;
  const rows = Object.entries(CROPS).map(([k, c]) => {
    const sp = Engine.seasonPlan(c, ecw, Ea, CLIMATE.et0, drainage);
    const rev = c.yield * 1000 * c.price * sp.ys, wc = sp.totM3 * cost, profit = rev - wc;
    const endM = (c.plantMonth - 1 + Math.round(sp.L / 30.4) - 1) % 12;
    return { k, c, sp, rev, profit, perM3: profit / sp.totM3, kgM3: c.yield * 1000 * sp.ys / sp.totM3, feasible: sp.peakM3 <= p.avail,
      season: c.perennial ? 'all year' : `${MONTHS[c.plantMonth - 1]}–${MONTHS[endM]}` };
  }).sort((a, b) => (b.feasible - a.feasible) || (SUIT_RANK[b.sp.suitability] - SUIT_RANK[a.sp.suitability]) || (b.perM3 - a.perM3));
  const suitTag = s => s === 'Good' ? 'green' : s === 'Marginal' ? 'amber' : 'red';
  $('#plannerTable').innerHTML = `<tr><th>#</th><th>Crop</th><th>Suitability (est.)</th><th>Season</th><th class="num">Est. water m³/ha</th><th class="num">Peak m³/ha/d</th><th class="num">Modeled ECe (thr)</th><th class="num">Drainage-capped LF</th><th class="num">Est. rel. yield</th><th class="num">Est. AED/m³</th></tr>` +
    rows.map((r, i) => `<tr class="${r.k === p.current ? 'hl' : ''}"><td>${i + 1}</td><td>${r.c.name}${r.k === p.current ? ' <span class="tag amber">now</span>' : ''}${i === 0 ? ' <span class="tag green">top est.</span>' : ''}</td>
      <td><span class="tag ${suitTag(r.sp.suitability)}">${r.sp.suitability}</span></td><td>${r.season}</td>
      <td class="num">${fmt(r.sp.totM3)}</td><td class="num ${r.feasible ? '' : 'bad'}">${fmt(r.sp.peakM3)}${r.feasible ? '' : ' ⚠'}</td>
      <td class="num ${r.sp.modeledECe > r.c.ecThr ? 'warn' : ''}">${fmt(r.sp.modeledECe, 1)} <span class="muted">(${r.c.ecThr})</span></td>
      <td class="num">${r.sp.capped ? `<span class="warn">cap ${pct(r.sp.drainCap)}</span>` : pct(r.sp.LR)}</td>
      <td class="num ${r.sp.ys < 0.9 ? 'bad' : ''}">${pct(r.sp.ys)}</td>
      <td class="num"><b class="${r.perM3 < 0 ? 'bad' : ''}">${fmt(r.perM3, 2)}</b></td></tr>`).join('');
  const cur = rows.find(r => r.k === p.current), best = rows[0];
  let note;
  if (!cur || !best || best.k === cur?.k) {
    note = `Your current crop is among the best estimated fits for modeled root-zone salinity (water ECw ${fmt(ecw, 1)} dS/m, ${drainage} drainage).`;
  } else if (best.perM3 <= 0) {
    note = `At ${fmt(cost, 1)} AED/m³, ECw ${fmt(ecw, 1)} dS/m, and ${drainage} drainage, modeled returns do not cover water costs. Blend fresher water or reduce water cost.`;
  } else if (cur.perM3 <= 0) {
    note = `Modeled estimate: at this water cost and ${drainage} drainage, ${cur.c.name} shows an estimated loss of <b>${fmt(Math.abs(cur.profit))} AED/ha</b> per season. One hectare of <b>${best.c.name}</b> models at <b>+${fmt(best.profit)} AED/ha</b> ${waterDiff(cur, best)}.`;
  } else if (best.profit < cur.profit) {
    note = `Modeled estimate: per hectare ${cur.c.name} earns more (${fmt(cur.profit)} vs ${fmt(best.profit)} AED/ha), but <b>${best.c.name}</b> earns <b>${fmt(best.perM3, 2)} AED per m³</b> vs ${fmt(cur.perM3, 2)} ${waterDiff(cur, best)}. It is the better choice when water, not land, is the limit.`;
  } else {
    note = `Modeled estimate: one hectare of <b>${best.c.name}</b> earns ≈ <b>${fmt(best.profit - cur.profit)} AED more</b> than ${cur.c.name} (${fmt(best.profit)} vs ${fmt(cur.profit)} AED/ha per season) ${waterDiff(cur, best)}.`;
  }
  $('#plannerNote').innerHTML = note + ' <em>All modeled ECe, relative yield, and AED/m³ figures are planning estimates based on FAO-29 / FAO-56 and illustrative UAE farm-gate prices, not guaranteed field yields.</em>';
}

/* ---------- Date harvest (on-device colour analysis) ---------- */
function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}
function drawSample(kind) {
  const c = $('#hvCanvas'), ctx = c.getContext('2d'); const r = seeded({ kimri: 3, khalal: 5, rutab: 7, tamr: 11 }[kind]);
  ctx.fillStyle = '#f3ead8'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#9a8f80'; ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(180, 0); ctx.lineTo(60 + i * 18, 200 + r() * 40); ctx.stroke(); }
  const col = { kimri: ['#6f9a2c', '#7fae35', '#5f8a26'], khalal: ['#e9c03a', '#f0c94a', '#d9a92a'], rutab: ['#e2b636', '#e9c03a'], tamr: ['#4a2a14', '#3f2411', '#56301a'] }[kind];
  for (let i = 0; i < 90; i++) {
    const y = 40 + r() * 200, spread = 40 + (y - 40) * 0.6, x = 180 + (r() - 0.5) * 2 * spread;
    ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.6);
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 15, 0, 0, Math.PI * 2); ctx.fillStyle = col[Math.floor(r() * col.length)]; ctx.fill();
    if (kind === 'rutab' && r() < 0.8) { ctx.clip(); const f = 0.3 + r() * 0.7; ctx.fillStyle = r() < 0.5 ? '#8a5a2b' : '#7a4a22'; ctx.fillRect(-12, 15 - 30 * f, 24, 30 * f); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(x - 3, y - 6, 2.5, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  }
  analyseHarvest();
}
function analyseHarvest() {
  const c = $('#hvCanvas'), ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const n = { green: 0, yellow: 0, red: 0, brown: 0, dark: 0 }; let total = 0, fruit = 0, foliage = 0;
  const W = c.width, H = c.height;
  for (let i = 0; i < d.length; i += 8) {
    // Only the central 80% of the frame: the bunch is centred, edges are usually fronds, sky or ground.
    const px = (i / 4) % W, py = Math.floor(i / 4 / W);
    if (px < W * 0.1 || px > W * 0.9 || py < H * 0.1 || py > H * 0.9) continue;
    total++;
    const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
    if (v < 0.1 || s < 0.22) continue;
    // Unripe (Kimri) dates are yellow-green (hue ~60-100°); palm fronds and leaves are blue-green (100-170°), so ignore those.
    if (h > 100 && h <= 170) { foliage++; continue; }
    fruit++;
    if (h >= 60 && h <= 100) n.green++;
    else if (v < 0.33) n.dark++;
    else if ((h <= 40 || h >= 330) && v < 0.6) n.brown++;
    else if (h >= 330 || h < 20) n.red++;
    else if (h < 60) n.yellow++;
    else fruit--;
  }
  const out = $('#hvOut');
  if (fruit / total < 0.05) { out.innerHTML = '<p class="bad"><b>No date fruit found.</b> Fill the frame with the bunch, in daylight.</p>'; return; }
  const F = k => n[k] / fruit, g = F('green'), kh = F('yellow') + F('red'), br = F('brown'), dk = F('dark');
  let stage, action, water;
  if (g > 0.5) { stage = 'Kimri (green, unripe)'; action = 'Not ready. Roughly 4–8 weeks to Khalal, depending on variety and heat.'; water = 'Keep normal irrigation: fruit is still growing in size.'; }
  else if (dk > 0.5) { stage = 'Tamr (dry, fully ripe)'; action = 'Harvest now and dry or store. Waiting longer only adds bird, insect and dust losses.'; water = 'Irrigation can be at the minimum until after harvest.'; }
  else if (br + dk >= 0.25) { stage = `Rutab (${pct(br + dk)} of fruit softening)`; action = 'Harvest rutab now: pick the ripe bunches or strands every 2–3 days for the best fresh-market price.'; water = 'Keep irrigation reduced and avoid wetting fruit. Too much water now causes splitting and souring.'; }
  else { stage = 'Khalal (full colour, crunchy)'; action = 'Harvest now if you sell fresh khalal (e.g. Barhi). For rutab or tamr, wait about 2–4 weeks.'; water = 'Start reducing irrigation by about 20–30%: it improves sugar content, cuts fruit splitting and saves water.'; }
  const bar = (label, v, col) => `<div class="row"><span style="width:120px" class="muted">${label}</span><div class="bar" style="flex:1"><i style="width:${v * 100}%;background:${col}"></i></div><span style="width:44px" class="muted">${pct(v)}</span></div>`;
  out.innerHTML = `<div class="muted">Stage</div><div class="verdict">${stage}</div><p><b>${action}</b></p><div class="alert blue">💧 ${water}</div>
    ${bar('Green (Kimri)', g, '#6f9a2c')}${bar('Yellow/red (Khalal)', kh, '#e9c03a')}${bar('Soft brown (Rutab)', br, '#8a5a2b')}${bar('Dark (Tamr)', dk, '#4a2a14')}
    ${foliage / total > 0.1 ? `<p class="muted">Ignored ${pct(foliage / total)} of the frame as leaves or fronds (blue-green), not fruit.</p>` : ''}
    <p class="muted">The colour analysis runs on the phone: no upload and no data cost. It is a screening aid, so confirm by tasting a few fruits from different sides of the bunch.</p>`;
}

/* ---------- Water sharing ---------- */
function renderShare() {
  const s = state.share;
  if (s.link && results.length && s.farms[0]) s.farms[0].need = Math.round(sum(results.map(r => r.today.m3)));
  $('#shLink').checked = !!s.link;
  const o = Engine.shareWater(s.farms, +s.cap, +s.price);
  $('#shareTable').innerHTML = `<tr><th>Farm</th><th class="num">Share %</th><th class="num">Need m³/day</th><th class="num">Right m³</th><th class="num">Sold</th><th class="num">Bought</th><th class="num">Gets m³</th><th class="num">Credits AED</th><th class="num">Still short</th><th></th></tr>` +
    o.rows.map((r, i) => `<tr><td><input type="text" data-fi="${i}" data-fk="name" value="${esc(r.name)}"></td>
      <td><input type="number" step="1" data-fi="${i}" data-fk="share" value="${r.share}" style="max-width:80px"></td>
      <td><input type="number" step="5" data-fi="${i}" data-fk="need" value="${r.need}" style="max-width:90px" ${i === 0 && s.link ? 'disabled title="From Saqi plan"' : ''}></td>
      <td class="num">${fmt(r.right)}</td><td class="num">${r.sold ? fmt(r.sold) : '–'}</td><td class="num">${r.bought ? fmt(r.bought) : '–'}</td>
      <td class="num"><b>${fmt(r.alloc)}</b></td><td class="num ${r.aed > 0 ? 'good' : r.aed < 0 ? 'bad' : ''}">${r.aed ? (r.aed > 0 ? '+' : '') + fmt(r.aed) : '–'}</td>
      <td class="num ${r.short > 0.5 ? 'bad' : ''}">${r.short > 0.5 ? fmt(r.short) : '0'}</td>
      <td>${i ? `<button class="btn sm ghost" data-fdel="${i}">✕</button>` : ''}</td></tr>`).join('');
  $$('[data-fi]').forEach(el => el.onchange = () => { const f = s.farms[+el.dataset.fi]; f[el.dataset.fk] = el.type === 'number' ? (+el.value || 0) : el.value; save(); renderAll(); });
  $$('[data-fdel]').forEach(el => el.onclick = () => { s.farms.splice(+el.dataset.fdel, 1); save(); renderAll(); });
  const shortBefore = sum(o.rows.map(r => r.deficit)), shortAfter = sum(o.rows.map(r => Math.max(0, r.short)));
  $('#shareSummary').innerHTML = `<h3>Result</h3>
    ${o.totalShare !== 100 ? `<div class="alert amber">Shares add up to ${o.totalShare}%, not 100%.</div>` : ''}
    <div class="kpi"><div><span>Traded between farms</span><b>${fmt(o.traded)} m³/day</b></div>
    <div><span>Shortage fixed</span><b class="good">${fmt(shortBefore - shortAfter)} m³/day</b><span>${fmt(shortBefore)} → ${fmt(shortAfter)}</span></div>
    <div><span>Left in the aquifer</span><b class="good">${fmt(o.unused)} m³/day</b><span>not pumped, not wasted</span></div></div>
    <p class="muted">Without trading, a farm with spare hours usually runs the pump anyway ("use it or lose it"). With credits it earns money for <em>not</em> pumping, and the neighbour who is short buys at a fair price.</p>`;
  let t = 18 * 60; const pump = Math.max(1, +s.pump);
  const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const totalH = sum(o.rows.map(r => r.alloc)) / pump;
  $('#shareSchedule').innerHTML = `<h3>Pump timetable (night first)</h3><table><tr><th>Farm</th><th>From</th><th>To</th><th class="num">Hours</th></tr>` +
    o.rows.filter(r => r.alloc > 0).map(r => { const mins = r.alloc / pump * 60; const a = t; t += mins; return `<tr><td>${esc(r.name)}</td><td>${hm(a)}</td><td>${hm(t)}</td><td class="num">${fmt(mins / 60, 1)}</td></tr>`; }).join('') +
    `</table>${totalH > 24 ? `<div class="alert red">Needs ${fmt(totalH, 1)} h of pumping: more than a day. Raise the pump flow or lower the well output figure.</div>` : `<p class="muted">Total ${fmt(totalH, 1)} h. Cool hours go first to cut evaporation; the timetable can go to each farm as an SMS.</p>`}`;
}

/* ---------- Adviser triage ---------- */
let ADV = null, advRegion = 'All';
function advFarms() {
  if (ADV) return ADV;
  const r = seeded(2026);
  const regions = [['Al Ain', 24.2, 55.7], ['Liwa', 23.1, 53.8], ['Al Dhaid', 25.3, 55.9], ['Madinat Zayed', 23.7, 53.7]];
  const crops = ['date', 'date', 'date', 'bermuda', 'tomato', 'cucumber', 'barley'];
  ADV = Array.from({ length: 40 }, (_, i) => {
    const g = regions[i % 4], crop = crops[Math.floor(r() * crops.length)];
    const prev = 0.32 + r() * 0.36, drop = r() < 0.25 ? 0.06 + r() * 0.15 : (r() - 0.5) * 0.04;
    const ndvi = Math.max(0.08, prev - drop), ndmi = -0.15 + r() * 0.4 - (drop > 0.05 ? 0.12 : 0);
    return { id: 'F-' + String(i + 1).padStart(3, '0'), region: g[0], lat: g[1] + (r() - 0.5) * 0.5, lon: g[2] + (r() - 0.5) * 0.5, crop,
      ndviPrev: prev, ndvi, ndmi, ecw: 1.5 + r() * 12, days: Math.floor(r() * 90) };
  });
  ADV.forEach(f => {
    const c = CROPS[f.crop];
    const dn = Math.min(1, Math.max(0, (f.ndviPrev - f.ndvi) / 0.15)), dm = f.ndmi < 0 ? Math.min(1, -f.ndmi / 0.2) : 0;
    const ds = Math.min(1, Math.max(0, f.ecw / (5 * c.ecThr))), dv = Math.min(1, f.days / 60);
    f.parts = { vigour: Math.round(45 * dn), water: Math.round(25 * dm), salt: Math.round(20 * ds), visit: Math.round(10 * dv) };
    f.score = f.parts.vigour + f.parts.water + f.parts.salt + f.parts.visit;
    const fell = dn > 0.3, dry = dm > 0.3, lr = Engine.leachingReq(f.ecw, c.ecThr), salty = lr === null || lr > 0.4, overdue = f.days > 60;
    f.reasons = [];
    if (fell) f.reasons.push(`vigour fell ${fmt((f.ndviPrev - f.ndvi) * 100 / f.ndviPrev)}% in 20 days`);
    if (dry) f.reasons.push('leaves are dry (low NDMI)');
    if (salty) f.reasons.push(`water ${fmt(f.ecw, 1)} dS/m is too salty for ${c.name.toLowerCase()}`);
    if (overdue) f.reasons.push(`not visited for ${f.days} days`);
    // Likely cause + what to do on arrival, from the same signals (a triage hint, not a diagnosis).
    const isDate = f.crop === 'date';
    [f.cause, f.action] =
      fell && salty ? ['Salt damage', 'Measure water and soil EC; run a leaching (salt-flush) irrigation and blend in fresher water if available.']
      : fell && dry ? ['Irrigation failure', 'Check the pump, flow meter and drip lines first (clog, burst, or valve not opening).']
      : salty && dry ? ['Salt + water stress', 'Raise irrigation with a salt flush; check drainage so the flush can leave the root zone.']
      : fell ? ['Pest, disease or nutrients', isDate ? 'Inspect for red palm weevil and leaf spots; check fertiliser timing.' : 'Inspect leaves and roots for pests or disease; check fertiliser timing.']
      : dry ? ['Water stress starting', 'Increase tonight\'s runtime per the Saqi plan and confirm night-time watering.']
      : salty ? ['Salt building up', 'Test soil ECe and set up a regular salt-flush schedule before yield drops.']
      : overdue ? ['Routine visit overdue', 'Quick check-in; satellite signals look normal.']
      : ['No action', 'Keep monitoring remotely.'];
  });
  ADV.sort((a, b) => b.score - a.score);
  return ADV;
}
function riskColor(s) { return s >= 60 ? '#e0634e' : s >= 35 ? '#e0aa45' : '#57b887'; }
function renderAdviser() {
  const allF = advFarms();
  const F = advRegion === 'All' ? allF : allF.filter(f => f.region === advRegion);
  const w = 480, h = 360, la0 = 22.7, la1 = 25.7, lo0 = 53.3, lo1 = 56.3;
  const X = lo => 20 + (lo - lo0) / (lo1 - lo0) * (w - 40), Y = la => 20 + (la1 - la) / (la1 - la0) * (h - 40);
  $('#advMap').innerHTML = `<div class="row" style="margin-bottom:.5rem"><label style="margin:0">Region:</label><select id="advRegionSel" style="max-width:170px">${['All', 'Al Ain', 'Liwa', 'Al Dhaid', 'Madinat Zayed'].map(r => `<option value="${r}" ${r === advRegion ? 'selected' : ''}>${r === 'All' ? 'All regions (40)' : r}</option>`).join('')}</select></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:600px;display:block;margin:0 auto;background:var(--map-bg);border:1px solid var(--map-border);border-radius:16px">
    ${[['Al Ain', 24.2, 55.7], ['Liwa', 23.1, 53.8], ['Al Dhaid', 25.3, 55.9], ['Madinat Zayed', 23.7, 53.7]].map(g => `<text x="${X(g[2])}" y="${Y(g[1]) - 34}" font-size="12" text-anchor="middle" fill="var(--chart-axis)">${g[0]}</text>`).join('')}
    ${F.slice().reverse().map(f => `<circle cx="${X(f.lon)}" cy="${Y(f.lat)}" r="${5 + f.score / 15}" fill="${riskColor(f.score)}" opacity=".9" stroke="var(--background)"><title>${f.id} ${CROPS[f.crop].name} · risk ${f.score}</title></circle>`).join('')}
    ${F.slice(0, 5).map((f, i) => `<text x="${X(f.lon) + 9}" y="${Y(f.lat) + 4}" font-size="11" font-weight="700" fill="var(--chart-text)">${i + 1}</text>`).join('')}</svg>
    <div class="row" style="margin-top:.4rem"><span class="tag red">High ≥ 60</span><span class="tag amber">Medium 35–59</span><span class="tag green">Watch &lt; 35</span></div>`;
  $('#advRegionSel').onchange = e => { advRegion = e.target.value; renderAdviser(); };
  $('#advTop').innerHTML = F.slice(0, 5).map((f, i) => `<div class="alert ${f.score >= 60 ? 'red' : f.score >= 35 ? 'amber' : 'green'}"><span class="alert-body"><b>${i + 1}. ${f.id}</b> · ${f.region} · ${CROPS[f.crop].name} · risk <b>${f.score}</b>
      <br><b>Likely cause: ${f.cause}.</b> ${f.action}
      <br><span class="muted">Signals: ${f.reasons.join(' · ') || 'combined moderate signals'}</span>
      <br><span class="muted">Score = vigour ${f.parts.vigour} + leaf water ${f.parts.water} + salt ${f.parts.salt} + visit gap ${f.parts.visit}</span></span></div>`).join('') +
    `<p class="muted">Risk score out of 100: vigour drop up to 45, dry leaves up to 25, water salinity vs the crop's tolerance up to 20, days since last visit up to 10. The likely cause is a triage hint for the visit, not a diagnosis.</p>`;
  $('#advTable').innerHTML = `<tr><th>#</th><th>Farm</th><th>Region</th><th>Crop</th><th class="num">NDVI before → now</th><th class="num">NDMI</th><th class="num">Water EC</th><th class="num">Last visit</th><th>Likely cause</th><th class="num">Risk</th></tr>` +
    F.map((f, i) => `<tr><td>${i + 1}</td><td>${f.id}</td><td>${f.region}</td><td>${CROPS[f.crop].name}</td><td class="num">${fmt(f.ndviPrev, 2)} → <b class="${f.ndvi < f.ndviPrev - 0.05 ? 'bad' : ''}">${fmt(f.ndvi, 2)}</b></td>
      <td class="num ${f.ndmi < 0 ? 'bad' : ''}">${fmt(f.ndmi, 2)}</td><td class="num">${fmt(f.ecw, 1)}</td><td class="num">${f.days} d</td><td>${f.cause}</td>
      <td class="num"><span class="tag" style="background:${riskColor(f.score)};color:#fff">${f.score}</span></td></tr>`).join('');
}

/* ---------- Interactive Field Map, Grid Drawer & Public Data Readings ---------- */
let lmap = null, lTileSat = null, lTileOsm = null, lSatActive = true, lGroup = null, pubCache = {};

function ensureFieldPoly() {
  const loc = LOCATIONS[state.location] || LOCATIONS.alain;
  if (!state.fieldPoly || state.fieldPoly.length < 3) {
    state.fieldPoly = Engine.rectPolygon(loc.lat, loc.lon, 200, 100);
  }
  if (!state.gridStep) state.gridStep = 25;
}

function renderFieldMap() {
  ensureFieldPoly();
  const sel = $('#applyBlockSel');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = state.blocks.map((b, i) => `<option value="${i}">Apply to Valve ${i + 1}: ${esc(b.name)} (${b.area} ha)</option>`).join('') +
      `<option value="new">+ Create new block from drawn grid</option>`;
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
  $('#gridStepSel').value = String(state.gridStep || 25);

  const st = Engine.polygonStats(state.fieldPoly, state.gridStep);
  $('#polyKpi').innerHTML = `
    <div><span>Drawn area</span><b class="good">${fmt(st.areaHa, 2)} ha</b><span>${fmt(st.areaM2)} m²</span></div>
    <div><span>Perimeter</span><b>${fmt(st.perimM)} m</b><span>${state.fieldPoly.length} corners</span></div>
    <div><span>Irrigation grid</span><b>${fmt(st.cells)} cells</b><span>${st.cellM}m × ${st.cellM}m sub-plots</span></div>
    <div><span>Field center</span><b style="font-size:1rem">${st.center.lat.toFixed(4)}°N, ${st.center.lon.toFixed(4)}°E</b><span>WGS84 geodesic</span></div>`;

  if (typeof L === 'undefined') {
    $('#fieldMap').innerHTML = `<div style="padding:1.2rem;text-align:center" class="muted">Map library offline — area calculated from saved coordinates (${fmt(st.areaHa, 2)} ha).</div>`;
    return;
  }
  if (!lmap) {
    lmap = L.map('fieldMap', { zoomControl: true }).setView([st.center.lat, st.center.lon], 16);
    lTileSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri'
    });
    lTileOsm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    });
    lTileSat.addTo(lmap);
    lGroup = L.layerGroup().addTo(lmap);
    lmap.on('click', e => {
      state.fieldPoly.push({ lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) });
      save(); renderFieldMap();
    });
    setTimeout(() => lmap.invalidateSize(), 100);
  }
  lGroup.clearLayers();
  if (state.fieldPoly.length >= 2) {
    const latlngs = state.fieldPoly.map(p => [p.lat, p.lon]);
    L.polygon(latlngs, { color: '#2fd47a', weight: 2.5, fillColor: '#2b6e47', fillOpacity: 0.25 }).addTo(lGroup);
    st.lines.forEach(seg => {
      L.polyline(seg, { color: '#98cff0', weight: 1, opacity: 0.65, dashArray: '3 3', interactive: false }).addTo(lGroup);
    });
  }
  state.fieldPoly.forEach((p, idx) => {
    const icon = L.divIcon({
      className: 'vertex-pin',
      html: `<span>${idx + 1}</span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const m = L.marker([p.lat, p.lon], { icon, draggable: true }).addTo(lGroup);
    m.on('dragend', ev => {
      const ll = ev.target.getLatLng();
      state.fieldPoly[idx] = { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) };
      save(); renderFieldMap();
      fetchPublicReadings(st.center.lat, st.center.lon);
    });
  });
}

async function fetchPublicReadings(lat, lon, force = false) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const box = $('#pubDataOut');
  if (!box) return;
  if (!force && pubCache[key]) { renderPublicData(pubCache[key]); return; }
  box.innerHTML = `<p class="muted">Querying Open-Meteo Land-Surface Model, NASA POWER Satellite Archive &amp; OpenStreetMap for <b>${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E</b>…</p>`;

  const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,vapour_pressure_deficit,soil_temperature_0cm,soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm&daily=et0_fao_evapotranspiration&forecast_days=1&timezone=auto`;
  const nasaUrl = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=en`;

  const [omRes, nasaRes, nomRes] = await Promise.allSettled([
    fetch(omUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(nasaUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    fetch(nomUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)),
  ]);

  const data = {
    lat, lon, fetchedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    om: omRes.status === 'fulfilled' ? omRes.value : null,
    nasa: nasaRes.status === 'fulfilled' ? nasaRes.value?.properties?.parameter : null,
    place: nomRes.status === 'fulfilled' ? nomRes.value : null,
  };
  pubCache[key] = data;
  renderPublicData(data);
}

function renderPublicData(d) {
  const box = $('#pubDataOut');
  if (!box) return;
  const c = d.om?.current;
  const et0Today = d.om?.daily?.et0_fao_evapotranspiration?.[0];
  const elev = d.om?.elevation;
  const smSurf = c?.soil_moisture_0_to_1cm != null ? +(c.soil_moisture_0_to_1cm * 100).toFixed(1) : null;
  const smMid = c?.soil_moisture_3_to_9cm != null ? +(c.soil_moisture_3_to_9cm * 100).toFixed(1) : null;
  const smRoot = c?.soil_moisture_9_to_27cm != null ? +(c.soil_moisture_9_to_27cm * 100).toFixed(1) : null;
  const addr = d.place?.address || {};
  const placeName = [addr.suburb || addr.village || addr.town || addr.city, addr.state, addr.country].filter(Boolean).join(', ') || d.place?.display_name || `${d.lat.toFixed(4)}°N, ${d.lon.toFixed(4)}°E`;
  const mKey = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][new Date().getMonth()];
  const solar = d.nasa?.ALLSKY_SFC_SW_DWN?.[mKey] ?? d.nasa?.ALLSKY_SFC_SW_DWN?.ANN;
  const nasaT = d.nasa?.T2M?.[mKey] ?? d.nasa?.T2M?.ANN;
  const nasaRH = d.nasa?.RH2M?.[mKey] ?? d.nasa?.RH2M?.ANN;

  box.innerHTML = `
    <div class="alert green" style="margin-bottom:.75rem">
      <span class="alert-icon">📍</span>
      <span class="alert-body"><b>${esc(placeName)}</b><br><span class="muted mono">${d.lat.toFixed(4)}°N, ${d.lon.toFixed(4)}°E${elev != null ? ` · Elevation ${fmt(elev)} m ASL` : ''} · Fetched ${d.fetchedAt}</span></span>
    </div>

    ${c ? `
    <div style="margin-bottom:.75rem">
      <div class="row" style="justify-content:space-between;margin-bottom:.35rem">
        <b style="font-size:.86rem">1. Open-Meteo Land-Surface &amp; Soil Model</b>
        <span class="tag green">live ECMWF / ICON</span>
      </div>
      <table>
        <tr><td>Air temp / Humidity / VPD</td><td class="num"><b>${fmt(c.temperature_2m, 1)} °C</b> · ${fmt(c.relative_humidity_2m)}% · ${fmt(c.vapour_pressure_deficit, 2)} kPa</td></tr>
        <tr><td>Surface soil temperature (0 cm)</td><td class="num">${fmt(c.soil_temperature_0cm, 1)} °C</td></tr>
        <tr><td>Soil moisture 0–1 cm / 3–9 cm</td><td class="num">${smSurf ?? '–'}% / ${smMid ?? '–'}% VWC</td></tr>
        <tr><td>Root-zone soil moisture (9–27 cm)</td><td class="num"><b>${smRoot ?? '–'}% VWC</b></td></tr>
        <tr><td>Today's FAO-56 reference ET₀</td><td class="num"><b>${et0Today != null ? fmt(et0Today, 2) + ' mm/day' : '–'}</b></td></tr>
      </table>
    </div>` : `<div class="alert amber">Open-Meteo live soil feed unreachable.</div>`}

    ${d.nasa ? `
    <div style="margin-bottom:.85rem">
      <div class="row" style="justify-content:space-between;margin-bottom:.35rem">
        <b style="font-size:.86rem">2. NASA POWER Agroclimatology Satellite</b>
        <span class="tag blue">live satellite normal (${mKey})</span>
      </div>
      <table>
        <tr><td>All-sky solar irradiance</td><td class="num"><b>${fmt(solar, 2)} MJ/m²/day</b></td></tr>
        <tr><td>Climatological temperature (${mKey})</td><td class="num">${fmt(nasaT, 1)} °C</td></tr>
        <tr><td>Climatological relative humidity (${mKey})</td><td class="num">${fmt(nasaRH, 1)}%</td></tr>
      </table>
    </div>` : ''}

    <div class="row">
      <button type="button" class="btn sm" id="usePubInSensorBtn">Use live soil &amp; weather in Sensor Check + Simulator</button>
    </div>`;

  const btn = $('#usePubInSensorBtn');
  if (btn) btn.onclick = () => {
    if (smRoot != null) state.sensor.reading = smRoot;
    if (c?.temperature_2m != null) simCond.temperature = Math.min(55, Math.max(25, Math.round(c.temperature_2m)));
    if (c?.relative_humidity_2m != null) simCond.humidity = Math.min(80, Math.max(5, Math.round(c.relative_humidity_2m)));
    if (smRoot != null) simCond.moisture = Math.min(45, Math.max(5, Math.round(smRoot)));
    save(); renderAll(); renderHomeSim();
    toast(`Applied root-zone moisture (${smRoot ?? state.sensor.reading}%) & live weather to Sensor Check and Simulator`);
  };
}

function moveMapTo(lat, lon, label) {
  state.fieldPoly = Engine.rectPolygon(lat, lon, 200, 100);
  state.customLoc = { name: label || `Custom (${lat.toFixed(3)}, ${lon.toFixed(3)})`, lat, lon };
  LOCATIONS.custom = state.customLoc;
  if (lmap) lmap.setView([lat, lon], 16);
  save(); renderFieldMap();
  fetchPublicReadings(lat, lon, true);
}

/* ---------- one-time wiring ---------- */
function initTools() {
  $('#blBlock').onchange = e => { state.blend.block = +e.target.value; save(); renderAll(); };
  $('#calBtn').onclick = () => {
    const sv = +$('#calSensor').value, tv = +$('#calTrue').value, ec = +$('#calEce').value;
    if (!(sv > 0 && ec > 0) || tv > sv) { toast('Need sensor > true value and ECe > 0'); return; }
    state.sensor.k = +((sv - tv) / (ec * sv / 10)).toFixed(3);
    if (state.sensor.eceSource === 'measured') state.sensor.ece = ec;
    save(); renderAll(); toast('k calibrated to ' + state.sensor.k);
  };
  $('#shLink').onchange = e => { state.share.link = e.target.checked; save(); renderAll(); };
  $('#shAdd').onclick = () => { state.share.farms.push({ name: 'Neighbour', share: 10, need: 50 }); save(); renderAll(); };
  $$('[data-sample]').forEach(b => b.onclick = () => drawSample(b.dataset.sample));
  $('#hvFile').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const img = new Image(); img.onload = () => {
      const c = $('#hvCanvas'), ctx = c.getContext('2d'), sc = Math.min(c.width / img.width, c.height / img.height);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, (c.width - img.width * sc) / 2, (c.height - img.height * sc) / 2, img.width * sc, img.height * sc);
      URL.revokeObjectURL(img.src); analyseHarvest();
    };
    img.src = URL.createObjectURL(file);
  };
  drawSample('rutab');

  // Map & Public Data controls
  ensureFieldPoly();
  $('#gridStepSel').onchange = e => { state.gridStep = +e.target.value || 25; save(); renderFieldMap(); };
  $('#polyRectBtn').onclick = () => {
    const c = lmap ? lmap.getCenter() : (LOCATIONS[state.location] || LOCATIONS.alain);
    const lat = c.lat, lon = c.lng ?? c.lon;
    state.fieldPoly = Engine.rectPolygon(lat, lon, 200, 100);
    save(); renderFieldMap(); fetchPublicReadings(lat, lon);
    toast('Snapped 2.00 ha (200m × 100m) grid box at map center');
  };
  $('#polyClearBtn').onclick = () => {
    state.fieldPoly = [];
    save(); renderFieldMap();
    toast('Click 3 or more corners on the map to draw your field grid');
  };
  $('#mapLayerBtn').onclick = () => {
    if (!lmap) return;
    lSatActive = !lSatActive;
    if (lSatActive) { lmap.removeLayer(lTileOsm); lTileSat.addTo(lmap); $('#mapLayerBtn').textContent = '🛰️ Satellite'; }
    else { lmap.removeLayer(lTileSat); lTileOsm.addTo(lmap); $('#mapLayerBtn').textContent = '🗺️ Street'; }
  };
  $('#geoBtn').onclick = () => {
    if (!navigator.geolocation) { toast('Geolocation is not supported by this browser'); return; }
    toast('Requesting GPS location…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = +pos.coords.latitude.toFixed(5), lon = +pos.coords.longitude.toFixed(5);
        moveMapTo(lat, lon, `GPS (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
        toast(`Located at ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`);
      },
      err => toast(err && err.code === 3
        ? 'GPS is slow here: search a place name or tap your field on the map'
        : 'Location permission unavailable: search a place name or click anywhere on the map'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 } // weak farm signal: don't hang, accept a recent fix
    );
  };
  const doSearch = async () => {
    const q = $('#mapSearch').value.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { moveMapTo(+m[1], +m[2], `Custom (${(+m[1]).toFixed(3)}, ${(+m[2]).toFixed(3)})`); return; }
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}&accept-language=en`);
      const arr = await r.json();
      if (!arr.length) { toast('Place not found — try another name or lat, lon'); return; }
      moveMapTo(+arr[0].lat, +arr[0].lon, arr[0].display_name.split(',').slice(0, 2).join(','));
      toast('Moved to ' + arr[0].display_name.split(',')[0]);
    } catch { toast('Search offline — enter coordinates as lat, lon'); }
  };
  $('#mapSearchBtn').onclick = doSearch;
  $('#mapSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  $('#refreshPubBtn').onclick = () => {
    const st = Engine.polygonStats(state.fieldPoly, state.gridStep);
    fetchPublicReadings(st.center.lat, st.center.lon, true);
  };
  $('#applyAreaBtn').onclick = async () => {
    const st = Engine.polygonStats(state.fieldPoly, state.gridStep);
    if (st.areaHa < 0.01) { toast('Draw at least 3 corners on the map first'); return; }
    const areaHa = +st.areaHa.toFixed(2);
    const target = $('#applyBlockSel').value;
    if (target === 'new') {
      const defFlow = Math.max(4, +(areaHa * 20).toFixed(1));
      state.blocks.push({ name: `Mapped plot (${areaHa} ha)`, crop: 'date', area: areaHa, planted: isoDaysAgo(0), system: 'drip', flowMode: 'direct', emitterLph: 4, emitterCount: Math.round(defFlow * 250), flow: defFlow, habitMin: 180 });
      state.flowLog.push(Array.from({ length: 14 }, (_, d) => ({ date: isoDaysAgo(13 - d), flow: defFlow })));
    } else {
      const b = state.blocks[+target];
      if (b) b.area = areaHa;
    }
    const addr = pubCache[`${st.center.lat.toFixed(3)},${st.center.lon.toFixed(3)}`]?.place?.address;
    const shortName = addr?.city || addr?.town || addr?.village || addr?.suburb || `Field (${st.center.lat.toFixed(2)}°N, ${st.center.lon.toFixed(2)}°E)`;
    state.customLoc = { name: `${shortName} (mapped)`, lat: +st.center.lat.toFixed(4), lon: +st.center.lon.toFixed(4) };
    LOCATIONS.custom = state.customLoc;
    state.location = 'custom';
    save();
    await loadWeather(true);
    renderAll();
    toast(`Applied ${areaHa} ha & field location (${shortName}) to farm!`);
  };

  const st0 = Engine.polygonStats(state.fieldPoly, state.gridStep);
  fetchPublicReadings(st0.center.lat, st0.center.lon);
}
