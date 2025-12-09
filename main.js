import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

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

// Page styling and functionality //////////////////////
// Auto-fill today's date like NYT
const today = new Date();
const options = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};
document.getElementById('today').textContent = today.toLocaleDateString(
  'en-US',
  options,
);

// hero section fade out
const hero = document.querySelector('.title-section');

function updateHeroFade() {
  if (!hero) return;

  // How far to scroll before the hero is fully gone
  const fadeDistance = window.innerHeight * 0.7; // tweak (0.5–1.0) to taste
  const y = window.scrollY;

  // 0 at top, 1 when we've scrolled fadeDistance
  const progress = Math.min(Math.max(y / fadeDistance, 0), 1);

  // Fade out and move slightly up
  hero.style.opacity = 1 - progress;
  hero.style.transform = `translateY(${progress * -40}px)`; // -40px up at full fade

  // Optional: disable interactions once it's basically gone
  hero.style.pointerEvents = progress >= 0.98 ? 'none' : 'auto';
}

window.addEventListener('scroll', updateHeroFade);
window.addEventListener('resize', updateHeroFade);
updateHeroFade(); // initial

// hides scroll indicator after user scrolls
const indicator = document.getElementById('scroll-indicator');

window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    // hide after they start scrolling
    indicator.classList.add('hidden');
  } else {
    indicator.classList.remove('hidden');
  }
});

// Intro Scrolly //////////////////////////////////////
function initWetbulbLayeredScrolling() {
  const scrollContainer = document.getElementById('scrolly-wetbulb');
  const textBoxes = document.querySelectorAll('#scrolly-wetbulb .text-box');
  const thermoWrapper = document.getElementById('thermo-wrapper');
  const thermoFill = document.getElementById('thermo-fill');

  if (!scrollContainer || !textBoxes.length || !thermoWrapper || !thermoFill)
    return;

  function updateTextBoxPositions() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const containerTop = scrollContainer.offsetTop;
    const containerHeight = scrollContainer.offsetHeight;

    // active scroll window for this section
    const startScroll = containerTop + window.innerHeight * 0.05;
    const endScroll = containerTop + containerHeight * 0.8;

    if (scrollTop < startScroll || scrollTop > endScroll) {
      // Completely outside the section: hide cards + thermometer
      textBoxes.forEach((box) => {
        box.style.display = 'none';
        box.style.opacity = 0;
        box.style.top = '100vh';
      });
      thermoWrapper.style.opacity = 0;
      thermoFill.style.transform = 'scaleY(0)';
      return;
    } else {
      textBoxes.forEach((box) => (box.style.display = 'block'));
      thermoWrapper.style.opacity = 1; // show thermometer only inside
    }

    // 0–1 progress through this window
    const rawProgress = (scrollTop - startScroll) / (endScroll - startScroll);
    const progress = Math.max(0, Math.min(1, rawProgress));

    // Thermometer fill based on overall progress
    const thermoLevel = 0.1 + progress * 0.9; // 10% → 100%
    thermoFill.style.transform = `scaleY(${thermoLevel})`;

    // Card motion (unchanged logic, but using this progress)
    const count = textBoxes.length;
    const step = 1 / count;

    textBoxes.forEach((box, index) => {
      const startProgress = index * step;
      const endProgress = startProgress + step * 1.1; // slight overlap

      if (progress >= startProgress && progress <= endProgress) {
        const boxProgress =
          (progress - startProgress) / (endProgress - startProgress);

        const START_VH = 75;
        const TRAVEL_VH = 100;
        const topPosition = START_VH - boxProgress * TRAVEL_VH;

        box.style.top = `${topPosition}vh`;
        box.style.opacity = boxProgress < 0.1 || boxProgress > 0.9 ? 0.4 : 1;
      } else if (progress > endProgress) {
        box.style.top = '-20vh';
        box.style.opacity = 0;
      } else {
        box.style.top = '100vh';
        box.style.opacity = 0;
      }
    });
  }

  window.addEventListener('scroll', updateTextBoxPositions);
  window.addEventListener('resize', updateTextBoxPositions);
  updateTextBoxPositions();
}

document.addEventListener('DOMContentLoaded', initWetbulbLayeredScrolling);

// California /////////////////////////////////////////
const hasCA = document.querySelector('#map-ca') !== null;
if (hasCA) {
  // everything from: const svgCA = d3.select('#map-ca');
  // through the end of initIfReady()

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
        .style(
          'background-color',
          (i) => colors[i] || colors[colors.length - 1],
        );

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

  // Group years by decade and select representative years
  const yearGroups = {
    '2010s': [2016],
    '2020s': [2020, 2028],
    '2030s': [2032, 2036],
    '2040s': [2040, 2044],
    '2050s': [2056],
    '2060s': [2060, 2064],
    '2070s': [2072],
    '2080s': [2080, 2084],
    '2090s': [2092],
    '2100s': [2100],
  };

  // Flatten to array of years to display
  const stepYears = Object.values(yearGroups)
    .flat()
    .filter((y) => allYears.includes(y));

  const textContainer = d3.select('#text-us');
  textContainer.selectAll('.step').remove();

  // Decade-based text that can span multiple years
  const decadeText = {
    '2010s':
      'This decade establishes our climate baseline, with clear regional patterns: the hottest states concentrated in the South, while northern and mountainous regions remain significantly cooler.',
    '2020s':
      'Early signs of climate change emerge, with noticeable warming beginning across the country. Southern states show the first significant increases, while traditionally cooler regions start their gradual ascent.',
    '2030s':
      'Accelerating warming trends become evident nationwide. More states transition into higher temperature categories as heat begins affecting broader regions beyond the traditional hot zones.',
    '2040s':
      'A critical turning point where parts of the United States first reach dangerously high temperature thresholds that persist year-round, marking a shift toward more extreme heat patterns.',
    '2050s':
      'Mid-century brings permanent changes to temperature patterns, with several southern states remaining consistently in high temperature ranges that were previously exceptional.',
    '2060s':
      'Historically moderate regions experience temperature levels once characteristic only of southern states, while traditionally cool areas show continued, accelerated warming.',
    '2070s':
      'Multiple states regularly experience dangerously high temperatures, with warming affecting virtually every region as extreme heat becomes more common across the country.',
    '2080s':
      'The last remaining cooler regions begin disappearing, with nearly all states experiencing temperature levels that would have been considered extreme in previous decades.',
    '2090s':
      'End-of-century patterns solidify, with large portions of the country experiencing temperature ranges that pose significant health risks and represent dramatic departures from historical norms.',
    '2100s':
      'The century closes with temperature patterns fundamentally transformed, bringing much of the nation perilously close to thresholds considered dangerous for human survival.',
  };

  // Your existing year-specific text (updated with some new entries)
  const usYearText = {
    2016: 'In 2016, the hottest states were Texas and Florida at 25.49°C and 26.48°C, while Alaska was the coolest at 11.97°C.',
    2020: 'By 2020, we see early warming trends with Alaska increasing by 1.2°C from 2016 levels.',
    2028: 'By 2028, Alaska, the coolest state thus far has increased by 1.59°C, at 13.56°C. Texas and Florida, the previously hottest states so far have also increased, even if by less than 1°C.',
    2032: '4 years later, the Midwest and Southeast regions of the US show a noticeable rise in Wet-Bulb temperatures, especially Texas, Louisiana, Florida, and South Carolina.',
    2036: 'In the mid-2030s, temperature increases accelerate across most states, with more regions entering higher temperature brackets.',
    2040: 'In just another 8 years, the entire US sees an increase in Wet-Bulb Temperatures, as parts of the West Coast and Northern Midwest jump up to at least 22°C.',
    2044: 'This is the first year that any part of the US reaches a Wet-Bulb Temperature of at least 26°C and stays at that range.',
    2056: 'This is the start of where states such as Texas, Louisiana, and Florida hit the 26-30°C threshold and do not come back down, showing the rising temperatures as it spreads through the Southern US.',
    2060: 'By the 2060s, temperature patterns have shifted significantly, with previously moderate regions now experiencing heat levels comparable to historical southern states.',
    2064: "Here we see Alaska's Wet-Bulb Temperature hit 14.18°C, a 2.32°C increase from 2016. As the state that was historically the coolest, this is it's turning point where it continues to climb.",
    2072: '10 states hit the range of 26-30°C, and even Alaska, the coolest state historically has increased by 2.52°C since 2016, at 14.49°C.',
    2084: 'Alaska and Nevada remain to be the final 2 states of the United States that see a projected wet-bulb temperature of below 18°C.',
    2092: 'By 2092, 9 states are in the 26-30°C range, with 24 states in the 22-26°C range, a stark difference from the Wet-Bulb Temperatures in 2016.',
    2100: 'Once we hit the end of the century, 8 states in the US reach at least or almost to 28°C, only 2°C away from the dangerous Wet-Bulb Temperature of 30°C.',
  };

  // Track previous decade to add headers
  let prevDecade = null;

  // Create steps for each decade with representative years
  Object.entries(yearGroups).forEach(([decade, years]) => {
    if (years.length > 0) {
      // Check if this is a new decade to add header
      if (decade !== prevDecade) {
        textContainer
          .append('div')
          .attr('class', 'decade-header')
          .html(
            `<h3 style="margin-bottom: 1rem; color: #333; font-family: Georgia, serif;">The ${decade}</h3>`,
          )
          .style('margin-bottom', '30px')
          .style('font-size', '1.5em');
        prevDecade = decade;
      }

      // Create a step for each year in this decade
      years.forEach((year) => {
        textContainer
          .append('div')
          .attr('class', 'step')
          .attr('data-year', year)
          .attr('data-decade', decade)
          .html(
            `
            <div style="margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #eee;">
              <strong style="font-size: 1.2em;">${year}</strong>
              <div style="font-size: 0.9em; color: #666; margin-top: 0.2rem;">Part of the ${decade}</div>
            </div>
            <div style="font-style: italic; color: #444; margin-bottom: 1rem;">
              ${decadeText[decade] || ''}
            </div>
            <div>
              ${usYearText[year] || ''}
            </div>
          `,
          )
          .style('margin-bottom', '200px')
          .style('padding', '1.5rem')
          .style('background', 'rgba(255, 255, 255, 0.95)')
          // .style('border-radius', '8px')
          .style('box-shadow', '0 2px 10px rgba(0, 0, 0, 0.08)')
          .style('border-left', '4px solid #d22');
      });
    }
  });

  drawUS(stepYears[0]);

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

      // Optional: Highlight current decade
      const decade = d3.select(response.element).attr('data-decade');
      console.log(`Now showing: ${decade}, Year ${year}`);
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

  const projection = d3.geoAlbersUsa().translate([300, 200]).scale(700);
  const path = d3.geoPath().projection(projection);

  const paths = svgUS
    .selectAll('path')
    .data(usStates.features, (d) => d.properties.NAME);

  paths
    .enter()
    .append('path')
    .merge(paths)
    .attr('d', path)
    .attr('stroke', '#ffffff') // White borders for contrast
    .attr('stroke-width', 0.8)
    .attr('fill', (d) => {
      const binIndex = bins.findIndex((b) => d.properties.value < b);
      return colors[binIndex === -1 ? bins.length - 1 : binIndex];
    })
    .on('mouseover', (event, d) => {
      // Bring hovered state to front and highlight it
      const hoveredPath = d3.select(event.currentTarget);
      hoveredPath.raise(); // Move to top of rendering order

      hoveredPath.attr('stroke', '#000000').attr('stroke-width', 2);

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
    .on('mouseout', (event, d) => {
      // Reset to normal border
      d3.select(event.currentTarget)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 0.8);
      tooltipUS.style('opacity', 0);
    });

  paths.exit().remove();
}

document.addEventListener('scroll', () => {
  // Safely check for California elements (they might not exist)
  const scrollyCA = document.querySelector('#scrolly-ca');
  const caBottom = scrollyCA ? scrollyCA.getBoundingClientRect().bottom : 0;

  const transitionTop = document
    .querySelector('.transition-section')
    ?.getBoundingClientRect().top;
  const usTop = document
    .querySelector('#scrolly-us')
    ?.getBoundingClientRect().top;
  const caMap = document.querySelector('#map-column');
  const usMap = document.querySelector('#map-us-column');

  // Fade out California map once user scrolls past it (if it exists)
  if (scrollyCA && caBottom < window.innerHeight * 0.6) {
    if (caMap) caMap.classList.add('sticky-hidden');
  } else if (caMap) {
    caMap.classList.remove('sticky-hidden');
  }

  // Fade in US map when transition section is mostly scrolled past
  if (transitionTop !== undefined && transitionTop < window.innerHeight * 0.5) {
    if (usMap) usMap.classList.remove('sticky-hidden');
  } else if (usTop !== undefined && usTop > window.innerHeight * 0.2) {
    if (usMap) usMap.classList.add('sticky-hidden');
  }
});

// Globe /////////////////////////////////////////

// const runtime = new Runtime();

// runtime.module(define, name =>
//   name === "map"
//     ? new Inspector(document.querySelector("#globe-container"))
//     : null
// );




// writeup dropdown /////////////////////////////////////////

const writeupContent = d3.select('#write-up-content');
const writeupToggle = d3.select('#write-up-toggle');

if (!writeupContent.empty() && !writeupToggle.empty()) {
  // Make sure it starts collapsed
  writeupContent.classed('open', false);

  writeupToggle.on('click', () => {
    const isOpen = writeupContent.classed('open');

    // Toggle the "open" class
    writeupContent.classed('open', !isOpen);

    // Update button text/icon
    writeupToggle.text(
      isOpen ? 'Show Project Writeup Portion ▾' : 'Hide Project Writeup Portion ▴'
    );
  });
}

// action section cards /////////////////////////////////////////
const actionRoot = d3.select('#action-section');

if (!actionRoot.empty()) {
  const panels = [
    {
      id: 'causes',
      bgClass: 'action-panel-causes',
      title: 'A Closer Look at Carbon Emissions: What Exactly Causes It?',
      cards: [
        {
          icon: '🚗',
          title: 'Transportation',
          text:
            'Cars, trucks, highways, air travel, marine shipping, and rail burn gas and diesel. This releases CO2 in the process and makes transportation the largest chunk of U.S. greenhouse gas emissions.',
        },
        {
          icon: '🏠',
          title: 'Residential & Commercial',
          text:
            'Homes, offices, and buildings use energy for things like heating, cooling, lighting, appliances, cooking, etc. This produces CO2 emissions in the process.',
        },
        {
          icon: '💡',
          title: 'Electricity',
          text:
            'Producing electricity in itself produces CO2 by way of burning fuels like coal, natural gas, and oil things like homes, businesses, and industry.',
        },
        {
          icon: '🏭',
          title: 'Industry',
          text:
            'Factories use fossil fuels to power equipment and manufacturing, emitting CO₂ from chemical processes (like cement, steel, plastics, and fertilizer production).',
        },
        
      ]
    },
    {
      id: 'impacts',
      bgClass: 'action-panel-impacts',
      title: 'Looking at the Numbers: How This Affects Our Environment',
      cards: [
        {
          icon: '🌡️',
          title: 'Hotter Planet',
          text:
            'Human driven CO₂ and other greenhouse gases have warmed the Earth by about 1.1°C (around 2°F) compared with the late 1800s. That increase results in hotter heat waves, heavier downpours, and more prominent droughts worldwide.',
          stat: '≈1.1°C (2°F) global warming'
        },
        {
          icon: '🌊',
          title: 'Rising Seas',
          text:
            'Oceans are warming and land ice is melting, which resulted in global sea level rising since 1880. This makes coastal flooding more frequent and threaten cities in places like Southeast Asia and the U.S.',
          stat: '+8–9 inches of sea-level rise'
        },
        {
          icon: '🥵',
          title: 'More Dangerous Heat in the U.S.',
          text:
            'In major U.S. cities, the number of heat waves each year has risen from about two per summer in the 1960s to around six per summer in the 2010s. Hotter and longer heat waves increase risks of heat illness and drives us closer to inhumane living conditions.',
          stat: '3x more heat waves'
        },
        {
          icon: '🔥',
          title: 'Wildfires and Stressed Forests',
          text:
            'Warmer, drier conditions help fuel larger wildfires and stress forests. Since the 80s, the area burned by wildfires in the U.S. has grown. U.S. forest area has declined by 10% in the early 2000s–2010s as drought, fire, and other stressors amplify.',
          stat: '200% Increase in Area Burned from Wildfires, 10% Decrease in Forest area'
        }
      ]
    },
    {
      id: 'solutions',
      bgClass: 'action-panel-solutions',
      title: 'So, what can we do?',
      cards: [
        {
          icon: '🚶‍♀️',
          title: 'Shift How We Get Around',
          text:
            'Transportation emissions can be cut down by walking, using transit, or carpooling to your destination. Simply changing a daily 3 mile solo drive to walking/biking/transit can save up to 300lbs of CO2 a year',
          stat: '300 lbs of CO2 saved yearly'
        },
        {
          icon: '💡',
          title: 'Use Energy Smarter',
          text:
            'Energy such as heating and cooling are huge contributors of household emissions. Changing the thermostat by just 2-3°F can reduce home energy use by 10-15%',
          stat: 'Up to 15% less energy consumption'
        },
        {
          icon: '🥗',
          title: 'Be Wary of Food',
          text:
            'Increasing plant based portion of diet and reducing food waste will shrink emissions from farms and landfills.',
          stat: '13,000,000 tons of CO2 can be saved if food waste is cut by 25% per household.'
        },
        {
          icon: '📣',
          title: 'Take Action',
          text:
            'Individual choices are crucial, but collective effort is what truly matters. Support policies that accelerate renewable energy, electrified transit, and climate-resilient communities. Broad campaign/policy shifts can reduce U.S. emissions by billions of tons over the coming decades.'
        }
      ]
    }
  ];

  panels.forEach((panelData) => {
    const panel = actionRoot
      .append('section')
      .attr('class', `action-panel ${panelData.bgClass}`)
      .attr('id', `panel-${panelData.id}`);

    panel
      .append('h2')
      .attr('class', 'action-heading')
      .text(panelData.title);

    const cardList = panel.append('div').attr('class', 'action-card-list');

    const cards = cardList
      .selectAll('.action-card')
      .data(panelData.cards)
      .enter()
      .append('article')
      .attr('class', 'action-card');

    cards
      .append('div')
      .attr('class', 'action-card-icon')
      .text((d) => d.icon);

    const body = cards
      .append('div')
      .attr('class', 'action-card-body');

    body
      .append('h3')
      .text((d) => d.title);

    body
      .append('p')
      .text((d) => d.text);

    body
      .filter((d) => d.stat)
      .append('p')
      .attr('class', 'action-card-stat')
      .text((d) => d.stat);
  });
}

// New Globe /////////////////////////////////////////
