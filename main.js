import { csvParse } from 'https://cdn.jsdelivr.net/npm/d3-dsv@3/+esm';


import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';


async function loadData() {
   try {
       const response = await fetch('./health_lifestyle_dataset.csv');
       const csvText = await response.text();
       const rows = csvParse(csvText);
       return rows;
   } catch (error) {
       console.error('Error loading data:', error);
   }


}




const data = await loadData();
console.log(data);


const svg = d3.select('#data')
   .append('svg')
   .attr('width', 800)
   .attr('height', 640)


const rowsWithAge = data
   .map(d => ({ ...d, ageNum: +d.age }))
   .filter(d => !Number.isNaN(d.ageNum));


if (rowsWithAge.length === 0) {
   console.warn('No numeric age values found; skipping age histogram.');
} else {
   const histWidth = 800;
   const histHeight = 440; // extra space for legend
   const margin = { top: 60, right: 20, bottom: 40, left: 50 }; // reserve top margin for legend
   const innerWidth = histWidth - margin.left - margin.right;
   const innerHeight = histHeight - margin.top - margin.bottom;


   const histSvg = d3.select('#data')
       .append('svg')
       .attr('width', histWidth)
       .attr('height', histHeight);


   const g = histSvg.append('g')
       .attr('transform', `translate(${margin.left},${margin.top})`);


   const x = d3.scaleLinear()
       .domain(d3.extent(rowsWithAge, d => d.ageNum))
       .nice()
       .range([0, innerWidth]);


   const bins = d3.bin()
       .domain(x.domain())
       .thresholds(20)
       .value(d => d.ageNum)(rowsWithAge);


   const y = d3.scaleLinear()
       .domain([0, d3.max(bins, d => d.length)])
       .nice()
       .range([innerHeight, 0]);


   g.append('g')
       .attr('transform', `translate(0,${innerHeight})`)
       .call(d3.axisBottom(x));


   g.append('g')
       .call(d3.axisLeft(y));


   // Compute stacked counts per bin
   const stacked = bins.map(b => {
       const risk0 = b.reduce((acc, row) => acc + (String(row.disease_risk) === '0' ? 1 : 0), 0);
       const risk1 = b.length - risk0; // assume only 0/1
       return { bin: b, risk0, risk1 };
   });


   const barWidth = (b) => Math.max(0, x(b.x1) - x(b.x0) - 1);


   // Bottom segment: disease_risk = 0
   g.selectAll('rect.risk0')
       .data(stacked)
       .join('rect')
       .attr('class', 'risk0')
       .attr('x', d => x(d.bin.x0))
       .attr('y', d => y(d.risk0))
       .attr('width', d => barWidth(d.bin))
       .attr('height', d => y(0) - y(d.risk0))
       .attr('fill', '#59a14f');


   // Top segment: disease_risk = 1
   g.selectAll('rect.risk1')
       .data(stacked)
       .join('rect')
       .attr('class', 'risk1')
       .attr('x', d => x(d.bin.x0))
       .attr('y', d => y(d.risk0 + d.risk1))
       .attr('width', d => barWidth(d.bin))
       .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))
       .attr('fill', '#e15759');


   // Add total count labels on top of each bar
   g.selectAll('text.bin-label')
       .data(stacked)
       .join('text')
       .attr('class', 'bin-label')
       .attr('x', d => x(d.bin.x0) + barWidth(d.bin) / 2)
       .attr('y', d => y(d.risk0 + d.risk1) - 5)
       .attr('text-anchor', 'middle')
       .attr('font-size', 11)
       .attr('font-weight', 'bold')
       .text(d => d.risk0 + d.risk1);


   // Axis labels
   histSvg.append('text')
       .attr('x', margin.left + innerWidth / 2)
       .attr('y', histHeight - 6)
       .attr('text-anchor', 'middle')
       .attr('font-size', 14)
       .text('Age');


   histSvg.append('text')
       .attr('transform', 'rotate(-90)')
       .attr('x', -(margin.top + innerHeight / 2))
       .attr('y', 15)
       .attr('text-anchor', 'middle')
       .attr('font-size', 14)
       .text('Number of People');


   // Legend
   const legend = histSvg.append('g')
       .attr('transform', `translate(${histWidth - 170}, 10)`);
   // Legend background
   const legendItems = [
       { label: 'Low Risk of Chronic Disease', color: '#59a14f' },
       { label: 'High Risk of Chronic Disease', color: '#e15759' }
   ];
   legend.selectAll('rect')
       .data(legendItems)
       .join('rect')
       .attr('x', 0)
       .attr('y', (d, i) => i * 20)
       .attr('width', 14)
       .attr('height', 14)
       .attr('fill', d => d.color);
   legend.selectAll('text')
       .data(legendItems)
       .join('text')
       .attr('x', 20)
       .attr('y', (d, i) => i * 20 + 12)
       .attr('font-size', 12)
       .text(d => d.label);
}
// julian adds in sliders 
if (Array.isArray(data) && data.length) {
  const sleepMinInput  = document.getElementById('sleep-min');
  const sleepMaxInput  = document.getElementById('sleep-max');
  const stepsMinInput  = document.getElementById('steps-min');
  const stepsMaxInput  = document.getElementById('steps-max');
  const sleepLabel     = document.getElementById('sleep-label');
  const stepsLabel     = document.getElementById('steps-label');

  // If sliders aren't in the page, just skip
  if (!sleepMinInput || !sleepMaxInput || !stepsMinInput || !stepsMaxInput) {
    console.warn('Slider elements not found; skipping interactive filter.');
  } else {
    // Parse the fields we need from the same CSV rows
    const rows = data.map(d => ({
      age:   +d.age,
      sleep: +d.sleep_hours,
      steps: +d.daily_steps,
      risk:  String(d.disease_risk)
    })).filter(d =>
      !Number.isNaN(d.age) &&
      !Number.isNaN(d.sleep) &&
      !Number.isNaN(d.steps)
    );

    if (!rows.length) {
      console.warn('No numeric rows for sleep/steps filtering.');
    } else {
      // Global ranges
      const sleepExtent = d3.extent(rows, d => d.sleep);
      const stepsExtent = d3.extent(rows, d => d.steps);
      const ageExtent   = d3.extent(rows, d => d.age);

      // Initialize sliders
      sleepMinInput.min  = sleepMaxInput.min  = sleepExtent[0];
      sleepMinInput.max  = sleepMaxInput.max  = sleepExtent[1];
      sleepMinInput.step = sleepMaxInput.step = 0.1;
      sleepMinInput.value = sleepExtent[0];
      sleepMaxInput.value = sleepExtent[1];

      stepsMinInput.min  = stepsMaxInput.min  = Math.floor(stepsExtent[0]);
      stepsMinInput.max  = stepsMaxInput.max  = Math.ceil(stepsExtent[1]);
      stepsMinInput.step = stepsMaxInput.step = 100;
      stepsMinInput.value = stepsMinInput.min;
      stepsMaxInput.value = stepsMaxInput.max;

      function getFilteredRows() {
        const sMin  = +sleepMinInput.value;
        const sMax  = +sleepMaxInput.value;
        const stMin = +stepsMinInput.value;
        const stMax = +stepsMaxInput.value;

        sleepLabel.textContent = `${sMin.toFixed(1)}–${sMax.toFixed(1)} h`;
        stepsLabel.textContent = `${stMin}–${stMax} steps`;

        return rows.filter(d =>
          d.sleep >= sMin && d.sleep <= sMax &&
          d.steps >= stMin && d.steps <= stMax
        );
      }

      function redrawHistogram(filteredRows) {
        const container = d3.select('#data');

        // Wipe whatever is there (old static chart)
        container.selectAll('*').remove();

        const histWidth = 800;
        const histHeight = 440;
        const margin = { top: 60, right: 20, bottom: 40, left: 50 };
        const innerWidth = histWidth - margin.left - margin.right;
        const innerHeight = histHeight - margin.top - margin.bottom;

        const histSvg = container.append('svg')
          .attr('width', histWidth)
          .attr('height', histHeight);

        const g = histSvg.append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

        // Age on x-axis (fixed to full range for consistency)
        const x = d3.scaleLinear()
          .domain(ageExtent)
          .nice()
          .range([0, innerWidth]);

        const bins = d3.bin()
          .domain(x.domain())
          .thresholds(20)
          .value(d => d.age)(filteredRows);

        const y = d3.scaleLinear()
          .domain([0, d3.max(bins, b => b.length) || 1])
          .nice()
          .range([innerHeight, 0]);

        g.append('g')
          .attr('transform', `translate(0,${innerHeight})`)
          .call(d3.axisBottom(x));

        g.append('g')
          .call(d3.axisLeft(y));

        // Stack disease risk like your original chart
        const stacked = bins.map(b => {
          const risk0 = b.reduce((acc, row) => acc + (row.risk === '0' ? 1 : 0), 0);
          const risk1 = b.length - risk0;
          return { bin: b, risk0, risk1 };
        });

        const barWidth = (b) => Math.max(0, x(b.x1) - x(b.x0) - 1);

        // low risk
        g.selectAll('rect.risk0')
          .data(stacked)
          .join('rect')
          .attr('class', 'risk0')
          .attr('x', d => x(d.bin.x0))
          .attr('y', d => y(d.risk0))
          .attr('width', d => barWidth(d.bin))
          .attr('height', d => y(0) - y(d.risk0))
          .attr('fill', '#59a14f');

        // high risk
        g.selectAll('rect.risk1')
          .data(stacked)
          .join('rect')
          .attr('class', 'risk1')
          .attr('x', d => x(d.bin.x0))
          .attr('y', d => y(d.risk0 + d.risk1))
          .attr('width', d => barWidth(d.bin))
          .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))
          .attr('fill', '#e15759');

        // labels
        g.selectAll('text.bin-label')
          .data(stacked)
          .join('text')
          .attr('class', 'bin-label')
          .attr('x', d => x(d.bin.x0) + barWidth(d.bin) / 2)
          .attr('y', d => y(d.risk0 + d.risk1) - 5)
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('font-weight', 'bold')
          .text(d => d.risk0 + d.risk1);

        // axis labels
        histSvg.append('text')
          .attr('x', margin.left + innerWidth / 2)
          .attr('y', histHeight - 6)
          .attr('text-anchor', 'middle')
          .attr('font-size', 14)
          .text('Age');

        histSvg.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('x', -(margin.top + innerHeight / 2))
          .attr('y', 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', 14)
          .text('Number of People');

        // legend
        const legend = histSvg.append('g')
          .attr('transform', `translate(${histWidth - 170}, 10)`);

        const legendItems = [
          { label: 'Low Risk of Chronic Disease', color: '#59a14f' },
          { label: 'High Risk of Chronic Disease', color: '#e15759' }
        ];

        legend.selectAll('rect')
          .data(legendItems)
          .join('rect')
          .attr('x', 0)
          .attr('y', (d, i) => i * 20)
          .attr('width', 14)
          .attr('height', 14)
          .attr('fill', d => d.color);

        legend.selectAll('text')
          .data(legendItems)
          .join('text')
          .attr('x', 20)
          .attr('y', (d, i) => i * 20 + 12)
          .attr('font-size', 12)
          .text(d => d.label);
      }

      function handleSliderChange() {
        const filtered = getFilteredRows();
        redrawHistogram(filtered);
      }

      // Update on drag
      [sleepMinInput, sleepMaxInput, stepsMinInput, stepsMaxInput].forEach(el =>
        el.addEventListener('input', handleSliderChange)
      );

      // Initial draw with full ranges
      handleSliderChange();
    }
  }
}





