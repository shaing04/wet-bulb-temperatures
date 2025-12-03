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
const legendContainer = d3.select("#legend");
const topListContainer = d3.select("#top-list");
const statusEl = d3.select("#status");

// projection
const projection = d3
  .geoNaturalEarth1()
  .scale(mapWidth / 1.5 / Math.PI)
  .translate([mapWidth / 2, mapHeight / 2.1]);

const geoPath = d3.geoPath(projection);

// state
let currentMetric = "total"; // "total" or "perCapita"
let currentYear = 1850;

let colorScales = {};
let emissionsByKey;
let rowsByYear;
let countryPaths;
let scroller;

// formatting
const formatTotal = d3.format(".2s");
const formatPerCapita = d3.format(".2f");

function formatValue(metric, value) {
  if (value == null || !isFinite(value)) return "no data";
  if (metric === "total") return `${formatTotal(value)} MtCO₂`;
  return `${formatPerCapita(value)} t/person`;
}

// load data
Promise.all([
  d3.json(worldGeoJSONUrl),
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

// init
function init([worldData, rows]) {
  // filter to valid range and valid ISO
  rows = rows.filter(
    (d) => d.iso3 && d.year >= minYear && d.year <= maxYear
  );

  // map ISO to row
  emissionsByKey = new Map();
  rows.forEach((d) => {
    emissionsByKey.set(`${d.iso3}-${d.year}`, d);
  });

  // group by year
  rowsByYear = d3.group(rows, (d) => d.year);

  // color domains
  const totals = rows.map((d) => d.total).filter((v) => v > 0);
  const perCaps = rows.map((d) => d.perCapita).filter((v) => v > 0);

  const totalMin = d3.min(totals);
  const totalMax = d3.max(totals);
  const perCapMin = d3.min(perCaps);
  const perCapMax = d3.max(perCaps);

  colorScales = {
    total: d3
      .scaleSequentialLog(d3.interpolateYlOrRd)
      .domain([totalMin, totalMax]),
    perCapita: d3
      .scaleSequentialLog(d3.interpolateBlues)
      .domain([perCapMin, perCapMax]),
  };

  // draw countries
  countryPaths = svg
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(worldData.features)
    .join("path")
    .attr("class", "country")
    .attr("d", geoPath)
    .on("mouseover", handleMouseOver)
    .on("mousemove", handleMouseMove)
    .on("mouseout", handleMouseOut);

  // first step as initial state
  const firstStep = document.querySelector("#emissions .emissions_step");
  if (firstStep) {
    if (firstStep.dataset.year) currentYear = +firstStep.dataset.year;
    if (firstStep.dataset.metric) currentMetric = firstStep.dataset.metric;
  }

  updateAll();

  // initiate scrollama
  setupScrollama();
}

// updaters
function updateAll() {
  updateMapColors();
  updateLegend();
  updateTopList();
  updateStatusText();
}

function getEmissionValue(iso3, year, metric) {
  const row = emissionsByKey.get(`${iso3}-${year}`);
  if (!row) return null;
  return row[metric];
}

function getCountryFill(iso3, year, metric) {
  const value = getEmissionValue(iso3, year, metric);
  if (value == null || !isFinite(value) || value <= 0) {
    return "#f0f0f0";
  }
  return colorScales[metric](value);
}

function updateMapColors() {
  countryPaths
    .classed("no-data", (d) => {
      const v = getEmissionValue(d.id, currentYear, currentMetric);
      return v == null || !isFinite(v) || v <= 0;
    })
    .transition()
    .duration(600)
    .attr("fill", (d) => getCountryFill(d.id, currentYear, currentMetric));

  // Highlight top 10
  const topIsoSet = new Set(
    getTopRows(currentMetric, currentYear).map((d) => d.iso3)
  );

  countryPaths.classed("top-offender", (d) => topIsoSet.has(d.id));
}

function updateStatusText() {
  const metricText =
    currentMetric === "total"
      ? "Total fossil CO₂ emissions (MtCO₂)"
      : "Per-capita fossil CO₂ emissions (t/person)";

  statusEl.text(`${metricText} · Year: ${currentYear}`);
}

// legend
function updateLegend() {
  const metric = currentMetric;
  const scale = colorScales[metric];
  const [min, max] = scale.domain();

  const legendWidth = 260;
  const legendHeight = 40;
  const steps = 7;

  const values = d3.range(steps).map((i) => {
    const ratio = i / (steps - 1);
    return min * Math.pow(max / min, ratio);
  });

  legendContainer.selectAll("*").remove();

  const legendSvg = legendContainer
    .append("svg")
    .attr("width", legendWidth)
    .attr("height", legendHeight);

  const barHeight = 10;
  const barWidth = (legendWidth - 40) / (steps - 1);

  legendSvg
    .selectAll("rect")
    .data(values)
    .join("rect")
    .attr("x", (_, i) => 30 + i * barWidth - barWidth / 2)
    .attr("y", 6)
    .attr("width", barWidth)
    .attr("height", barHeight)
    .attr("fill", (d) => scale(d))
    .attr("stroke", "#eee")
    .attr("stroke-width", 0.3);

  const tickValues = [
    values[0],
    values[Math.floor(values.length / 2)],
    values[values.length - 1],
  ];
  const tickFormat = metric === "total" ? formatTotal : formatPerCapita;

  legendSvg
    .selectAll("line.tick")
    .data(tickValues)
    .join("line")
    .attr("class", "tick")
    .attr("x1", (d) => {
      const logRatio = Math.log(d / min) / Math.log(max / min);
      return 30 + logRatio * (legendWidth - 40);
    })
    .attr("x2", (d) => {
      const logRatio = Math.log(d / min) / Math.log(max / min);
      return 30 + logRatio * (legendWidth - 40);
    })
    .attr("y1", 6 + barHeight)
    .attr("y2", 6 + barHeight + 4)
    .attr("stroke", "#555")
    .attr("stroke-width", 0.8);

  legendSvg
    .selectAll("text.tick-label")
    .data(tickValues)
    .join("text")
    .attr("class", "tick-label")
    .attr("x", (d) => {
      const logRatio = Math.log(d / min) / Math.log(max / min);
      return 30 + logRatio * (legendWidth - 40);
    })
    .attr("y", 6 + barHeight + 14)
    .attr("text-anchor", (d, i) =>
      i === 0 ? "start" : i === 2 ? "end" : "middle"
    )
    .attr("fill", "#555")
    .attr("font-size", 10)
    .text((d) => tickFormat(d));
}

// top emitters
function getTopRows(metric, year, limit = 10) {
  const yearRows = rowsByYear.get(year) || [];
  return yearRows
    .filter((d) => d[metric] && d[metric] > 0)
    .sort((a, b) => d3.descending(a[metric], b[metric]))
    .slice(0, limit);
}

function updateTopList() {
  const metric = currentMetric;
  const rows = getTopRows(metric, currentYear, 10);

  topListContainer.selectAll("*").remove();

  topListContainer
    .append("h3")
    .text(
      metric === "total"
        ? `Top 10 emitters in ${currentYear} (total)`
        : `Top 10 emitters in ${currentYear} (per-capita)`
    );

  const list = topListContainer.append("ol");

  rows.forEach((d) => {
    list.append("li").text(`${d.country}: ${formatValue(metric, d[metric])}`);
  });
}

// tooltip handlers
function handleMouseOver(event, d) {
  d3.select(this).classed("hovered", true).raise();

  const total = getEmissionValue(d.id, currentYear, "total");
  const perCap = getEmissionValue(d.id, currentYear, "perCapita");

  tooltip
    .style("opacity", 1)
    .html(
      `<strong>${d.properties.name || d.id}</strong><br/>
       Year: ${currentYear}<br/>
       Total: ${formatValue("total", total)}<br/>
       Per-capita: ${formatValue("perCapita", perCap)}`
    );

  handleMouseMove(event);
}

function handleMouseMove(event) {
  const [pageX, pageY] = [event.pageX, event.pageY];
  tooltip.style("left", pageX + 10 + "px").style("top", pageY + 10 + "px");
}

function handleMouseOut() {
  d3.select(this).classed("hovered", false);
  tooltip.style("opacity", 0);
}

// scrollama setup
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
