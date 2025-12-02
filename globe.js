// --- cells ---

function _world_json(FileAttachment) {
  return FileAttachment("world.json");
}


function _wetbulb_countries(FileAttachment) {
  return FileAttachment("wetbulb_max_countries.json");
}

function _d3(require) {
  return require("https://d3js.org/d3.v4.min.js");
}

function _map(html, d3, world_json, wetbulb_countries) {
  // This is the container that will sit inside #globe-container
  const container = html`<div style="width: 100%;"></div>`;

  (async () => {
    // Wait until the container has been attached & laid out
    await new Promise(requestAnimationFrame);

    // Use the container directly instead of selecting by id
    let width = container.getBoundingClientRect().width || 800;
    let height = 500;
    const sensitivity = 75;

    let autoRotate = true;
    let hoverPause = false;

    let projection = d3.geoOrthographic()
      .scale(250)
      .center([0, 0])
      .rotate([0, -30])
      .translate([width / 2, height / 2]);

    const initialScale = projection.scale();
    let path = d3.geoPath().projection(projection);

    let svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    // Add a drop-shadow filter once
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

    // tooltip div (once per globe)
    const tooltip = d3.select("body")
      .append("div")
      .attr("id", "country-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "white")
      .style("border", "1px solid #ccc")
      .style("border-radius", "4px")
      .style("padding", "6px 8px")
      .style("font-size", "12px")
      .style("color", "#333")
      .style("box-shadow", "0 2px 4px rgba(0,0,0,0.2)")
      .style("opacity", 0);

    let globe = svg.append("circle")
      .attr("fill", "#ececec")
      .attr("stroke", "#000")
      .attr("stroke-width", "0.2")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", initialScale);

    svg
      .call(d3.drag().on("drag", () => {
        const rotate = projection.rotate();
        const k = sensitivity / projection.scale();
        projection.rotate([
          rotate[0] + d3.event.dx * k,
          rotate[1] - d3.event.dy * k
        ]);
        path = d3.geoPath().projection(projection);
        svg.selectAll("path").attr("d", path);
      }))
      .call(d3.zoom().on("zoom", () => {
        if (d3.event.transform.k > 0.3) {
          projection.scale(initialScale * d3.event.transform.k);
          path = d3.geoPath().projection(projection);
          svg.selectAll("path").attr("d", path);
          globe.attr("r", projection.scale());
        } else {
          d3.event.transform.k = 0.3;
        }
      }));

    let mapGroup = svg.append("g");

    let data = await world_json.json();

    // Load all-year wet-bulb data: { "2050": {country: value, ...}, "2060": {...}, ... }
    const allYears = await wetbulb_countries.json();  // <-- use the parameter
    const yearKeys = Object.keys(allYears).sort();

    // pick an initial year to show
    let currentYear = yearKeys.includes("2025") ? "2025" : yearKeys[0];

    // object used when coloring countries
    let wb = allYears[currentYear];

    // Color scale for wet-bulb (°C)
    const color = d3.scaleThreshold()
      .domain([20, 22, 24, 26, 28, 30, 31])   // ← last bin ends at 31
      .range([
        "#FDFDFD",  // <20
        "#FCF0DA",  // 20–22
        "#F5CA98",  // 22–24
        "#E8885A",  // 24–26
        "#BF3B23",  // 26–28
        "#801B0A",  // 28–30
        "#4A0707",  // 30–31 (optional adjustment)
        "#000000"   // ≥31  ← everything hotter goes here
      ]);

    // --- Countries --- //
    const countries = mapGroup.append("g")
      .attr("class", "countries")
      .selectAll("path")
      .data(data.features)
      .enter().append("path")
      .attr("class", d => "country_" + d.properties.name.replace(" ", "_"))
      .attr("d", path)
      .attr("fill", d => {
        const name = d.properties.name;
        const v = wb[name];
        if (v == null || isNaN(v)) return "#ececec";
        return color(v);
      })
      .style("stroke", "black")
      .style("stroke-width", 0.3)
      .style("opacity", 0.95);

    // --- Tooltip + hover + click-to-lock --- //
    countries
      .on("mouseover", function (d) {
        hoverPause = true;

        const name = d.properties.name;
        const v = wb[name];

        d3.select(this)
          .style("stroke-width", 2)
          .style("stroke", "#000000")
          .attr("filter", "url(#country-shadow)");

        let html = `<strong>${name}, ${currentYear}</strong>`;
        if (v != null && !isNaN(v)) {
          html += `<br/>Max wet-bulb: ${v.toFixed(1)} °C`;
        } else {
          html += `<br/><em>No data</em>`;
        }

        tooltip
          .style("opacity", 1)
          .html(html);
      })
      .on("mousemove", function () {
        tooltip
          .style("left", (d3.event.pageX + 12) + "px")
          .style("top",  (d3.event.pageY + 12) + "px");
      })
      .on("mouseout", function () {
        hoverPause = false;

        d3.select(this)
          .style("stroke-width", 0.3)
          .style("stroke", "black")
          .attr("filter", null);

        tooltip
          .style("opacity", 0);
      })
      .on("click", function (d) {
        // toggle auto-rotation
        autoRotate = !autoRotate;

        if (!autoRotate) {
          d3.select(this)
            .style("stroke-width", 2.5)
            .style("stroke", "#000000ff")
            .attr("filter", "url(#country-shadow)");
        } else {
          d3.select(this)
            .style("stroke-width", 0.3)
            .style("stroke", "black")
            .attr("filter", null);
        }
      });

    // --- Year slider UI under the globe --- //
    const controls = d3.select(container)
      .append("div")
      .style("margin-top", "8px")
      .style("display", "flex")
      .style("align-items", "center")
      .style("gap", "8px")
      .style("font-family", "sans-serif")
      .style("font-size", "12px");

    controls.append("span").text("Year:");

    const yearLabel = controls.append("span")
      .attr("class", "year-label")
      .text(currentYear);

    const slider = controls.append("input")
      .attr("type", "range")
      .attr("min", d3.min(yearKeys))
      .attr("max", d3.max(yearKeys))
      .attr("step", 5)
      .attr("value", d3.min(yearKeys))
      .style("flex", "1");

    slider.on("input", function () {
      const newYear = this.value;          // e.g. "2050"
      currentYear = newYear;
      yearLabel.text(newYear);

      // update reference to the current year's data
      wb = allYears[newYear];

      // Recolor countries smoothly
      countries.transition().duration(300)
        .attr("fill", d => {
          const name = d.properties.name;
          const v = wb[name];
          if (v == null || isNaN(v)) return "#ececec";
          return color(v);
        });
    });

    // --- Auto-rotate timer --- //
    d3.timer(function () {
      if (!autoRotate || hoverPause) return;

      const rotate = projection.rotate();
      const k = sensitivity / projection.scale();
      projection.rotate([
        rotate[0] - .3 * k,
        rotate[1]
      ]);

      svg.selectAll("path").attr("d", path);
    }, 1);
  })();

  // Return the container so Observable/Inspector can mount it
  return container;
}


// --- Observable define() wrapper ---

export default function define(runtime, observer) {
    const main = runtime.module();
    function toString() { return this.url; }

    const fileAttachments = new Map([
      [
        "world.json",
        {
          url: new URL("data/world.json", import.meta.url),
          mimeType: "application/json",
          toString
        }
      ],
      [
        "wetbulb_max_countries.json",
        {
          url: new URL("data/wetbulb_max_countries.json", import.meta.url),
          mimeType: "application/json",
          toString
        }
      ]
    ]);

    main.builtin("FileAttachment", runtime.fileAttachments(name => fileAttachments.get(name)));

    // Hidden helper cells
    main.variable().define("world_json", ["FileAttachment"], _world_json);
    main.variable().define("wetbulb_countries", ["FileAttachment"], _wetbulb_countries);
    main.variable().define("d3", ["require"], _d3);

    // Visible cell
    main.variable(observer("map"))
      .define("map", ["html", "d3", "world_json", "wetbulb_countries"], _map);;

    return main;
  }
