// ----------------------------------------------------
// 🔒 CONFIGURATION
// ----------------------------------------------------
// ⚠️ PASTE YOUR TOKEN HERE
mapboxgl.accessToken = 'pk.eyJ1IjoiYW5pc2hrYXJ0aGljIiwiYSI6ImNtaW11eDF3ODFkNHYzZHM0YmhjZWtsY2EifQ.e348Mf0727rJCGBX7rJzpA'; 
// ----------------------------------------------------

let userLocation = null;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    center: [77.1734, 31.1048], // Shimla
    zoom: 16, 
    pitch: 60,
    bearing: -20
});

// Setup Navigation Engine (Hidden UI)
const directions = new MapboxDirections({
    accessToken: mapboxgl.accessToken,
    unit: 'metric',
    profile: 'mapbox/walking',
    controls: { inputs: false, instructions: false },
    interactive: false
});
map.addControl(directions, 'top-left');

// --- 1. LOAD LAYERS ---
map.on('load', () => {
    // Terrain
    map.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
    });
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

    // 3D Buildings with Logic
    map.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
            'fill-extrusion-color': [
                'case',
                ['any', ['>=', ['get', 'building:levels'], 2], ['>=', ['get', 'height'], 6]], 
                '#4CAF50', // Safe Green
                '#ff4444'  // Unsafe Red
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.9
        }
    });

    console.log("Map Loaded.");
});

// --- 2. SEARCH BAR ---
const geocoder = new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    marker: false,
    placeholder: "Search town or village...",
    collapsed: false
});
document.getElementById('geocoder-container').appendChild(geocoder.onAdd(map));

// --- 3. SCANNER LOGIC ---
// Runs when map stops moving or finishes loading
map.on('idle', scanForBuildings);

function scanForBuildings() {
    const listContainer = document.getElementById('building-list');

    // Zoom Check
    if (map.getZoom() < 15) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search-plus"></i>
                <p>Zoom in closer to scan.</p>
            </div>`;
        return;
    }

    // Query Data
    const features = map.queryRenderedFeatures({ layers: ['3d-buildings'] });

    // Filter Safe Buildings
    const safeBuildings = features.filter(f => {
        const levels = f.properties['building:levels'];
        const height = f.properties['height'];
        return (levels >= 2) || (height >= 6);
    });

    // Remove Duplicates
    const uniqueBuildings = [];
    const seenIds = new Set();
    safeBuildings.forEach(f => {
        if (!seenIds.has(f.id)) {
            seenIds.add(f.id);
            uniqueBuildings.push(f);
        }
    });

    // Sort by Height
    uniqueBuildings.sort((a, b) => (b.properties.height || 0) - (a.properties.height || 0));

    // Render
    renderCards(uniqueBuildings.slice(0, 10)); 
}

function renderCards(buildings) {
    const container = document.getElementById('building-list');
    container.innerHTML = '';

    if (buildings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-city"></i>
                <p>No tall buildings found in this view.</p>
            </div>`;
        return;
    }

    buildings.forEach((b, index) => {
        const height = b.properties.height ? Math.round(b.properties.height) : '?';
        const floors = b.properties['building:levels'] || '2+';
        
        const card = document.createElement('div');
        card.className = 'building-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">Refuge Point #${index + 1}</span>
                <span class="badge">SAFE</span>
            </div>
            <div class="stat-row">
                <div class="stat"><i class="fas fa-ruler-vertical"></i> ${height}m</div>
                <div class="stat"><i class="fas fa-layer-group"></i> ${floors} Floors</div>
            </div>
            <div class="nav-btn">
                <i class="fas fa-location-arrow"></i> Navigate Here
            </div>
        `;

        card.onclick = () => {
            // Visual Feedback
            document.querySelectorAll('.building-card').forEach(c => c.style.borderLeft = '4px solid #4CAF50');
            card.style.borderLeft = '4px solid #2196F3';

            // Navigate
            const dest = map.getCenter(); // Approximating destination
            
            if (userLocation) {
                directions.setOrigin(userLocation);
                directions.setDestination(dest);
            } else {
                alert("Waiting for GPS... Routing from map center.");
                directions.setOrigin(map.getCenter());
                directions.setDestination(dest);
            }
        };

        container.appendChild(card);
    });
}

// --- 4. GPS TRACKING ---
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
        userLocation = [pos.coords.longitude, pos.coords.latitude];
        document.getElementById('user-status').innerHTML = '<span style="color:#4CAF50"><i class="fas fa-check-circle"></i> GPS Active</span>';
        
        new mapboxgl.Marker({ color: '#2196F3' })
            .setLngLat(userLocation)
            .addTo(map);
    });
}