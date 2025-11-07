import { csvParse } from 'https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ========================= THEME =========================
   We define two cohesive palettes and store every color we
   actually reference in rendering. We do this so:
   - switching themes is a single object swap,
   - components can re-read current colors via `theme`,
   - CSS variables for the sidebar get updated in one place. */
const THEMES = {
  light: {
    name: 'light',
    bodyBg: '#ffffff',
    text: '#0c0d10',
    axis: '#d6dbe3',
    low: '#59a14f',
    high: '#e15759',
    sliderLine: '#0c0d10',
    sliderThumb: '#0c0d10',
    label: '#0c0d10',
    panelBG: '#f7f8fa',
    panelStroke: '#e6e8ee',
    tooltipBg: '#ffffff',
    tooltipBd: '#cfd4dc',
    rangeFill: '#aab2bd44'
  },
  dark: {
    name: 'dark',
    bodyBg: '#0d0f12',
    text: '#f5f7fa',
    axis: '#262b31',
    low: '#59a14f',
    high: '#e15759',
    sliderLine: '#f0f3f7',
    sliderThumb: '#ffffff',
    label: '#ffffff',
    panelBG: '#14161b',
    panelStroke: '#23262d',
    tooltipBg: '#111418',
    tooltipBd: '#2a3039',
    rangeFill: '#ffffff22'
  }
};
let theme = THEMES.dark; // we default to dark to match the design

/* ========================= DATA =========================
   We parse once up front and convert to strong types so the
   viz never does string parsing on every redraw. */
async function loadData() {
  const res = await fetch('./health_lifestyle_dataset.csv');
  const text = await res.text();
  return csvParse(text);
}
const raw = await loadData();

const rowsAll = raw.map(d => ({
  age: +d.age,
  sleep: +d.sleep_hours,
  steps: +d.daily_steps,
  risk: String(d.disease_risk ?? '0'),
  alcohol: +d.alcohol || 0,
  smoker: +d.smoker || 0
})).filter(d => Number.isFinite(d.age));

/* We precompute extents once so sliders and defaults stay in sync. */
const SLEEP_EXTENT = d3.extent(rowsAll, d => d.sleep);   // ~ [3, 10]
const STEPS_EXTENT = d3.extent(rowsAll, d => d.steps);   // ~ [1000, 20000]

/* ========================= STATE =========================
   We centralize filter state to:
   - keep controls stateless (callbacks only),
   - make recomputation easy (`getFilteredRows()`).
   The tri-mode uses 0/1/2 for left/all/right on the 3-position sliders. */
const state = {
  alcoholMode: 1,
  smokerMode: 1,
  sleepRange: [SLEEP_EXTENT[0], SLEEP_EXTENT[1]],
  stepsRange: [STEPS_EXTENT[0], STEPS_EXTENT[1]],
  zoom: { isZoomed: false, xDomain: null }
};
/* We pull the ternary logic into one helper so any 3-way filter reads clean. */
const tri = (flag, mode) => (mode === 1 ? true : (mode === 0 ? +flag === 0 : +flag === 1));

/* ========================= SLIDER SIZING (UNIFORM) =========================
   We define common metrics so every slider lines up perfectly and future
   spacing tweaks are one-line changes. */
const CTRL_W   = 420;   // panel inner width in SVG
const TRI_H    = 64;    // vertical footprint for tri slider
const RANGE_H  = 96;    // vertical footprint for range slider
const GAP      = 16;    // gap between controls
const PAD      = 18;    // top/bottom padding in controls SVG

/* ========== HELPERS =========
   We keep formatting helpers tiny and dedicated so tooltips and badges
   don’t embed formatting logic inline. */
const fmtInt = d3.format(',');
const fmtK   = v => (v >= 1000 ? d3.format('~s')(v).replace('G','B') : v);

/* ========================= SLIDERS =========================
   We build two slider primitives (tri + range) so:
   - controls are declarative,
   - theme recoloring is centralized,
   - drag/click behavior is consistent across instances. */
function triSlider(parentG, { y, label, ticks, initial = 1, onChange }) {
  // We compute a local scale (0..2) so labels and handle share the same math.
  const width = CTRL_W - 24;
  const lineY = y + 24;
  const x = d3.scaleLinear().domain([0, 2]).range([0, width]);

  // We render label first so recoloring can target one element cleanly.
  const lbl = parentG.append('text')
    .attr('x', 0).attr('y', y).attr('dy', '0.95em')
    .attr('font-size', 12).attr('fill', theme.label).text(label);

  // We draw the track once and let the handle move independently.
  parentG.append('line')
    .attr('x1', 0).attr('x2', x(2))
    .attr('y1', lineY).attr('y2', lineY)
    .attr('stroke', theme.sliderLine).attr('stroke-width', 2);

  // We place tick labels at exact 0/1/2 to avoid drift on resize.
  parentG.selectAll(null).data([0, 1, 2]).enter().append('text')
    .attr('x', d => x(d)).attr('y', lineY + 20)
    .attr('text-anchor', d => d === 0 ? 'start' : d === 2 ? 'end' : 'middle')
    .attr('font-size', 11).attr('fill', theme.label).text((d, i) => ticks[i]);

  // We keep the handle as a circle for simple hit-testing and aesthetics.
  const handle = parentG.append('circle').attr('r', 7).attr('cx', x(initial)).attr('cy', lineY)
    .attr('fill', theme.sliderThumb).style('cursor', 'grab');

  // We snap to 0/1/2 on release so the mode is always discrete.
  const setValue = v => {
    const vv = Math.max(0, Math.min(2, Math.round(v)));
    handle.attr('cx', x(vv));
    onChange(vv);
  };

  // We add a transparent rect so click-to-jump works anywhere on the track.
  parentG.append('rect')
    .attr('x', -6).attr('y', lineY - 10).attr('width', x(2) + 12).attr('height', 20)
    .attr('fill', 'transparent').style('cursor', 'pointer')
    .on('click', e => {
      const [px] = d3.pointer(e, parentG.node());
      setValue(x.invert(Math.max(0, Math.min(x(2), px))));
    });

  // We allow free drag but still snap on end for crisp states.
  handle.call(d3.drag()
    .on('drag', e => handle.attr('cx', Math.max(0, Math.min(x(2), e.x))))
    .on('end', () => setValue(x.invert(+handle.attr('cx')))));

  // We expose a tiny API so theme changes recolor without rebuilding.
  const recolor = () => { lbl.attr('fill', theme.label); parentG.selectAll('text').attr('fill', theme.label); handle.attr('fill', theme.sliderThumb); };
  return { recolor };
}

function rangeSlider2(parentG, { y, label, domain, initial, format = d3.format('.1f'), onChange, valueFormat = d => d }) {
  // We anchor everything to one shared linear scale for the range.
  const width = CTRL_W - 24;
  const lineY = y + 26;
  const BADGE_ROW_Y = lineY + 24;
  const x = d3.scaleLinear().domain(domain).range([0, width]);

  // We render label first for clear focus and easier recolor.
  const lbl = parentG.append('text')
    .attr('x', 0).attr('y', y).attr('dy', '0.95em')
    .attr('font-size', 12).attr('fill', theme.label).text(label);

  // We draw the track, then a rounded “selected range” rect on top.
  parentG.append('line').attr('x1', 0).attr('x2', x(domain[1]))
    .attr('y1', lineY).attr('y2', lineY)
    .attr('stroke', theme.sliderLine).attr('stroke-width', 2);

  const sel = parentG.append('rect')
    .attr('x', x(initial[0])).attr('y', lineY - 6)
    .attr('width', x(initial[1]) - x(initial[0]))
    .attr('height', 12).attr('fill', theme.rangeFill).attr('rx', 6);

  // We use two identical handles to keep DOM + drag logic symmetric.
  const h1 = parentG.append('circle').attr('r', 7).attr('cx', x(initial[0])).attr('cy', lineY)
    .attr('fill', theme.sliderThumb).style('cursor', 'grab');
  const h2 = parentG.append('circle').attr('r', 7).attr('cx', x(initial[1])).attr('cy', lineY)
    .attr('fill', theme.sliderThumb).style('cursor', 'grab');

  // We render value badges once and just update their text/positions.
  const v1 = parentG.append('text').attr('y', BADGE_ROW_Y).attr('font-size', 11).attr('fill', theme.label);
  const v2 = parentG.append('text').attr('y', BADGE_ROW_Y).attr('font-size', 11).attr('fill', theme.label);

  // We centralize all side effects in `update` so both draggers call it.
  const update = (a, b) => {
    h1.attr('cx', x(a)); h2.attr('cx', x(b));
    sel.attr('x', x(a)).attr('width', x(b) - x(a));
    v1.attr('x', x(a)).attr('text-anchor', 'start').text(valueFormat(a));
    v2.attr('x', x(b)).attr('text-anchor', 'end').text(valueFormat(b));
    onChange([a, b]);
  };
  update(initial[0], initial[1]);

  // We allow each handle to move independently and clamp to domain.
  h1.call(d3.drag().on('drag', e => {
    const v = x.invert(Math.max(0, Math.min(x(domain[1]), e.x)));
    update(v, x.invert(+h2.attr('cx')));
  }));
  h2.call(d3.drag().on('drag', e => {
    const v = x.invert(Math.max(0, Math.min(x(domain[1]), e.x)));
    update(x.invert(+h1.attr('cx')), v);
  }));

  // We expose a recolor API so theme flips don’t rebuild controls.
  const recolor = () => {
    lbl.attr('fill', theme.label);
    v1.attr('fill', theme.label);
    v2.attr('fill', theme.label);
    sel.attr('fill', theme.rangeFill);
    h1.attr('fill', theme.sliderThumb);
    h2.attr('fill', theme.sliderThumb);
  };
  return { recolor };
}

/* ========================= HISTOGRAM =========================
   We draw a fresh SVG per redraw because we:
   - simplify zoom/filter logic,
   - avoid stale axes/bar geometry,
   - keep code easy to reason about. */
const container = d3.select('#data');
const tooltip = d3.select('body').append('div').attr('class', 'tooltip');

/* We observe container size so the chart reflows when:
   - the sidebar wraps under the chart,
   - the window resizes,
   - fonts or scrollbars change available width. */
const ro = new ResizeObserver(() => {
  handleSliderChange();  // re-run full layout safely
});
ro.observe(container.node());

// We also listen to window resize as a general safety net.
window.addEventListener('resize', () => handleSliderChange());

function redrawHistogram(filteredRows) {
  container.selectAll('*').remove();

  // We derive inner plotbox from live container width so bars/axes fit.
  const histWidth  = Math.max(860, container.node().clientWidth - 20);
  const histHeight = 480;
  const margin     = { top: 66, right: 28, bottom: 54, left: 70 };
  const innerWidth = histWidth - margin.left - margin.right;
  const innerHeight= histHeight - margin.top - margin.bottom;

  const svg = container.append('svg')
    .attr('width', histWidth)
    .attr('height', histHeight);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // We render a graceful empty state when filters remove all rows.
  if (!filteredRows.length) {
    svg.append('text')
      .attr('x', histWidth / 2)
      .attr('y', histHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', 14)
      .attr('fill', theme.text)
      .text('No data for current filters');
    return;
  }

  // We define x scale first (domain may change on zoom).
  const x = d3.scaleLinear().range([0, innerWidth]);

  /* ===== DEFAULT: 5-year bins =====
     We start with 5-year edges for readability at overview scale. */
  const [amin, amax] = d3.extent(filteredRows, d => d.age);
  const start5 = Math.floor(amin / 5) * 5;
  const end5   = Math.ceil(amax / 5) * 5;
  x.domain([start5, end5]);

  let bins = d3.bin()
    .domain([start5, end5])
    .thresholds(d3.range(start5, end5, 5))  // 5-year edges
    .value(d => d.age)(filteredRows);

  let zoomed = false;
  const originalDomain = [start5, end5];

  /* ===== ZOOM: 1-year bins =====
     We switch to 1-year bins when the user brushes a subrange,
     because finer bins reveal local structure without overplotting. */
  if (state.zoom.isZoomed && state.zoom.xDomain) {
    let [x0, x1] = state.zoom.xDomain.map(Math.round);
    if (x1 < x0) [x0, x1] = [x1, x0];

    const inRange = filteredRows.filter(d => d.age >= x0 && d.age <= x1);

    bins = d3.bin()
      .domain([x0, x1])
      .thresholds(d3.range(x0, x1, 1))      // 1-year edges
      .value(d => d.age)(inRange);

    x.domain([x0, x1]);
    zoomed = true;
  }

  // We scale y to total counts per bin and call .nice() for neat ticks.
  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, b => b.length)]).nice()
    .range([innerHeight, 0]);

  /* We fix x ticks to integers:
     - 5-year multiples by default,
     - 1-year when zoomed.
     This prevents “.5” labels when zooming into odd ranges. */
  const step = zoomed ? 1 : 5;
  const tickVals = d3.range(
    Math.ceil(x.domain()[0] / step) * step,
    Math.floor(x.domain()[1] / step) * step + step,
    step
  );

  const gx = g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickValues(tickVals).tickFormat(d3.format('d')));
  gx.selectAll('text').attr('fill', theme.text);
  gx.selectAll('line,path').attr('stroke', theme.axis);

  const gy = g.append('g').call(d3.axisLeft(y));
  gy.selectAll('text').attr('fill', theme.text);
  gy.selectAll('line,path').attr('stroke', theme.axis);

  // We precompute stacked segments per bin to avoid recomputing in attrs.
  const stacked = bins.map(b => ({
    bin: b,
    risk0: b.reduce((a, r) => a + (r.risk === '0' ? 1 : 0), 0),
    risk1: b.length - b.reduce((a, r) => a + (r.risk === '0' ? 1 : 0), 0)
  }));

  // We subtract 1px from bar width so adjacent bars don’t fuse visually.
  const bw = b => Math.max(0, x(b.x1) - x(b.x0) - 1);

  // Bottom segment (low risk)
  g.selectAll('rect.r0').data(stacked).join('rect')
    .attr('class', 'r0')
    .attr('x', d => x(d.bin.x0))
    .attr('y', d => y(d.risk0))
    .attr('width', d => bw(d.bin))
    .attr('height', d => y(0) - y(d.risk0))
    .attr('fill', theme.low)
    .on('mouseover', (e, d) => showTip(e, d))
    .on('mousemove', moveTip)
    .on('mouseout', hideTip);

  // Top segment (high risk)
  g.selectAll('rect.r1').data(stacked).join('rect')
    .attr('class', 'r1')
    .attr('x', d => x(d.bin.x0))
    .attr('y', d => y(d.risk0 + d.risk1))
    .attr('width', d => bw(d.bin))
    .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))
    .attr('fill', theme.high)
    .on('mouseover', (e, d) => showTip(e, d))
    .on('mousemove', moveTip)
    .on('mouseout', hideTip);

  /* We place totals *inside* the plot area and clamp x so we never
     render a stray label outside the SVG (which looked like a “random 0”). */
  const midX   = d => (x(d.bin.x0) + x(d.bin.x1)) / 2;
  const clampX = v => Math.max(8, Math.min(innerWidth - 8, v));

  g.selectAll('text.total').data(stacked).join('text')
    .attr('class', 'total')
    .attr('x', d => clampX(midX(d)))
    .attr('y', d => y(d.risk0 + d.risk1) - 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10.5)
    .attr('fill', theme.text)
    .text(d => fmtInt(d.risk0 + d.risk1));

  // Axis labels: we render on the outer svg so they don’t scroll with g.
  svg.append('text')
    .attr('x', margin.left + innerWidth / 2)
    .attr('y', histHeight - 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', 14)
    .attr('fill', theme.text)
    .text('Age');

  svg.append('text')
    .attr('transform', `translate(${15},0) rotate(-90)`)
    .attr('x', -(margin.top + innerHeight / 2))
    .attr('y', 0)
    .attr('dy', '0.35em')
    .attr('text-anchor', 'middle')
    .attr('font-size', 14)
    .attr('fill', theme.text)
    .text('Number of People');

  /* We attach a brush only on the bottom strip so the main plot stays
     free for hover and the selection feels connected to the x-axis. */
  const brushHeight = 30;
  const brush = d3.brushX()
    .extent([[0, innerHeight], [innerWidth, innerHeight + brushHeight]])
    .on('end', brushed);

  const brushG = g.append('g').attr('class', 'brush').call(brush);

  // We support double-click to clear zoom because it’s fast and familiar.
  brushG.on('dblclick', () => {
    state.zoom.isZoomed = false;
    state.zoom.xDomain = null;
    handleSliderChange();
  });

  function brushed(event) {
    const sel = event.selection;
    if (sel) {
      const x0 = Math.round(x.invert(sel[0]));
      const x1 = Math.round(x.invert(sel[1]));
      state.zoom.isZoomed = true;
      state.zoom.xDomain = [x0, x1];
      brushG.call(brush.move, null);
      handleSliderChange();
    } else if (!state.zoom.isZoomed) {
      x.domain(originalDomain);
    }
  }
}

/* ========================= TOOLTIP =========================
   We keep tooltip behavior minimal: show on hover, follow cursor,
   and hide on out. Content uses the stacked bin we computed earlier. */
function showTip(e, d) {
  tooltip.style('visibility', 'visible').html(
    `<div class="tip-title">Age Bin Summary</div>
     <div><strong>Age range:</strong> ${d.bin.x0}–${d.bin.x1}</div><hr>
     <div><strong>Low Risk:</strong> ${fmtInt(d.risk0)}</div>
     <div><strong>High Risk:</strong> ${fmtInt(d.risk1)}</div>
     <div><strong>Total:</strong> ${fmtInt(d.risk0 + d.risk1)}</div>`
  );
  moveTip(e);
}
function moveTip(e) { tooltip.style('left', (e.pageX + 12) + 'px').style('top', (e.pageY + 12) + 'px'); }
function hideTip() { tooltip.style('visibility', 'hidden'); }

/* ========================= CONTROLS =========================
   We build all sliders once, remember their small recolor APIs,
   and wire each to update shared `state` + trigger a redraw. */
let sliderAlcohol, sliderSmoker, sliderSleep, sliderSteps;

function buildControlsOnce() {
  // We precompute the overall SVG height from our metrics to avoid magic numbers.
  const totalH = PAD + TRI_H + GAP + TRI_H + GAP + RANGE_H + GAP + RANGE_H + PAD;
  const svg = d3.select('#controls').append('svg')
    .attr('width', CTRL_W).attr('height', totalH);

  const g = svg.append('g').attr('transform', `translate(12,${PAD})`);
  let y = 0;

  sliderAlcohol = triSlider(g, {
    y, label: 'Alcohol',
    ticks: ['Non-drinkers', 'All', 'Drinkers only'],
    initial: state.alcoholMode,
    onChange: v => { state.alcoholMode = v; handleSliderChange(); }
  });
  y += TRI_H + GAP;

  sliderSmoker = triSlider(g, {
    y, label: 'Smoker',
    ticks: ['Non-smokers', 'All', 'Smokers only'],
    initial: state.smokerMode,
    onChange: v => { state.smokerMode = v; handleSliderChange(); }
  });
  y += TRI_H + GAP;

  sliderSleep = rangeSlider2(g, {
    y,
    label: 'Sleep Hours',
    domain: SLEEP_EXTENT,
    initial: state.sleepRange,
    valueFormat: v => d3.format('.1f')(v),           // we show 3.0 … 10.0 for clarity
    onChange: r => { state.sleepRange = r; handleSliderChange(); }
  });
  y += RANGE_H + -15; // we tighten spacing slightly here to compact the panel

  // (helper kept here in case we want snap-to-1k later)
  function snap(v, step, min, max) {
    const s = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, s));
  }

  sliderSteps = rangeSlider2(g, {
    y,
    label: 'Daily Steps',
    domain: STEPS_EXTENT,
    initial: state.stepsRange,
    valueFormat: v => `${d3.format(',.0f')(Math.round(v/1000))} K`, // we display 1 K … 20 K
    onChange: r => { state.stepsRange = r; handleSliderChange(); }
  });
}

/* ========================= THEME APPLY =========================
   We update document colors, recolor controls, and refresh the chart.
   We do it here so a theme toggle touches one place only. */
function applyTheme() {
  // body + chart text
  d3.select('body').style('background', theme.bodyBg).style('color', theme.text);

  // control panel outer box (single)
  const sidebar = d3.select('#sidebar');
  sidebar
    .style('background-color', theme.panelBG)
    .style('border-color', theme.panelStroke)
    .style('color', theme.text);

  // sliders recolor
  [sliderAlcohol, sliderSmoker, sliderSleep, sliderSteps].forEach(s => s?.recolor?.());

  // tooltip colors
  tooltip
    .style('background-color', theme.tooltipBg)
    .style('border-color', theme.tooltipBd)
    .style('color', theme.text);

  // we propagate theme colors into CSS custom properties used by the HTML
  const root = document.documentElement;
  root.style.setProperty('--panel-bg', theme.panelBG);
  root.style.setProperty('--panel-border', theme.panelStroke);

  handleSliderChange();
}

/* ========================= MAIN =========================
   We separate “compute filtered rows” from “draw” so both sliders and
   resize/zoom can reuse the same pipeline. */
function getFilteredRows() {
  const [sMin, sMax] = state.sleepRange;
  const [stMin, stMax] = state.stepsRange;
  return rowsAll.filter(d =>
    d.sleep >= sMin && d.sleep <= sMax &&
    d.steps >= stMin && d.steps <= stMax &&
    tri(d.alcohol, state.alcoholMode) &&
    tri(d.smoker, state.smokerMode)
  );
}
function handleSliderChange() { redrawHistogram(getFilteredRows()); }

buildControlsOnce();
applyTheme();

/* We flip theme objects and re-apply so everything recolors in place. */
document.getElementById('toggleTheme').addEventListener('click', () => {
  theme = theme.name === 'light' ? THEMES.dark : THEMES.light;
  applyTheme();
});
