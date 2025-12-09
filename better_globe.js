// globe.js
// Hybrid canvas + SVG wet-bulb globe
// - Canvas: ocean, atmosphere glow, heatmap dots from grid Twb
// - SVG: country outlines, tooltips, year slider behavior

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

// ------------------------------
// Config
// ------------------------------

// Years you have data for:
const years = [2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100];

// Country-level Twb (for tooltip & SVG fill)
const countries_json = "data/wetbulb_max_countries.json";

// Grid CSVs for heatmap:
const grid_files = {
    2030: "data/wetbulb_2030.csv",
    2040: "data/wetbulb_2040.csv",
    2050: "data/wetbulb_2050.csv",
    2060: "data/wetbulb_2060.csv",
    2070: "data/wetbulb_2070.csv",
    2080: "data/wetbulb_2080.csv",
    2090: "data/wetbulb_2090.csv",
    2100: "data/wetbulb_2100.csv"
};

// World GeoJSON
const world_json = "data/world.json";

// Colors
const sea_color = "#eeeeeeff";
const atmosphere_inner = "rgba(103, 103, 103, 0)";
const atmosphere_outer = "rgba(125, 154, 199, 0.03)";

// Country wet-bulb threshold scale (for fill + heat colors)
const twbColor = d3
    .scaleThreshold()
    .domain([20, 22, 24, 26, 28, 30, 31]) // last bin is 31; ≥31 => last color
    .range([
        "#FDFDFD",  // <20
        "#FCF0DA",  // 20–22
        "#F5CA98",  // 22–24
        "#E8885A",  // 24–26
        "#BF3B23",  // 26–28
        "#801B0A",  // 28–30
        "#4A0707",  // 30–31
        "#000000"   // ≥31
    ]);

// ------------------------------
// State
// ------------------------------

let projection;
let geoPath;
let svg;
let canvas;
let ctx;
let countriesSelection;
let selectedCountry = null;
let worldGeo;
let countryTwbByYear;  // { "2025": { country: value, ... }, ... }
let gridCache = {};    // { year: [ {lat,lon,twb}, ... ] }
let currentYear;
let autoRotate = true;
let hoverPause = false;
let isDragging = false;
let dragStart = null;
let rotationStart = null;
let rotateTimer = null;

// ------------------------------
// Init entry
// ------------------------------

document.addEventListener("DOMContentLoaded", initGlobe);

function initGlobe() {
    const wrapper = document.getElementById("wetbulb-globe-wrapper");
    if (!wrapper) {
        console.warn("[globe] No #wetbulb-globe-wrapper found");
        return;
    }

    // Create canvas + SVG
    canvas = document.createElement("canvas");
    svg = d3.select(wrapper)
        .append("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg");

    wrapper.prepend(canvas); // canvas under svg

    ctx = canvas.getContext("2d");

    setupTooltip();
    setupSlider();

    // Load world + country Twb in parallel
    Promise.all([
        d3.json(world_json),
        d3.json(countries_json)
    ]).then(([world, countryTwb]) => {
        worldGeo = world;
        countryTwbByYear = countryTwb;

        setupProjectionAndSize();
        drawCountriesLayer();   // initial countries
        const defaultYear = years.includes(2025) ? 2025 : years[0];
        setYear(defaultYear);

        setupInteraction();
        startAutoRotate();

        window.addEventListener("resize", () => {
            setupProjectionAndSize();
            drawCountriesLayer();
            drawCanvasLayer();
        });
    }).catch(err => {
        console.error("[globe] Failed to load data:", err);
    });
}

// ------------------------------
// Projection & sizing
// ------------------------------

function setupProjectionAndSize() {
    const wrapper = document.getElementById("wetbulb-globe-wrapper");
    const rect = wrapper.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 500;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    svg
        .attr("width", width)
        .attr("height", height);

    projection = d3.geoOrthographic()
        .scale(Math.min(width, height) / 2.3)
        .center([0, 0])
        .rotate([-30, -20])
        .translate([width / 2, height / 2])
        .clipAngle(90);

    geoPath = d3.geoPath().projection(projection);
}

// ------------------------------
// Slider
// ------------------------------

function updateSliderFill(slider) {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const val = Number(slider.value);

    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty("--percent", percent + "%");
}

function setupSlider() {
    const slider = document.getElementById("wetbulb-year-slider");
    const label  = document.getElementById("wetbulb-year-label");
    if (!slider) return;

    const defaultYear = years.includes(2030) ? 2030 : years[0];

    slider.min  = 0;
    slider.max  = years.length - 1;
    slider.step = 1;
    slider.value = String(years.indexOf(defaultYear));

    if (label) label.textContent = String(defaultYear);

    // Initialize fill immediately
    updateSliderFill(slider);

    slider.addEventListener("input", () => {
        const idx  = +slider.value;
        const year = years[idx];

        setYear(year);
        updateSliderFill(slider);   // ← FIXED: update gradient fill
    });
}

function setYear(year) {
    currentYear = year;
    const label = document.getElementById("wetbulb-year-label");
    if (label) label.textContent = String(year);

    // Recolor country fills
    if (countriesSelection && countryTwbByYear) {
        const wb = countryTwbByYear[String(year)] || {};
        countriesSelection
            .transition()
            .duration(300)
            .attr("fill", "transparent");
    }

    // Load grid and redraw canvas
    loadGridForYear(year).then(() => {
        drawCanvasLayer();
    });
}

// ------------------------------
// Countries (SVG layer)
// ------------------------------

function drawCountriesLayer() {
    if (!worldGeo || !projection) return;

    svg.selectAll("*").remove();

    const width = +svg.attr("width");
    const height = +svg.attr("height");

    // globe outline
    const globeCircle = svg.append("circle")
        .attr("cx", width / 2)
        .attr("cy", height / 2)
        .attr("r", projection.scale())
        .attr("fill", "none")
        .attr("stroke", "#000")
        .attr("stroke-width", 0.3);

    // shadow filter
    const defs = svg.append("defs");
    const filter = defs.append("filter")
        .attr("id", "country-shadow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");

    filter.append("feDropShadow")
        .attr("dx", 0)
        .attr("dy", 0)
        .attr("stdDeviation", 3)
        .attr("flood-color", "rgba(0,0,0,0.4)");

    const wb = countryTwbByYear && currentYear
        ? countryTwbByYear[String(currentYear)]
        : {};

    countriesSelection = svg.append("g")
        .attr("class", "countries")
        .selectAll("path")
        .data(worldGeo.features)
        .enter()
        .append("path")
        .attr("d", geoPath)
        .attr("fill", "transparent")
        .attr("stroke", "black")
        .attr("stroke-width", 0.3)
        .style("opacity", 0.95);

    attachCountryEvents();
}

// ------------------------------
// Tooltip
// ------------------------------

let tooltipDiv = null;

function setupTooltip() {
    tooltipDiv = document.createElement("div");
    tooltipDiv.className = "globe-tooltip";
    document.body.appendChild(tooltipDiv);
}

function attachCountryEvents() {
    if (!countriesSelection || !tooltipDiv) return;

    countriesSelection
        .on("mouseover", (event, d) => {
            hoverPause = true;
            const wb = countryTwbByYear && currentYear
                ? countryTwbByYear[String(currentYear)]
                : {};
            const name = d.properties.name;
            const v = wb ? wb[name] : null;

            if (selectedCountry !== d.properties.name) {
                d3.select(event.currentTarget)
                    .attr("stroke-width", 2)
                    .attr("stroke", "#000")
                    .attr("filter", "url(#country-shadow)");
            }

            let html = `<strong>${name}, ${currentYear}</strong>`;
            if (v != null && !isNaN(v)) {
                html += `<br/>Max wet-bulb: ${v.toFixed(1)} °C`;
            } else {
                html += `<br/><em>No data</em>`;
            }

            tooltipDiv.innerHTML = html;
            tooltipDiv.style.opacity = 1;
            tooltipDiv.style.left = event.pageX + 12 + "px";
            tooltipDiv.style.top = event.pageY + 12 + "px";
        })
        .on("mousemove", (event) => {
            tooltipDiv.style.left = event.pageX + 12 + "px";
            tooltipDiv.style.top = event.pageY + 12 + "px";
        })
        .on("mouseout", (event) => {
            hoverPause = false;
            d3.select(event.currentTarget)
                .attr("stroke-width", 0.3)
                .attr("stroke", "black")
                .attr("filter", null);
            tooltipDiv.style.opacity = 0;
        })
        .on("click", (event, d) => {
            const name = d.properties.name;

            // CASE 1 — Clicking the same selected country → unselect it
            if (selectedCountry === name) {
                selectedCountry = null;     // clear selection
                autoRotate = true;          // resume auto-rotation

                d3.select(event.currentTarget)
                    .attr("stroke-width", 0.3)
                    .attr("stroke", "black")
                    .attr("filter", null);

                return;
            }

            // CASE 2 — Clicking a NEW country → move selection
            selectedCountry = name;
            autoRotate = false;             // stop globe rotation

            // Reset all borders
            countriesSelection
                .attr("stroke-width", 0.3)
                .attr("stroke", "black")
                .attr("filter", null);

            // Highlight the newly selected country
            d3.select(event.currentTarget)
                .attr("stroke-width", 2.5)
                .attr("stroke", "#000")
                .attr("filter", "url(#country-shadow)");
        });
}

// ------------------------------
// Grid / heatmap data
// ------------------------------

function loadGridForYear(year) {
    if (gridCache[year]) {
        return Promise.resolve(gridCache[year]);
    }

    const file = grid_files[year];
    if (!file) {
        console.warn("[globe] No grid file configured for year", year);
        gridCache[year] = [];
        return Promise.resolve([]);
    }

    return d3.csv(file, d => ({
        lat: +d.lat,
        lon: +d.lon,
        twb: +d.twb
    })).then(rows => {
        // optional: filter NaN
        gridCache[year] = rows.filter(r =>
            isFinite(r.lat) && isFinite(r.lon) && isFinite(r.twb)
        );
        return gridCache[year];
    }).catch(err => {
        console.error("[globe] Failed to load grid CSV for year", year, ":", err);
        gridCache[year] = [];
        return [];
    });
}

// ------------------------------
// Canvas drawing
// ------------------------------

function drawCanvasLayer() {
    if (!ctx || !projection) return;

    const wrapper = document.getElementById("wetbulb-globe-wrapper");
    const rect = wrapper.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 500;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;  // ensure we start fully opaque

    const scale = projection.scale();
    if (!isFinite(scale) || scale <= 0) return;

    const cx = width / 2;
    const cy = height / 2;
    const r = Math.max(1, scale - 4);

    // ---- OCEAN (opaque) ----
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sea_color;
    ctx.fill();

    // ---- ATMOSPHERE GLOW ----
    const glowGrad = ctx.createRadialGradient(
        cx, cy, r * 0.95,
        cx, cy, r * 1.1
    );
    glowGrad.addColorStop(0, atmosphere_inner);
    glowGrad.addColorStop(1, atmosphere_outer);

    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // ---- HEAT DOTS ----
    const grid = gridCache[currentYear] || [];
    const domain = twbColor.domain();
    const maxVal = domain[domain.length - 1] || 1;

    // center of the visible hemisphere in geographic coords
    const [rotLambda, rotPhi] = projection.rotate();       // e.g. [-30, -20, 0]
    const viewCenter = [-rotLambda, -rotPhi];              // the point we're "looking at"

    ctx.lineWidth = 0;
    ctx.strokeStyle = "transparent";

    grid.forEach(d => {
        const v = d.twb;

        // Skip cold / irrelevant cells
        if (!isFinite(v) || v < 20) return;

        // Skip points on the back side of the globe
        const dist = d3.geoDistance([d.lon, d.lat], viewCenter);
        if (dist > Math.PI / 2) return; // more than 90° away → back hemisphere

        const coords = projection([d.lon, d.lat]);
        if (!coords) return;

        const [x, y] = coords;

        const color = twbColor(v);

        const intensity = Math.min(
            1,
            Math.max(0, (v - 20) / ((maxVal - 20) || 1))
        );
        const radius = 1.6 + intensity * 1.8;
        const alpha = 0.15 + intensity * 0.6;

        ctx.beginPath();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.globalAlpha = 1;
}

// ------------------------------
// Interaction (drag + auto-rotate)
// ------------------------------

function setupInteraction() {
    const wrapper = document.getElementById("wetbulb-globe-wrapper");
    if (!wrapper) return;

    svg.on("mousedown", (event) => {
        isDragging = true;
        dragStart = [event.clientX, event.clientY];
        rotationStart = projection.rotate();
    });

    window.addEventListener("mousemove", (event) => {
        if (!isDragging || !rotationStart) return;
        const dx = event.clientX - dragStart[0];
        const dy = event.clientY - dragStart[1];
        const sensitivity = 0.3;

        const newRotate = [
            rotationStart[0] + dx * sensitivity,
            rotationStart[1] - dy * sensitivity,
            rotationStart[2]
        ];
        projection.rotate(newRotate);
        if (countriesSelection) {
            countriesSelection.attr("d", geoPath);
        }
        drawCanvasLayer();
    });

    window.addEventListener("mouseup", () => {
        isDragging = false;
    });
}

function startAutoRotate() {
    if (rotateTimer) return;

    rotateTimer = d3.timer(() => {
        if (!projection || !countriesSelection) return;
        if (!autoRotate || hoverPause || isDragging) return;

        const rotate = projection.rotate();
        const k = 0.03; // speed
        projection.rotate([rotate[0] - k, rotate[1], rotate[2]]);

        countriesSelection.attr("d", geoPath);
        drawCanvasLayer();
    });
}
