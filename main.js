import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

import define from "./globe.js";
import {Runtime, Inspector} from "./runtime.js";

const bins = [10, 14, 18, 22, 26, 30, 32];
const colors = [
  '#FDFDFD',
  '#FCF0DA',
  '#F5CA98',
  '#E8885A',
  '#BF3b23',
  '#801B0A',
  '#000000',
];

// California /////////////////////////////////////////

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
    2020: 'The highest Wet-Bulb Temperature was in Riverside County, at only 18.74 °C. With the lowest in Mono County at 12.83 °C. We start with Mono, Madera, Lassen, and Modoc counties at the 10-14 °C range.',
    2028: 'In only 8 years, Riverside County hit 42.45 °C, a 2.71 degree Celcius increase in Wet-Bulb Temperature. The lowest remains to be Mono County at 14.24 °C with only a 1.24 degree Celcius increase.',
    2036: 'In just another 8 years, Riverside County hits 22.11 °C, a 3.36 degree Celcius increase. ',
    2040: 'By 2040, both Riverside and San Bernandino County increases by at least 5 °C since 2020, getting closer towards dangerous Wet-Bulb Temperature levels.',
    2060: '2 decades later, and although the Wet-Bulb Temperatures are not as high as they used to be, they are still higher than they were in 2020 by at least 1.27 °C.',
    2072: 'By 2072, California continues to darken as we head towards 2100. Mono, Madera, Lassen, and Modoc Counties that had the lowest Wet-Bulb Temperatures in 2020 have risen to the 14-18 degree Celcius range.',
    2100: 'In 2100, although not as high in 2036, the overall Wet-Bulb Temperature has increased over time, with a minimum increase of 2.11 °C in Inyo County.',
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
        // Get 2020 value for this county
        const year2020Data = dataByYear.get(2020) || [];
        const county2020 = year2020Data.find(
          (c) => c.county === d.properties.name,
        );
        const value2020 = county2020 ? county2020.wetbulb_C : null;

        const currentValue = d.properties.value;

        const diff =
          value2020 !== null && currentValue !== null
            ? (currentValue - value2020).toFixed(2)
            : 'N/A';

        tooltipCA.style('opacity', 1).html(`
      <strong>${d.properties.name}</strong><br/>
      Year: ${d.properties.year}<br/>
      Wet-Bulb Temp: ${
        currentValue !== null ? currentValue.toFixed(2) : 'N/A'
      }°C<br/>
      2020 Temp: ${value2020 !== null ? value2020.toFixed(2) : 'N/A'}°C<br/>
      Difference: ${diff}°C
    `);
      })
      .on('mousemove', (event, d) => {
        tooltipCA
          .style('left', event.pageX + 15 + 'px')
          .style('top', event.pageY + 15 + 'px');
      })
      .on('mouseout', () => tooltipCA.style('opacity', 0));

    paths.exit().remove();
  }

  function updateStats(year) {
    const yearData = dataByYear.get(year);
    if (!yearData) return;
    const avgTemp = d3.mean(yearData, (d) => d.wetbulb_C).toFixed(1);
    d3.select('#scrolly-ca p').text(
      `In ${year}, California's average Wet-Bulb Temperature is ${avgTemp}°C.`,
    );
  }

  drawCA(allYears[0]);
  updateStats(allYears[0]);

  const yearTitle = d3.select('#year-title');
  yearTitle.text(`California Wet Bulb Temperature In: `);

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
      if (year) {
        yearTitle.text(`California Wet Bulb Temperature In: ${year}`);
      }
    });

  window.addEventListener('resize', scroller.resize);
}

////// US ///////

let usStates, usData;
let usDataByYear;

const svgUS = d3.select('#map-us');

d3.json('data/us-states.json').then((states) => {
  usStates = states;
  initUSIfReady();
});

d3.json('data/wetbulb_max_us.json').then((data) => {
  usData = data;
  initUSIfReady();
});

function initUSIfReady() {
  if (!usStates || !usData) return;

  usDataByYear = d3.group(usData, (d) => d.year);

  const allYears = Array.from(usDataByYear.keys()).sort((a, b) => a - b);

  const textContainer = d3.select('#text-us');
  textContainer.selectAll('.step').remove();

  const usYearText = {
    2016: 'In 2016, the hottest states were Texas and Florida at 25.49°C and 26.48°C, while Alaska was the coolest at 11.97°C.',
    2028: 'By 2028, Alaska, the coolest state thus far has increased by 1.59°C, at 13.56°C. Texas and Florida, the previously hottest states so far have also increased, even if by less than 1°C.',
    2032: '4 years later, the Midwest and Southeast regions of the US show a noticeable rise in Wet-Bulb temperatures, especially Texas, Louisiana, Florida, and South Carolina.',
    2040: 'In just another 8 years, the entire US sees an increase in Wet-Bulb Temperatures, as parts of the West Coast and Northern Midwest jump up to at least 22°C.',
    2044: 'This is the first year that any part of the US reaches a Wet-Bulb Temperature of at least 26°C and stays at that range.',
    2064: "Here we see Alaska's Wet-Bulb Temperature hit 14.18°C, a 2.32°C increase from 2016. As the state that was historically the coolest, this is it's turning point where it continues to climb.",
    2072: '10 states hit the range of 26-30°C, and even Alaska, the coolest state historically has increase by 2.52°C since 2016, at 14.49°C.',
    2092: 'By 2092, 9 states are in the 26-30°C range, with 24 states in the 22-26°C range, a stark difference from the Wet-Bulb Temperatures in 2016.',
    2100: 'Once we hit the end of the century, 8 states in the US reach at least or almost to 28°C, only 2°C away from the dangerous Wet-Bulb Temperature of 30°C.',
  };

  allYears.forEach((year) => {
    textContainer
      .append('div')
      .attr('class', 'step')
      .attr('data-year', year)
      .html(`<strong>Year ${year}</strong><br/>${usYearText[year] || ''}`)
      .style('margin-bottom', '200px');
  });

  drawUS(allYears[0]);

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
      d3.select('#us-year-title').text(
        `United States Wet Bulb Temperature In: ${year}`,
      );
    });

  window.addEventListener('resize', scrollerUS.resize);
}

const tooltipUS = d3.select('#tooltip-us');

let currentMouseUS = null;
svgUS.on('mousemove', (event) => {
  currentMouseUS = [event.clientX, event.clientY];

  tooltipUS
    .style('left', event.clientX + 15 + 'px')
    .style('top', event.clientY + 15 + 'px');
});

function drawUSLegend() {
  const legend = d3.select('#us-legend');

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

drawUSLegend();

function drawUS(year) {
  const yearData = usDataByYear.get(year);
  if (!yearData) return;

  const stateTemps = {};
  yearData.forEach((d) => (stateTemps[d.state] = d.wetbulb_C));

  usStates.features.forEach((f) => {
    const value = stateTemps[f.properties.NAME] ?? null;
    f.properties.value = value;
    f.properties.year = year;
  });

  const projection = d3.geoAlbersUsa();
  const path = d3.geoPath().projection(projection);

  const paths = svgUS
    .selectAll('path')
    .data(usStates.features, (d) => d.properties.NAME);

  paths
    .enter()
    .append('path')
    .merge(paths)
    .attr('d', path)
    .attr('stroke', '#999')
    .attr('fill', (d) => {
      const binIndex = bins.findIndex((b) => d.properties.value < b);
      return colors[binIndex === -1 ? bins.length - 1 : binIndex];
    })
    .on('mouseover', (event, d) => {
      // Get 2020 value
      const year2016Data = usDataByYear.get(2016) || [];
      const state2016 = year2016Data.find((s) => s.state === d.properties.NAME);
      const value2016 = state2016 ? state2016.wetbulb_C : null;

      const currentValue = d.properties.value;

      const diff =
        value2016 !== null && currentValue !== null
          ? (currentValue - value2016).toFixed(2)
          : 'N/A';

      tooltipUS.style('opacity', 1).html(`
      <strong>${d.properties.NAME}</strong><br/>
      Year: ${d.properties.year}<br/>
      Wet-Bulb Temp: ${
        currentValue !== null ? currentValue.toFixed(2) : 'N/A'
      }°C<br/>
      2016 Temp: ${value2016 !== null ? value2016.toFixed(2) : 'N/A'}°C<br/>
      Difference: ${diff}°C`);
    })
    .on('mousemove', (event, d) => {
      // Update position so tooltip follows mouse
      tooltipUS
        .style('left', event.pageX + 15 + 'px')
        .style('top', event.pageY + 15 + 'px');
    })
    .on('mouseout', () => tooltipUS.style('opacity', 0));

  paths.exit().remove();
}

document.addEventListener('scroll', () => {
  const caBottom = document
    .querySelector('#scrolly-ca')
    .getBoundingClientRect().bottom;

  const transitionTop = document
    .querySelector('.transition-section')
    .getBoundingClientRect().top;

  const usTop = document
    .querySelector('#scrolly-us')
    .getBoundingClientRect().top;

  const caMap = document.querySelector('#map-column');
  const usMap = document.querySelector('#map-us-column');

  // Fade out California map once user scrolls past it
  if (caBottom < window.innerHeight * 0.6) {
    caMap.classList.add('sticky-hidden');
  } else {
    caMap.classList.remove('sticky-hidden');
  }

  // Fade in US map when transition section is mostly scrolled past
  if (transitionTop < window.innerHeight * 0.5) {
    usMap.classList.remove('sticky-hidden');
  } else {
    usMap.classList.add('sticky-hidden');
  }
});

// Globe /////////////////////////////////////////

const runtime = new Runtime();

runtime.module(define, name =>
  name === "map"
    ? new Inspector(document.querySelector("#globe-container"))
    : null
);

