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
   DATA LOAD
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