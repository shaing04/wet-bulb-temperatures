import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const svgSD = d3.select('#map-sd');
const widthSD = +svgSD.attr('width');
const heightSD = +svgSD.attr('height');

// Load CA counties + SD data
Promise.all([
  d3.json('data/california-counties.geojson'),
  d3.json('data/wetbulb_max_ca.json'),
]).then(([caTopo, caData]) => {
  // Extract San Diego only
  const sanDiego = caTopo.features.find(
    (f) => f.properties.name === 'San Diego',
  );
  if (!sanDiego) {
    console.error('San Diego not found in CA topojson');
    return;
  }

  // Projection
  const projectionSD = d3.geoMercator().fitSize([widthSD, heightSD], sanDiego);

  const pathSD = d3.geoPath().projection(projectionSD);

  // Years (same as CA)
  const yearsSD = d3.range(2025, 2101, 15);
  const dataByYearSD = d3.group(caData, (d) => d.year);

  const yearTextSD = {
    2025: 'San Diego begins the century relatively cool.',
    2040: 'Interior regions warm faster than coastal zones.',
    2055: 'Significant increases in wet-bulb heat.',
    2070: 'Dangerous heat events become more common.',
    2085: 'High-risk periods throughout summer.',
    2100: 'San Diego approaches critical wet-bulb thresholds.',
  };

  const textSD = d3.select('#text-sd');

  yearsSD.forEach((year) => {
    textSD
      .append('div')
      .attr('class', 'step')
      .attr('data-year', year)
      .html(`<strong>Year ${year}</strong><br>${yearTextSD[year]}`);
  });

  // Colors (reuse CA’s color map)
  const bins = [10, 14, 18, 22, 26, 30];
  const colors = [
    '#f7f4f9',
    '#d4aedd',
    '#c994c7',
    '#dc74b4',
    '#e81f87',
    '#d3004d',
  ];
  const colorScale = d3
    .scaleOrdinal()
    .domain(d3.range(bins.length))
    .range(colors);

  const tooltip = d3.select('#tooltip');

  // Draw San Diego
  function drawSD(year) {
    const yearData = dataByYearSD.get(year);
    const val =
      yearData?.find((d) => d.county === 'San Diego')?.wetbulb_C ?? null;

    let binIndex = bins.findIndex((b) => val < b);
    if (binIndex === -1) binIndex = bins.length - 1;

    svgSD
      .selectAll('path')
      .data([sanDiego])
      .join('path')
      .attr('d', pathSD)
      .attr('stroke', '#333')
      .attr('fill', val !== null ? colorScale(binIndex) : '#ccc')
      .on('mouseover', (event) => {
        tooltip.style('opacity', 1).html(`
          <strong>San Diego County</strong><br/>
          Year: ${year}<br/>
          Wet-bulb: ${val ?? 'No data'}°C
        `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', event.pageX + 15 + 'px')
          .style('top', event.pageY + 15 + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));
  }

  // Legend for SD
  function drawLegendSD() {
    const legend = d3.select('#sd-legend');

    const labels = bins.map((b, i) =>
      i === 0 ? `< ${b}` : `${bins[i - 1]} – ${b}`,
    );
    labels.push(`≥ ${bins[bins.length - 1]}`);

    const items = legend
      .selectAll('.legend-item')
      .data(labels)
      .join('div')
      .attr('class', 'legend-item');

    items
      .selectAll('.legend-color')
      .data((d, i) => [i])
      .join('div')
      .attr('class', 'legend-color')
      .style('background-color', (i) => colors[i]);

    items
      .selectAll('.legend-label')
      .data((d) => [d])
      .join('span')
      .attr('class', 'legend-label')
      .text((d) => d);
  }

  drawLegendSD();
  drawSD(yearsSD[0]);

  // Scrollama
  const scrollerSD = scrollama();

  scrollerSD
    .setup({
      container: '#scrolly-sd',
      step: '#text-sd .step',
      offset: 0.5,
    })
    .onStepEnter((response) => {
      const year = +d3.select(response.element).attr('data-year');
      drawSD(year);
    });

  window.addEventListener('resize', scrollerSD.resize);
});

const svgCA = d3.select('#map-ca');
const width = +svgCA.attr('width');
const height = +svgCA.attr('height');

Promise.all([
  d3.json('data/california-counties.geojson'),
  d3.json('data/wetbulb_max_ca.json'),
]).then(([caCounties, caData]) => {
  // -----------------------------
  // 1. Prepare years & steps
  // -----------------------------
  const years = d3.range(2025, 2101, 15); // 2025, 2040, ...

  // Custom text for each year
  const yearText = {
    2025: 'Most counties sit well below 22 degrees Celcius, excluding.',
    2040: 'Central Valley and inland areas start seeing rising heat.',
    2055: 'Significant jump: many counties exceed 22°C wet-bulb temperatures.',
    2070: 'Coastal areas also show notable warming.',
    2085: 'Record highs in southern California, heat risk increases.',
    2100: 'Critical levels approached in multiple counties; dangerous conditions.',
  };

  const textContainer = d3.select('#text');

  years.forEach((year) => {
    textContainer
      .append('div')
      .attr('class', 'step')
      .attr('data-year', year)
      .html(`<strong>Year ${year}</strong><br/>${yearText[year] || ''}`)
      .style('margin-bottom', '200px');
  });

  const dataByYear = d3.group(caData, (d) => d.year);

  // -----------------------------
  // 2. Projection & path
  // -----------------------------
  const projection = d3.geoMercator().fitSize([width, height], caCounties);
  const path = d3.geoPath().projection(projection);

  // -----------------------------
  // 3. Bins & colors
  // -----------------------------
  const bins = [10, 14, 18, 22, 26, 30];
  const colors = [
    '#f7f4f9',
    '#d4aedd',
    '#c994c7',
    '#dc74b4',
    '#e81f87',
    '#d3004d',
  ];
  const colorScale = d3
    .scaleOrdinal()
    .domain(d3.range(bins.length))
    .range(colors);

  // Tooltip
  const tooltip = d3.select('#tooltip');

  // -----------------------------
  // 4. Legend
  // -----------------------------
  function drawLegend() {
    const legend = d3.select('#ca-legend');

    const binLabels = bins.map((b, i) =>
      i === 0 ? `< ${b}` : `${bins[i - 1]} – ${b}`,
    );
    binLabels.push(`≥ ${bins[bins.length - 1]}`);

    const items = legend
      .selectAll('.legend-item')
      .data(binLabels)
      .join('div')
      .attr('class', 'legend-item');

    items
      .selectAll('.legend-color')
      .data((d, i) => [i])
      .join('div')
      .attr('class', 'legend-color')
      .style('background-color', (i) => colors[i] || colors[colors.length - 1]);

    items
      .selectAll('.legend-label')
      .data((d) => [d])
      .join('span')
      .attr('class', 'legend-label')
      .text((d) => d);
  }

  drawLegend();

  // -----------------------------
  // 5. Draw map and tooltip
  // -----------------------------
  function drawCA(year) {
    const yearData = dataByYear.get(year);
    if (!yearData) return;

    const countyTemps = {};
    yearData.forEach((d) => (countyTemps[d.county] = d.wetbulb_C));

    caCounties.features.forEach((f) => {
      const value = countyTemps[f.properties.name] ?? null;
      let binIndex = bins.findIndex((b) => value < b);
      if (binIndex === -1) binIndex = bins.length - 1;
      f.properties.bin = binIndex;
      f.properties.value = value; // exact wet-bulb
      f.properties.year = year; // current year
    });

    const paths = svgCA
      .selectAll('path')
      .data(caCounties.features, (d) => d.properties.name);

    paths
      .enter()
      .append('path')
      .merge(paths)
      .attr('d', path)
      .attr('stroke', '#999')
      .attr('fill', (d) => colorScale(d.properties.bin))
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1).html(`
        <strong>${d.properties.name}</strong><br/>
        Year: ${d.properties.year}<br/>
        Wet-Bulb Temp: ${d.properties.value}°C
      `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', event.pageX + 15 + 'px')
          .style('top', event.pageY + 15 + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    paths.exit().remove();
  }

  // -----------------------------
  // 6. Update dynamic stats
  // -----------------------------
  function updateStats(year) {
    const yearData = dataByYear.get(year);
    if (!yearData) return;
    const avgTemp = d3.mean(yearData, (d) => d.wetbulb_C).toFixed(1);
    d3.select('#scrolly-ca p').text(
      `In ${year}, California's average Wet-Bulb Temperature is ${avgTemp}°C.`,
    );
  }

  // -----------------------------
  // 7. Initial render
  // -----------------------------
  drawCA(years[0]);
  updateStats(years[0]);

  // -----------------------------
  // 8. Scrollama setup
  // -----------------------------
  const scroller = scrollama();

  scroller
    .setup({
      container: '#scrolly-ca',
      step: '#text .step',
      offset: 0.5,
    })
    .onStepEnter((response) => {
      const year = +d3.select(response.element).attr('data-year');
      drawCA(year);
      updateStats(year);
    });

  window.addEventListener('resize', scroller.resize);
});

// =============================
// LOAD US MAP + DATA
// =============================
const svgUS = d3.select('#map-us');
const widthUS = +svgUS.attr('width');
const heightUS = +svgUS.attr('height');

Promise.all([
  d3.json('data/us-states.json'),
  d3.json('data/wetbulb_max_us_regions.json'),
]).then(([usGeo, usData]) => {
  const yearsUS = d3.range(2020, 2101, 10); // or whatever interval you saved

  const usText = {
    2020: 'US wet-bulb temperatures begin to rise.',
    2030: 'Southern and Southeastern states start warming faster.',
    2040: 'Major increases across Gulf region.',
    2050: 'Midwest begins showing critical temperatures.',
    2060: 'Multiple states hit dangerous wet-bulb zones.',
    2070: 'Widespread elevated heat stress levels.',
    2080: 'Severe conditions throughout much of the US.',
    2090: 'Large areas exceed 26°C.',
    2100: 'Extreme max wet-bulb in several regions.',
  };

  // Insert steps
  const textUS = d3.select('#text-us');
  yearsUS.forEach((year) => {
    textUS
      .append('div')
      .attr('class', 'step')
      .attr('data-year', year)
      .html(`<strong>Year ${year}</strong><br>${usText[year]}`)
      .style('margin-bottom', '200px');
  });

  // Group US data
  const usByYear = d3.group(usData, (d) => d.year);

  // Projection
  const projectionUS = d3.geoAlbersUsa().fitSize([widthUS, heightUS], usGeo);
  const pathUS = d3.geoPath().projection(projectionUS);

  // Same colors + bins as CA to keep consistent legend
  const bins = [10, 14, 18, 22, 26, 30];
  const colors = [
    '#f7f4f9',
    '#d4aedd',
    '#c994c7',
    '#dc74b4',
    '#e81f87',
    '#d3004d',
  ];
  const colorScale = d3
    .scaleOrdinal()
    .domain(d3.range(bins.length))
    .range(colors);

  // Tooltip (shared)
  const tooltip = d3.select('#tooltip');

  // Draw US per year
  function drawUS(year) {
    const yearData = usByYear.get(year);
    if (!yearData) return;

    const stateTemps = {};
    yearData.forEach((d) => (stateTemps[d.state] = d.wetbulb_C));

    usGeo.features.forEach((f) => {
      const v = stateTemps[f.properties.name] ?? 0;
      let binIndex = bins.findIndex((b) => v < b);
      if (binIndex === -1) binIndex = bins.length - 1;
      f.properties.bin = binIndex;
      f.properties.value = v;
      f.properties.year = year;
    });

    const paths = svgUS
      .selectAll('path')
      .data(usGeo.features, (d) => d.properties.name);

    paths
      .enter()
      .append('path')
      .merge(paths)
      .attr('d', pathUS)
      .attr('stroke', '#999')
      .attr('fill', (d) => colorScale(d.properties.bin))
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1).html(`
          <strong>${d.properties.name}</strong><br>
          Year: ${d.properties.year}<br>
          Wet-Bulb: ${d.properties.value}°C
        `);
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', event.pageX + 15 + 'px')
          .style('top', event.pageY + 15 + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    paths.exit().remove();
  }

  // Legend
  function drawLegendUS() {
    const legend = d3.select('#us-legend');

    const labels = bins.map((b, i) =>
      i === 0 ? `< ${b}` : `${bins[i - 1]} – ${b}`,
    );
    labels.push(`≥ ${bins[bins.length - 1]}`);

    const items = legend
      .selectAll('.legend-item')
      .data(labels)
      .join('div')
      .attr('class', 'legend-item');

    items
      .selectAll('.legend-color')
      .data((d, i) => [i])
      .join('div')
      .attr('class', 'legend-color')
      .style('background-color', (i) => colors[i]);

    items
      .selectAll('.legend-label')
      .data((d) => [d])
      .join('span')
      .attr('class', 'legend-label')
      .text((d) => d);
  }

  drawLegendUS();
  drawUS(yearsUS[0]);

  // Scrollama
  const scrollerUS = scrollama();

  scrollerUS
    .setup({
      container: '#scrolly-us',
      step: '#text-us .step',
      offset: 0.5,
    })
    .onStepEnter((response) => {
      const year = +d3.select(response.element).attr('data-year');
      drawUS(year);
    });

  window.addEventListener('resize', scrollerUS.resize);
});
