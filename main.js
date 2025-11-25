import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const svgCA = d3.select('#map-ca');
const width = +svgCA.attr('width');
const height = +svgCA.attr('height');

let caCounties, caData;

// Load counties first
d3.json('data/california-counties.geojson').then((counties) => {
  caCounties = counties;
  initIfReady();
});

d3.json('data/wetbulb_max_ca.json').then((data) => {
  caData = data;
  initIfReady();
});

// Only initialize after both datasets are loaded
function initIfReady() {
  if (!caCounties || !caData) return;

  const dataByYear = d3.group(caData, (d) => d.year);

  // All years in the dataset
  const allYears = Array.from(dataByYear.keys()).sort((a, b) => a - b); // includes 2016
  const stepYears = allYears.filter((y) => y !== 2016); // exclude 2016 from scroll steps

  // Custom text for scroll steps
  const yearText = {
    2025: 'Most counties sit well below 22 degrees Celcius, excluding.',
    2029: '',
    2033: '',
    2040: 'Central Valley and inland areas start seeing rising heat.',
    2055: 'Significant jump: many counties exceed 22°C wet-bulb temperatures.',
    2070: 'Coastal areas also show notable warming.',
    2085: 'Record highs in southern California, heat risk increases.',
    2100: 'Critical levels approached in multiple counties; dangerous conditions.',
  };

  // Scroll text container
  const textContainer = d3.select('#text');

  textContainer
    .append('div')
    .attr('class', 'step spacer')
    .style('height', '200px'); // adjust as needed

  stepYears.forEach((year) => {
    textContainer
      .append('div')
      .attr('class', 'step')
      .attr('data-year', year)
      .html(`<strong>Year ${year}</strong><br/>${yearText[year] || ''}`)
      .style('margin-bottom', '200px');
  });

  // Map projection and path
  const projection = d3.geoMercator().fitSize([width, height], caCounties);
  const path = d3.geoPath().projection(projection);

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

  const tooltipCA = d3.select('#tooltip');

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
  let currentMouse = null;

  // Track mouse position over the map
  svgCA.on('mousemove', (event) => {
    currentMouse = [event.pageX, event.pageY];
  });

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
      f.properties.value = value;
      f.properties.year = year;
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
        tooltipCA.style('opacity', 1).html(`
        <strong>${d.properties.name}</strong><br/>
        Year: ${d.properties.year}<br/>
        Wet-Bulb Temp: ${d.properties.value}°C
      `);
      })
      .on('mousemove', (event, d) => {
        tooltipCA
          .style('left', event.clientX + 15 + 'px') // clientX = relative to viewport
          .style('top', event.clientY + 15 + 'px'); // clientY = relative to viewport
        currentMouse = [event.clientX, event.clientY];
      })
      .on('mouseout', () => tooltipCA.style('opacity', 0));

    paths.exit().remove();

    // Immediately update tooltip if mouse is over map
    if (currentMouse) {
      const [mx, my] = currentMouse;
      const elementUnderCursor = document.elementFromPoint(
        mx - window.scrollX,
        my - window.scrollY,
      );
      const datum = d3.select(elementUnderCursor).datum();
      if (datum) {
        tooltipCA
          .style('opacity', 1)
          .html(
            `
          <strong>${datum.properties.name}</strong><br/>
          Year: ${datum.properties.year}<br/>
          Wet-Bulb Temp: ${datum.properties.value}°C
        `,
          )
          .style('left', mx + 15 + 'px')
          .style('top', my + 15 + 'px');
      }
    }
  }

  function updateStats(year) {
    const yearData = dataByYear.get(year);
    if (!yearData) return;
    const avgTemp = d3.mean(yearData, (d) => d.wetbulb_C).toFixed(1);
    d3.select('#scrolly-ca p').text(
      `In ${year}, California's average Wet-Bulb Temperature is ${avgTemp}°C.`,
    );
  }

  // Draw initial map (first year in dataset)
  drawCA(allYears[0]);
  updateStats(allYears[0]);

  // Set initial title to 2016
  const yearTitle = d3.select('#year-title');
  yearTitle.text(`California Wet Bulb Temperature In: `);

  // Scrollama setup
  const scroller = scrollama();

  // const yearTitle = d3.select('#year-title');

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

      // Only update title if year is valid
      if (year) {
        yearTitle.text(`California Wet Bulb Temperature In: ${year}`);
      }
    });

  window.addEventListener('resize', scroller.resize);
}
