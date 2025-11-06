import { csvParse } from 'https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

/* ========================= THEME ========================= */
// We define two color themes (light and dark). Each controls page colors,
// chart styles, and slider appearance. We switch between them later.
const THEMES = {
  light: {
    name: 'light',
    bodyBg: '#ffffff',
    text:   '#0c0d10',
    axis:   '#d6dbe3',
    low:  '#59a14f',
    high: '#e15759',
    sliderLine:  '#0c0d10',
    sliderThumb: '#0c0d10',
    label:       '#0c0d10',
    panelBG:     '#f7f8fa',
    panelStroke: '#e6e8ee'
  },
  dark: {
    name: 'dark',
    bodyBg: '#0d0f12',
    text:   '#f5f7fa',
    axis:   '#262b31',
    low:  '#59a14f',
    high: '#e15759',
    sliderLine:  '#f0f3f7',
    sliderThumb: '#ffffff',
    label:       '#f5f7fa',
    panelBG:     '#14161b',
    panelStroke: '#23262d'
  }
};
let theme = THEMES.light;

/* ========================= DATA ========================= */
// We load the CSV file, parse it, and return the rows.
async function loadData() {
  try {
    const res = await fetch('./health_lifestyle_dataset.csv');
    const text = await res.text();
    return csvParse(text);
  } catch (e) {
    console.error('Load error:', e);
    return [];
  }
}
const raw = await loadData();

// We convert numeric columns and filter out missing values.
function prep(rows) {
  return rows.map(d => ({
    ...d,
    ageNum: +d.age,
    risk: +d.disease_risk || 0,
    alcohol: +d.alcohol || 0,
    smoker: +d.smoker || 0
  })).filter(d => Number.isFinite(d.ageNum));
}
const data = prep(raw);

/* ========================= STATE ========================= */
// We store current filter settings for alcohol and smoking.
// Each slider returns 0, 1, or 2 depending on user choice.
const state = {
  alcoholMode: 1,
  smokerMode:  1
};

// This helper filters data based on slider positions.
const tri = (flag, mode) => (mode === 1 ? true : (mode === 0 ? +flag === 0 : +flag === 1));
const filtered = () => data.filter(d => tri(d.alcohol, state.alcoholMode) && tri(d.smoker, state.smokerMode));

/* ===================== CONTROLS (ONE SVG) ===================== */
// We make one SVG panel to hold both sliders and the theme toggle.
const CTRL_W = 840;
const SLIDER_H = 56;
const SWITCH_H = 40;
const PAD = 14;

const controlsRoot = d3.select('#controls');
let controlsSvg, panelRect;
let sliderAlcohol, sliderSmoker, themeSwitch;

function buildControlsOnce() {
  // We compute the height so it fits exactly around controls.
  const totalH = PAD + SLIDER_H + SLIDER_H + SWITCH_H + PAD;
  controlsSvg = controlsRoot.append('svg')
    .attr('width', CTRL_W)
    .attr('height', totalH);

  // This rectangle is the background of the controls panel.
  panelRect = controlsSvg.append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', CTRL_W)
    .attr('height', totalH)
    .attr('rx', 12)
    .attr('fill', theme.panelBG)
    .attr('stroke', theme.panelStroke);

  const g = controlsSvg.append('g').attr('transform', `translate(8,${PAD})`);

  // First slider controls Alcohol filter.
  sliderAlcohol = triSlider(g, {
    y: 0,
    label: 'Alcohol',
    ticks: ['Non-drinkers', 'All', 'Drinkers only'],
    initial: state.alcoholMode,
    onChange: v => { state.alcoholMode = v; renderHistogram(filtered()); }
  });

  // Second slider controls Smoker filter.
  sliderSmoker = triSlider(g, {
    y: SLIDER_H,
    label: 'Smoker',
    ticks: ['Non-smokers', 'All', 'Smokers only'],
    initial: state.smokerMode,
    onChange: v => { state.smokerMode = v; renderHistogram(filtered()); }
  });

  // Theme switch button toggles between light/dark.
  themeSwitch = themeButton(g, {
    y: SLIDER_H + SLIDER_H + 8,
    onToggle: () => {
      theme = (theme.name === 'light') ? THEMES.dark : THEMES.light;
      applyTheme();
    }
  });
}

/* ========== TRI-SLIDER COMPONENT ========== */
// We build one 3-position slider (values 0,1,2) drawn entirely in D3.
function triSlider(parentG, { y, label, ticks, initial = 1, onChange }) {
  const width = CTRL_W - 16;
  const lineY = y + 22;
  const x = d3.scaleLinear().domain([0,2]).range([0, width - 16]);

  // We add the slider label above the line.
  const lbl = parentG.append('text')
    .attr('x', 0).attr('y', y)
    .attr('dy', '0.9em')
    .attr('font-size', 12)
    .attr('fill', theme.label)
    .text(label);

  // We draw the main slider line.
  const track = parentG.append('line')
    .attr('x1', 0).attr('x2', x(2))
    .attr('y1', lineY).attr('y2', lineY)
    .attr('stroke', theme.sliderLine)
    .attr('stroke-width', 2);

  // We place three labels under the line for the slider positions.
  const tickLbls = parentG.selectAll(null)
    .data([0,1,2]).enter().append('text')
    .attr('x', d => x(d))
    .attr('y', lineY + 18)
    .attr('text-anchor', d => d === 0 ? 'start' : d === 2 ? 'end' : 'middle')
    .attr('font-size', 11)
    .attr('fill', theme.label)
    .text((d,i) => ticks[i]);

  // The circular knob the user moves.
  const handle = parentG.append('circle')
    .attr('r', 7)
    .attr('cx', x(initial))
    .attr('cy', lineY)
    .attr('fill', theme.sliderThumb)
    .style('cursor', 'grab');

  // When user drags or clicks, we snap to the nearest position.
  function setValue(v) {
    const vv = Math.max(0, Math.min(2, Math.round(v)));
    handle.attr('cx', x(vv));
    onChange(vv);
  }

  // Click to move the knob.
  parentG.append('rect')
    .attr('x', -6).attr('y', lineY - 10)
    .attr('width', x(2) + 12).attr('height', 20)
    .attr('fill', 'transparent')
    .style('cursor','pointer')
    .on('click', (e) => {
      const [px] = d3.pointer(e, parentG.node());
      setValue(x.invert(Math.max(0, Math.min(x(2), px))));
    });

  // Dragging logic for the knob.
  handle.call(d3.drag()
    .on('drag', (e) => handle.attr('cx', Math.max(0, Math.min(x(2), e.x))))
    .on('end', () => setValue(x.invert(+handle.attr('cx'))))
  );

  // Function we call to recolor this slider when the theme changes.
  function recolor() {
    lbl.attr('fill', theme.label);
    tickLbls.attr('fill', theme.label);
    track.attr('stroke', theme.sliderLine);
    handle.attr('fill', theme.sliderThumb);
  }

  return { recolor, setValue };
}

/* ========== THEME BUTTON COMPONENT ========== */
// This creates the theme toggle at the bottom of the control panel.
function themeButton(parentG, { y, onToggle }) {
  const w = 160, h = 28, rx = 8;

  const btn = parentG.append('g')
    .attr('transform', `translate(0,${y})`)
    .style('cursor','pointer')
    .on('click', onToggle);

  const rect = btn.append('rect')
    .attr('width', w).attr('height', h).attr('rx', rx)
    .attr('fill', theme.panelBG).attr('stroke', theme.panelStroke);

  const txt = btn.append('text')
    .attr('x', 10).attr('y', 18)
    .attr('font-size', 12)
    .attr('fill', theme.text)
    .text(`Theme: ${theme.name === 'light' ? 'Light' : 'Dark'}`);

  const note = parentG.append('text')
    .attr('x', CTRL_W - 24).attr('y', y + 18)
    .attr('text-anchor','end')
    .attr('font-size', 11)
    .attr('fill', theme.label)
    .text('Switch theme');

  function recolor() {
    rect.attr('fill', theme.panelBG).attr('stroke', theme.panelStroke);
    txt.attr('fill', theme.text).text(`Theme: ${theme.name === 'light' ? 'Light' : 'Dark'}`);
    note.attr('fill', theme.label);
  }

  return { recolor };
}

/* ===================== HISTOGRAM ===================== */
// We build a stacked bar chart of ages showing low/high risk counts.
function renderHistogram(rows) {
  // Clear any old chart before drawing a new one.
  d3.select('#data').selectAll('svg.hist').remove();

  const histWidth = 800;
  const histHeight = 440;
  const margin = { top: 60, right: 20, bottom: 40, left: 60 };
  const innerWidth = histWidth - margin.left - margin.right;
  const innerHeight = histHeight - margin.top - margin.bottom;

  const histSvg = d3.select('#data').append('svg')
    .attr('class', 'hist')
    .attr('width', histWidth)
    .attr('height', histHeight);

  const g = histSvg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // If no data fits the filters, show a message.
  if (rows.length === 0) {
    histSvg.append('text')
      .attr('x', histWidth/2).attr('y', histHeight/2)
      .attr('text-anchor','middle').attr('font-size', 14)
      .attr('fill', theme.text)
      .text('No data for current filters');
    return;
  }

  // We set up scales for age (x) and count (y).
  const x = d3.scaleLinear().domain(d3.extent(rows, d => d.ageNum)).nice().range([0, innerWidth]);
  const bins = d3.bin().domain(x.domain()).thresholds(20).value(d => d.ageNum)(rows);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([innerHeight, 0]);

  // Draw axes and color them to match the theme.
  const gx = g.append('g').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(x));
  gx.selectAll('text').attr('fill', theme.text);
  gx.selectAll('line,path').attr('stroke', theme.axis);

  const gy = g.append('g').call(d3.axisLeft(y));
  gy.selectAll('text').attr('fill', theme.text);
  gy.selectAll('line,path').attr('stroke', theme.axis);

  // We count how many low/high risk people fall into each age bin.
  const stacked = bins.map(b => {
    const risk0 = b.reduce((acc, r) => acc + (r.risk === 0 ? 1 : 0), 0);
    const risk1 = b.length - risk0;
    return { bin: b, risk0, risk1 };
  });

  const bw = (b) => Math.max(0, x(b.x1) - x(b.x0) - 1);

  // Bottom half (low risk).
  g.selectAll('rect.r0').data(stacked).join('rect')
    .attr('class','r0')
    .attr('x', d => x(d.bin.x0))
    .attr('y', d => y(d.risk0))
    .attr('width', d => bw(d.bin))
    .attr('height', d => y(0) - y(d.risk0))
    .attr('fill', theme.low);

  // Top half (high risk).
  g.selectAll('rect.r1').data(stacked).join('rect')
    .attr('class','r1')
    .attr('x', d => x(d.bin.x0))
    .attr('y', d => y(d.risk0 + d.risk1))
    .attr('width', d => bw(d.bin))
    .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))
    .attr('fill', theme.high);

  // Count labels on each bar.
  g.selectAll('text.bin-lbl').data(stacked).join('text')
    .attr('class','bin-lbl')
    .attr('x', d => x(d.bin.x0) + bw(d.bin)/2)
    .attr('y', d => y(d.risk0 + d.risk1) - 5)
    .attr('text-anchor','middle')
    .attr('font-size', 11)
    .attr('font-weight', 'bold')
    .attr('fill', theme.text)
    .text(d => d.risk0 + d.risk1);

  // Axis labels.
  histSvg.append('text')
    .attr('x', margin.left + innerWidth/2)
    .attr('y', histHeight - 6)
    .attr('text-anchor','middle')
    .attr('font-size', 14)
    .attr('fill', theme.text)
    .text('Age');

  // Y-axis label positioned for clarity.
  const yLabelOffset = 18;
  histSvg.append('text')
    .attr('transform', `translate(${yLabelOffset},0) rotate(-90)`)
    .attr('x', -(margin.top + innerHeight / 2))
    .attr('y', 0)
    .attr('dy', '0.35em')
    .attr('text-anchor','middle')
    .attr('font-size', 14)
    .attr('fill', theme.text)
    .text('Number of People');

  // We add a legend to identify the color meanings.
  const legend = histSvg.append('g').attr('transform', `translate(${histWidth - 210}, 10)`);
  const items = [
    { label: 'Low Risk of Chronic Disease',  color: theme.low },
    { label: 'High Risk of Chronic Disease', color: theme.high }
  ];

  legend.selectAll('rect').data(items).join('rect')
    .attr('x', 0).attr('y', (_,i)=>i*20)
    .attr('width', 14).attr('height', 14)
    .attr('fill', d => d.color);

  legend.selectAll('text').data(items).join('text')
    .attr('x', 20).attr('y', (_,i)=>i*20+12)
    .attr('font-size', 12)
    .attr('fill', theme.text)
    .text(d => d.label);
}

/* ===================== THEME APPLY ===================== */
// We recolor everything whenever the theme changes.
function applyTheme() {
  d3.select('body')
    .style('background', theme.bodyBg)
    .style('color', theme.text);

  // Update control panel colors.
  panelRect.attr('fill', theme.panelBG).attr('stroke', theme.panelStroke);

  // Update each slider and the theme toggle.
  sliderAlcohol.recolor();
  sliderSmoker.recolor();
  themeSwitch.recolor();

  // Redraw chart with new colors.
  renderHistogram(filtered());
}

/* ============ MAIN ENTRY ============ */
// We build the controls once, then apply the initial theme and render.
buildControlsOnce();
applyTheme();
