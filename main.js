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

const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('visibility', 'hidden')
    .style('position', 'absolute')
    .style('background-color', 'white')
    .style('padding', '10px')
    .style('border', '1px solid black')
    .style('border-radius', '5px')
    .style('pointer-events', 'none');



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

      // Store zoom state across slider changes
      let zoomState = {
        isZoomed: false,
        xDomain: null
      };

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

        // Age on x-axis (either zoomed or full range)
        const x = d3.scaleLinear()
          .range([0, innerWidth]);
        
        if (zoomState.isZoomed && zoomState.xDomain) {
          x.domain(zoomState.xDomain);
        } else {
          x.domain(ageExtent).nice();
        }
        
        // Store original x domain for reset
        const originalXDomain = x.domain().slice();

        // Create bins based on zoom state
        let bins, binThresholds;
        if (zoomState.isZoomed && zoomState.xDomain) {
          // If zoomed, create fine-grained bins
          const [x0, x1] = zoomState.xDomain;
          const dataInRange = filteredRows.filter(d => d.age >= x0 && d.age <= x1);
          binThresholds = Math.ceil(x1 - x0);
          bins = d3.bin()
            .domain([x0, x1])
            .thresholds(binThresholds)
            .value(d => d.age)(dataInRange);
        } else {
          // Normal view
          bins = d3.bin()
            .domain(x.domain())
            .thresholds(20)
            .value(d => d.age)(filteredRows);
        }

        const y = d3.scaleLinear()
          .domain([0, d3.max(bins, b => b.length) || 1])
          .nice()
          .range([innerHeight, 0]);

        g.append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${innerHeight})`)
          .call(d3.axisBottom(x));

        g.append('g')
          .attr('class', 'y-axis')
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
          .attr('fill', '#59a14f')
          .on('mouseover', (event, d) => {
            tooltip.style('visibility', 'visible')
              .style('left', event.pageX + 'px')
              .style('top', event.pageY + 'px')
              .html(`<b>Range:</b> ${d.bin.x0} - ${d.bin.x1}<br><b>Low Risk of Chronic Disease:</b> ${d.risk0}<br><b>High Risk of Chronic Disease:</b> ${d.risk1}`);
          })
          .on('mousemove', (event) => {
            tooltip.style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY + 10 + 'px');
          })
          .on('mouseout', () => {
            tooltip.style('visibility', 'hidden');
          });

        // high risk
        g.selectAll('rect.risk1')
          .data(stacked)
          .join('rect')
          .attr('class', 'risk1')
          .attr('x', d => x(d.bin.x0))
          .attr('y', d => y(d.risk0 + d.risk1))
          .attr('width', d => barWidth(d.bin))
          .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))
          .attr('fill', '#e15759')
          .on('mouseover', (event, d) => {
            tooltip.style('visibility', 'visible')
              .style('left', event.pageX + 'px')
              .style('top', event.pageY + 'px')
              .html(`<b>Range:</b> ${d.bin.x0} - ${d.bin.x1}<br><b>Low Risk of Chronic Disease:</b> ${d.risk0}<br><b>High Risk of Chronic Disease:</b> ${d.risk1}`);
          })
          .on('mousemove', (event) => {
            tooltip.style('left', event.pageX + 10 + 'px')
              .style('top', event.pageY + 10 + 'px');
          })
          .on('mouseout', () => {
            tooltip.style('visibility', 'hidden');
          });

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

        // Add brush for selection on x-axis 
        const brushHeight = 30;
        const brush = d3.brushX()
          .extent([[0, innerHeight], [innerWidth, innerHeight + brushHeight]])
          .on('end', brushed);

        const brushG = g.append('g')
          .attr('class', 'brush')
          .call(brush);

        // Add double-click to reset brush
        brushG.on('dblclick', function() {
          zoomState.isZoomed = false;
          zoomState.xDomain = null;
          // Trigger full redraw
          if (window.handleSliderChange) {
            window.handleSliderChange();
          }
        });

        function brushed(event) {
          const selection = event.selection;
          let filteredData;
          let newBins;
          
          if (selection) {
            // Round to nearest whole number
            const x0 = Math.round(x.invert(selection[0]));
            const x1 = Math.round(x.invert(selection[1]));
            
            // Update x scale domain to selected range
            x.domain([x0, x1]);
            zoomState.isZoomed = true;
            zoomState.xDomain = [x0, x1];
            
            // Filter raw data points in selection
            const dataInRange = filteredRows.filter(d => d.age >= x0 && d.age <= x1);
            
            // Create new bins with width of 1
            const numBins = Math.ceil(x1 - x0);
            newBins = d3.bin()
              .domain([x0, x1])
              .thresholds(numBins)
              .value(d => d.age)(dataInRange);
            
            // Recreate stacked data with new bins
            filteredData = newBins.map(b => {
              const risk0 = b.reduce((acc, row) => acc + (row.risk === '0' ? 1 : 0), 0);
              const risk1 = b.length - risk0;
              return { bin: b, risk0, risk1 };
            });
          } else if (!zoomState.isZoomed) {
            // Only reset if we're not zoomed
            // Reset x scale to original domain
            x.domain(originalXDomain);
            zoomState.xDomain = null;
            
            // Reset to show all data with original bins
            filteredData = stacked;
          } else {
            // We're clearing the brush after zooming
            return;
          }

          // Update x-axis
          g.select('.x-axis')
            .transition()
            .duration(300)
            .call(d3.axisBottom(x));

          // Clear brush selection after zooming
          if (selection) {
            brushG.call(brush.move, null);
          }

          // Update y scale based on filtered data
          const maxCount = d3.max(filteredData, d => d.risk0 + d.risk1) || 0;
          y.domain([0, maxCount]).nice();

          // Update y-axis
          g.select('.y-axis')
            .transition()
            .duration(300)
            .call(d3.axisLeft(y));

          // Update risk0 bars
          g.selectAll('rect.risk0')
            .data(filteredData, d => d.bin.x0)
            .join(
              enter => enter.append('rect')
                .attr('class', 'risk0')
                .attr('x', d => x(d.bin.x0))
                .attr('y', innerHeight)
                .attr('width', d => barWidth(d.bin))
                .attr('height', 0)
                .attr('fill', '#59a14f')
                .on('mouseover', (event, d) => {
                  tooltip.style('visibility', 'visible')
                    .style('left', event.pageX + 'px')
                    .style('top', event.pageY + 'px')
                    .html(`<b>Range:</b> ${d.bin.x0} - ${d.bin.x1}<br><b>Low Risk of Chronic Disease:</b> ${d.risk0}<br><b>High Risk of Chronic Disease:</b> ${d.risk1}`);
                })
                .on('mousemove', (event) => {
                  tooltip.style('left', event.pageX + 10 + 'px')
                    .style('top', event.pageY + 10 + 'px');
                })
                .on('mouseout', () => {
                  tooltip.style('visibility', 'hidden');
                })
                .call(enter => enter.transition()
                  .duration(300)
                  .attr('y', d => y(d.risk0))
                  .attr('height', d => y(0) - y(d.risk0))),
              update => update
                .call(update => update.transition()
                  .duration(300)
                  .attr('x', d => x(d.bin.x0))
                  .attr('y', d => y(d.risk0))
                  .attr('width', d => barWidth(d.bin))
                  .attr('height', d => y(0) - y(d.risk0))),
              exit => exit
                .call(exit => exit.transition()
                  .duration(300)
                  .attr('y', innerHeight)
                  .attr('height', 0)
                  .remove())
            );

          // Update risk1 bars
          g.selectAll('rect.risk1')
            .data(filteredData, d => d.bin.x0)
            .join(
              enter => enter.append('rect')
                .attr('class', 'risk1')
                .attr('x', d => x(d.bin.x0))
                .attr('y', d => y(d.risk0 + d.risk1))
                .attr('width', d => barWidth(d.bin))
                .attr('height', 0)
                .attr('fill', '#e15759')
                .on('mouseover', (event, d) => {
                  tooltip.style('visibility', 'visible')
                    .style('left', event.pageX + 'px')
                    .style('top', event.pageY + 'px')
                    .html(`<b>Range:</b> ${d.bin.x0} - ${d.bin.x1}<br><b>Low Risk of Chronic Disease:</b> ${d.risk0}<br><b>High Risk of Chronic Disease:</b> ${d.risk1}`);
                })
                .on('mousemove', (event) => {
                  tooltip.style('left', event.pageX + 10 + 'px')
                    .style('top', event.pageY + 10 + 'px');
                })
                .on('mouseout', () => {
                  tooltip.style('visibility', 'hidden');
                })
                .call(enter => enter.transition()
                  .duration(300)
                  .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))),
              update => update
                .call(update => update.transition()
                  .duration(300)
                  .attr('x', d => x(d.bin.x0))
                  .attr('y', d => y(d.risk0 + d.risk1))
                  .attr('width', d => barWidth(d.bin))
                  .attr('height', d => y(d.risk0) - y(d.risk0 + d.risk1))),
              exit => exit
                .call(exit => exit.transition()
                  .duration(300)
                  .attr('y', d => y(d.risk0 + d.risk1))
                  .attr('height', 0)
                  .remove())
            );

          // Update labels
          g.selectAll('text.bin-label')
            .data(filteredData, d => d.bin.x0)
            .join(
              enter => enter.append('text')
                .attr('class', 'bin-label')
                .attr('x', d => x(d.bin.x0) + barWidth(d.bin) / 2)
                .attr('y', d => y(d.risk0 + d.risk1) - 5)
                .attr('text-anchor', 'middle')
                .attr('font-size', 11)
                .attr('font-weight', 'bold')
                .attr('opacity', 0)
                .text(d => d.risk0 + d.risk1)
                .call(enter => enter.transition()
                  .duration(300)
                  .attr('opacity', 1)),
              update => update
                .call(update => update.transition()
                  .duration(300)
                  .attr('x', d => x(d.bin.x0) + barWidth(d.bin) / 2)
                  .attr('y', d => y(d.risk0 + d.risk1) - 5)
                  .text(d => d.risk0 + d.risk1)),
              exit => exit
                .call(exit => exit.transition()
                  .duration(300)
                  .attr('opacity', 0)
                  .remove())
            );
        }

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

      // Expose handleSliderChange so brush reset can trigger full redraw
      window.handleSliderChange = handleSliderChange;

      // Update on drag
      [sleepMinInput, sleepMaxInput, stepsMinInput, stepsMaxInput].forEach(el =>
        el.addEventListener('input', handleSliderChange)
      );

      // Initial draw with full ranges
      handleSliderChange();
    }
  }
}

