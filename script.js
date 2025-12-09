import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import scrollama from "https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm";

const csvFile = "data/GCB2022v27_MtCO2_flat.csv";
const worldGeoJSONUrl = "data/world.geojson";

const minYear = 1750;
const maxYear = 2021;

const mapWidth = 900;
const mapHeight = 520;

// DOM elements
const svg = d3.select("#map").attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
const tooltip = d3.select("#emissions_tooltip");
const statusEl = d3.select("#status");

// state
let currentMetric = "total"; // "total" or "perCapita"
let currentYear = 1850;

let colorScales = {};
let emissionsByKey;
let rowsByYear;
let scroller;

// formatting
const formatTotal = d3.format(".2s");
const formatPerCapita = d3.format(".2f");

function formatValue(metric, value) {
  if (value == null || !isFinite(value)) return "no data";
  if (metric === "total") return `${formatTotal(value)} MtCO₂`;
  return `${formatPerCapita(value)} t/person`;
}

// Harmonize names between CO2 dataset and wet-bulb dataset
const WB_NAME_FIX = {
  "USA": "United States",
  "Republic of the Congo": "Congo",
  "Democratic Republic of the Congo": "Democratic Republic of Congo"
  // Add more if needed
};

function normalizeWBName(name) {
  return WB_NAME_FIX[name] || name;
}

/* ============================================================
   BAR CHART
   ============================================================ */

// Clear old content
svg.selectAll("*").remove();

// Bar chart layout
const barMargin = { top: 20, right: 40, bottom: 40, left: 180 };
const barWidth = mapWidth - barMargin.left - barMargin.right;
const barHeight = 520 - barMargin.top - barMargin.bottom;

// Container for bars
const barG = svg
  .append("g")
  .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

// Scales
const xScale = d3.scaleLinear().range([0, barWidth]);
const yScale = d3.scaleBand().range([0, barHeight]).padding(0.15);

// Axes
const xAxisGroup = barG
  .append("g")
  .attr("class", "x-axis")
  .attr("transform", `translate(0,0)`);

const yAxisGroup = barG.append("g").attr("class", "y-axis");

// Tooltip handlers
function barMouseOver(e, d) {
  tooltip
    .style("opacity", 1)
    .html(
      `<strong>${d.country}</strong><br>
       ${formatValue(currentMetric, d[currentMetric])}`
    );
}

function barMouseMove(e) {
  tooltip
    .style("left", e.pageX + 15 + "px")
    .style("top", e.pageY + "px");
}

function barMouseOut() {
  tooltip.style("opacity", 0);
}

// MAIN BAR CHART DRAWER
function updateBarChart() {
  const rows = rowsByYear.get(currentYear) || [];

  const EXCLUDE = new Set([
    "Global",
    "International Transport",
  ]);

  const sorted = [...rows]
      .filter(d => !EXCLUDE.has(d.country))
      .filter((d) => d[currentMetric] > 0)
      .sort((a, b) => b[currentMetric] - a[currentMetric])
      .slice(0, 15);

  xScale.domain([0, d3.max(sorted, (d) => d[currentMetric]) || 1]);
  yScale.domain(sorted.map((d) => d.country));

  const bars = barG.selectAll("rect.bar").data(sorted, (d) => d.iso3);

  bars.exit().remove();

  bars
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("y", (d) => yScale(d.country))
    .attr("height", yScale.bandwidth())
    .attr("x", 0)
    .attr("width", 0)
    .on("mouseover", barMouseOver)
    .on("mousemove", barMouseMove)
    .on("mouseout", barMouseOut)
    .merge(bars)
    .transition()
    .duration(600)
    .attr("y", (d) => yScale(d.country))
    .attr("height", yScale.bandwidth())
    .attr("width", (d) => xScale(d[currentMetric]))
    .attr("fill", (d) => colorScales[currentMetric](d[currentMetric]));

  xAxisGroup.transition().duration(600).call(d3.axisTop(xScale).ticks(5));
  yAxisGroup.transition().duration(600).call(d3.axisLeft(yScale));
}

/* ============================================================
   WET-BULB CHART
   ============================================================ */

let wbColor;

const wbSvg = d3.select("#wetbulb_bar_chart")
  .attr("viewBox", `0 0 ${mapWidth} 520`);

const wbMargin = { top: 5, right: 40, bottom: 40, left: 180 };
const wbWidth = mapWidth - wbMargin.left - wbMargin.right;
const wbHeight = 350 - wbMargin.top - wbMargin.bottom;

const wbG = wbSvg.append("g")
  .attr("transform", `translate(${wbMargin.left}, ${wbMargin.top})`);

const wbX = d3.scaleLinear().range([0, wbWidth]);
const wbY = d3.scaleBand().range([0, wbHeight]).padding(0.15);

const wbXAxis = wbG.append("g").attr("class", "wb-axis wb-x-axis");
const wbYAxis = wbG.append("g").attr("class", "wb-axis wb-y-axis");

const wbTooltip = d3.select("#wetbulb_bar_tooltip");

function wbMouseOver(e, d) {
  wbTooltip
    .style("opacity", 1)
    .html(`<strong>${d.country}</strong><br>${d.value.toFixed(2)}°C`);

  d3.select(this)
    .attr("stroke", "#222")
    .attr("stroke-width", 1.2)
    .attr("fill", d3.color(wbColor(d.value)).darker(0.7));
}

function wbMouseMove(e) {
  wbTooltip
    .style("left", (e.pageX + 15) + "px")
    .style("top", (e.pageY - 10) + "px");
}

function wbMouseOut(e, d) {
  wbTooltip.style("opacity", 0);

  d3.select(this)
    .attr("stroke", "none")
    .attr("fill", wbColor(d.value));
}

function updateWetbulbBarChart(emissionsYear) {

  // Compute +50-year target
  const wetbulbYear = emissionsYear + 50;

  if (!wetbulbData[wetbulbYear]) {
    console.warn("Missing wet-bulb data for year", wetbulbYear);
    return;
  }

  // Convert from object → array
  let rows = Object.entries(wetbulbData[wetbulbYear]).map(([country, value]) => ({
    country: normalizeWBName(country),
    value
  }));

  // Sort & keep top 10
  rows = rows
    .filter(d => isFinite(d.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  wbX.domain([0, d3.max(rows, d => d.value)]);
  wbY.domain(rows.map(d => d.country));

  const minWB = d3.min(rows, d => d.value);
  const maxWB = d3.max(rows, d => d.value);
  const midWB = 28;   // threshold stays the same

  wbColor = d3.scaleDiverging()
    .domain([minWB, midWB, maxWB])
    .interpolator(t => {
      const u = (t + 1) / 2;
      return d3.interpolateRgbBasis([
        "#3b73b8",   // blue (low)
        "#cccccc",   // neutral
        "#b33a3a"    // red (high)
      ])(u);
    });

  const bars = wbG.selectAll("rect.wb-bar").data(rows, d => d.country);

  bars.exit().remove();

  bars.enter()
    .append("rect")
    .attr("class", "wb-bar")
    .attr("x", 0)
    .attr("y", d => wbY(d.country))
    .attr("height", wbY.bandwidth())
    .attr("width", 0)
    .on("mouseover", wbMouseOver)
    .on("mousemove", wbMouseMove)
    .on("mouseout", wbMouseOut)
    .merge(bars)
    .transition()
    .duration(600)
    .attr("width", d => wbX(d.value))
    .attr("y", d => wbY(d.country))
    .attr("height", wbY.bandwidth())
    .attr("fill", d => wbColor(d.value));

  wbXAxis.transition().duration(600)
    .call(d3.axisTop(wbX).ticks(5));

  wbYAxis.transition().duration(600)
    .call(d3.axisLeft(wbY));
}

/* ============================================================
   WET-BULB DATA LOADING
   ============================================================ */

const wetbulbFile = "data/wetbulb_max_countries.json";

let wetbulbData = {};
let wbYears = [];
let wbYearSet = new Set();

d3.json(wetbulbFile).then(data => {
  wetbulbData = data;
  wbYears = Object.keys(data).map(d => +d);
  wbYears.forEach(y => wbYearSet.add(y));
  updateWetbulbBarChart(currentYear);
});

/* ============================================================
   EMISSIONS DATA LOAD
   ============================================================ */

Promise.all([
  d3.json(worldGeoJSONUrl), // still loaded but unused now
  d3.csv(csvFile, (d) => {
    const total = +d["Total"];
    const perCapita = +d["Per Capita"];
    const year = +d["Year"];

    return {
      country: d["Country"],
      iso3: d["ISO 3166-1 alpha-3"],
      year,
      total: isNaN(total) ? 0 : total,
      perCapita: isNaN(perCapita) ? 0 : perCapita,
    };
  }),
])
  .then(init)
  .catch((err) => {
    console.error("Error loading data:", err);
    alert("Error loading CO₂ data. Check the console for details.");
  });

/* ============================================================
   INIT
   ============================================================ */

function init([worldData, rows]) {
  rows = rows.filter(
    (d) => d.iso3 && d.year >= minYear && d.year <= maxYear
  );

  emissionsByKey = new Map();
  rows.forEach((d) => emissionsByKey.set(`${d.iso3}-${d.year}`, d));

  rowsByYear = d3.group(rows, (d) => d.year);

  const totals = rows.map((d) => d.total).filter((v) => v > 0);
  const perCaps = rows.map((d) => d.perCapita).filter((v) => v > 0);

  const totalMin = d3.min(totals);
  const totalMax = d3.max(totals);
  const perCapMin = d3.min(perCaps);
  const perCapMax = d3.max(perCaps);

  const heatBlackInterpolator = d3.interpolateRgbBasis([
    "#ffffff",  // white
    "#fdf1d5",  // pale cream
    "#f7cfa2",  // light tan
    "#ea7d4a",  // orange
    "#c43826",  // strong red
    "#6d0f0d",  // deep red / brown
    "#000000"   // black
  ]);

  colorScales = {
    total: d3
      .scaleSequentialLog(heatBlackInterpolator)
      .domain([totalMin, totalMax]),
    perCapita: d3
      .scaleSequentialLog(heatBlackInterpolator)
      .domain([perCapMin, perCapMax]),
  };

  // FIRST SCROLL STEP
  const firstStep = document.querySelector("#emissions .emissions_step");
  if (firstStep) {
    if (firstStep.dataset.year) currentYear = +firstStep.dataset.year;
    if (firstStep.dataset.metric) currentMetric = firstStep.dataset.metric;
  }

  updateAll();
  setupScrollama();
}

/* ============================================================
   UPDATERS
   ============================================================ */

function updateAll() {
  updateStatusText();
  updateBarChart();
  updateWetbulbBarChart(currentYear);
}

function updateStatusText() {
  const metricText =
    currentMetric === "total"
      ? "Total fossil CO₂ emissions (MtCO₂)"
      : "Per-capita fossil CO₂ emissions (t/person)";

  statusEl.text(`${metricText} · Year: ${currentYear}`);
}

/* ============================================================
   SCROLLAMA
   ============================================================ */

function setupScrollama() {
  scroller = scrollama();

  scroller
    .setup({
      step: "#emissions .emissions_step",
      offset: 0.6,
      debug: false,
    })
    .onStepEnter((response) => {
      const el = response.element;

      d3.selectAll("#emissions .emissions_step").classed("is-active", false);
      d3.select(el).classed("is-active", true);

      const yearAttr = el.dataset.year;
      const metricAttr = el.dataset.metric;

      if (yearAttr) currentYear = +yearAttr;
      if (metricAttr) currentMetric = metricAttr;

      updateAll();
    });

  window.addEventListener("resize", () => scroller.resize());
}