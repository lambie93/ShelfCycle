const mapStatus = document.getElementById("mapStatus");
const libraryList = document.getElementById("libraryList");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function pointInPolygon(lon, lat, geometry) {
    // Polygon: first ring is the outer boundary, later rings are holes
    if (!pointInRing(lon, lat, geometry.coordinates[0])) return false;
    return !geometry.coordinates.slice(1).some((hole) => pointInRing(lon, lat, hole));
}

function isLittleFree(tags) {
    return (
        tags.amenity === "public_bookcase" ||
        tags["library:type"] === "little_free_library" ||
        /little free/i.test(tags.name || "")
    );
}

async function init() {
    const res = await fetch("/data/ny18.geojson");
    const district = await res.json();
    const geometry = district.features[0].geometry;

    const map = L.map("map");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(map);

    const layer = L.geoJSON(district, {
        style: { color: "#428a9b", weight: 3, fillColor: "#428a9b", fillOpacity: 0.08 },
    }).addTo(map);
    map.fitBounds(layer.getBounds());

    const bounds = layer.getBounds();
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
    const query = `
        [out:json][timeout:60];
        (
            node["amenity"="library"](${bbox});
            way["amenity"="library"](${bbox});
            node["amenity"="public_bookcase"](${bbox});
            way["amenity"="public_bookcase"](${bbox});
        );
        out center tags;
    `;

    try {
        const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: `data=${encodeURIComponent(query)}`,
        });
        if (!overpassRes.ok) throw new Error();
        const data = await overpassRes.json();

        const libraries = data.elements
            .map((el) => ({
                name: (el.tags && el.tags.name) || (isLittleFree(el.tags || {}) ? "Little Free Library" : "Library"),
                lat: el.lat ?? (el.center && el.center.lat),
                lon: el.lon ?? (el.center && el.center.lon),
                little: isLittleFree(el.tags || {}),
                operator: el.tags && el.tags.operator,
            }))
            .filter((lib) => lib.lat != null && pointInPolygon(lib.lon, lib.lat, geometry))
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const lib of libraries) {
            L.circleMarker([lib.lat, lib.lon], {
                radius: 7,
                color: lib.little ? "#5b7c42" : "#428a9b",
                fillColor: lib.little ? "#5b7c42" : "#428a9b",
                fillOpacity: 0.9,
                weight: 2,
            })
                .addTo(map)
                .bindPopup(`<strong>${escapeHtml(lib.name)}</strong><br>${lib.little ? "Little free library" : "Public library"}`);
        }

        const publicCount = libraries.filter((l) => !l.little).length;
        const littleCount = libraries.length - publicCount;
        mapStatus.textContent = `${publicCount} public libraries and ${littleCount} little free libraries found inside District 18.`;

        libraryList.innerHTML = libraries.map((lib) => `
            <article class="mini-book">
                <strong>${escapeHtml(lib.name)}</strong>
                <span class="meta">${lib.little ? "Little free library" : "Public library"}${lib.operator ? ` · ${escapeHtml(lib.operator)}` : ""}</span>
            </article>
        `).join("");
    } catch {
        mapStatus.textContent = "Could not load library data right now. Please reload to try again.";
    }
}

init();
