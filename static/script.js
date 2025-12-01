// ----------------------------------------------------
// ⚠️ PASTE YOUR TOKEN HERE
mapboxgl.accessToken = 'pk.eyJ1IjoiYW5pc2hrYXJ0aGljIiwiYSI6ImNtaW11eDF3ODFkNHYzZHM0YmhjZWtsY2EifQ.e348Mf0727rJCGBX7rJzpA'; 
// ----------------------------------------------------

let userLocation = null;
let shouldScan = false; // Flag to control when to scan
let pinLocation = null; // Stores the cursor pin location
let pinMarker = null; // Mapbox marker for the pin
let isPinMode = false; // Toggle for pin placement mode
let allBuildings = []; // Store all scanned buildings for navigation view

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    center: [77.1734, 31.1048], // Shimla Default
    zoom: 16, 
    pitch: 60,
    bearing: -20
});

// Navigation Engine
const directions = new MapboxDirections({
    accessToken: mapboxgl.accessToken,
    unit: 'metric',
    profile: 'mapbox/walking',
    controls: { inputs: false, instructions: false },
    interactive: false
});
map.addControl(directions, 'top-left');

// --- 2. LOAD LAYERS ---
map.on('load', () => {
    map.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
    });
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

    // Check if layer exists, if not create it
    if (!map.getLayer('3d-buildings')) {
        map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 14,
            'paint': {
                'fill-extrusion-color': [
                    'case',
                    ['any', ['>=', ['get', 'building:levels'], 2], ['>=', ['get', 'height'], 6]], 
                    '#4CAF50', // Green for Safe
                    '#ff4444'  // Red for others
                ],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-opacity': 0.9
            }
        });
    }
    
    console.log('Map fully loaded. Ready to scan buildings.');
});

// --- 2. SEARCH FUNCTIONALITY WITH SUGGESTIONS ---
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const suggestionsDiv = document.getElementById('suggestions');
    let searchTimeout;
    
    console.log('Search elements found:', !!searchInput, !!suggestionsDiv);

    if (!searchInput || !suggestionsDiv) {
        console.error('Search elements not found!');
        return;
    }

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        console.log('Search query:', query);
        
        if (query.length < 2) {
            suggestionsDiv.classList.remove('active');
            return;
        }
        
        searchTimeout = setTimeout(() => {
            // Get suggestions from Mapbox Geocoding API with more specific types
            fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&limit=5&types=address,poi,locality`)
                .then(r => r.json())
                .then(data => {
                    console.log('Suggestions received:', data.features?.length);
                    suggestionsDiv.innerHTML = '';
                    
                    if (data.features && data.features.length > 0) {
                        data.features.forEach(feature => {
                            const item = document.createElement('div');
                            item.className = 'suggestion-item';
                            item.innerHTML = `
                                <i class="fas fa-map-marker-alt"></i>
                                <div class="suggestion-text">
                                    <span class="suggestion-primary">${feature.text}</span>
                                    <span class="suggestion-secondary">${feature.place_name.split(',').slice(1).join(',') || 'Location'}</span>
                                </div>
                            `;
                            
                            item.onclick = () => selectSuggestion(feature);
                            suggestionsDiv.appendChild(item);
                        });
                        
                        suggestionsDiv.classList.add('active');
                    } else {
                        suggestionsDiv.classList.remove('active');
                    }
                })
                .catch(err => {
                    console.error('Suggestion error:', err);
                    suggestionsDiv.classList.remove('active');
                });
        }, 300);
    });

    function selectSuggestion(feature) {
        const [lng, lat] = feature.center;
        const placeName = feature.place_name;
        
        // Update search input
        searchInput.value = placeName;
        suggestionsDiv.classList.remove('active');
        
        // Store search location in sessionStorage for navigation page
        sessionStorage.setItem('searchLocation', JSON.stringify({
            name: placeName,
            coordinates: [lng, lat]
        }));
        
        // Fly to location
        map.flyTo({
            center: [lng, lat],
            zoom: 16,
            duration: 1000
        });
        
        document.getElementById('building-list').innerHTML = 
            `<div class="empty-state"><i class="fas fa-satellite"></i><p>Scanning ${feature.text}...</p></div>`;
        
        // Scan after map settles
        shouldScan = true;
        pinLocation = null;
        pinMarker?.remove();
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            suggestionsDiv.classList.remove('active');
        }
    });

    // My Location button handler
    const myLocationBtn = document.getElementById('my-location-btn');
    if (myLocationBtn) {
        myLocationBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert('Geolocation is not supported by your browser');
                return;
            }

            // Add loading state
            myLocationBtn.classList.add('loading');
            myLocationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    
                    // Store as search location
                    sessionStorage.setItem('searchLocation', JSON.stringify({
                        name: 'My Location',
                        coordinates: [longitude, latitude]
                    }));

                    // Update search input
                    searchInput.value = 'My Current Location';
                    suggestionsDiv.classList.remove('active');

                    // Fly to location with appropriate zoom level to capture more area
                    map.flyTo({
                        center: [longitude, latitude],
                        zoom: 14, // Zoom level 14 shows ~2km radius
                        duration: 1000
                    });

                    // Auto-pin at user's location
                    pinLocation = [longitude, latitude];
                    if (pinMarker) pinMarker.remove();
                    
                    pinMarker = new mapboxgl.Marker({ color: '#3498db' })
                        .setLngLat(pinLocation)
                        .setPopup(new mapboxgl.Popup().setHTML('<strong>My Location</strong>'))
                        .addTo(map);

                    userLocation = pinLocation;
                    
                    // Show scanning message
                    document.getElementById('building-list').innerHTML = 
                        `<div class="empty-state"><i class="fas fa-satellite"></i><p>Scanning safe places within 5km...</p></div>`;

                    // Wait for map to finish moving, then trigger scan
                    map.once('moveend', () => {
                        performScan(pinLocation);
                    });

                    // Remove loading state
                    myLocationBtn.classList.remove('loading');
                    myLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';
                },
                (error) => {
                    // Remove loading state
                    myLocationBtn.classList.remove('loading');
                    myLocationBtn.innerHTML = '<i class="fas fa-location-crosshairs"></i>';

                    let errorMessage = 'Unable to get your location. ';
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage += 'Please allow location access.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage += 'Location information unavailable.';
                            break;
                        case error.TIMEOUT:
                            errorMessage += 'Location request timed out.';
                            break;
                        default:
                            errorMessage += 'An unknown error occurred.';
                    }
                    alert(errorMessage);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
});

// --- 3. LOGIC: TRIGGER SCAN ONLY ON SEARCH OR GPS ---

// A. Handle Search - Now handled by searchInput event listener above

// B. Handle GPS Button - REMOVED (Pin location acts as virtual GPS)
// GPS functionality is now integrated with pin placement

// C. Pin Mode - Auto-pin on any map click
map.on('click', (e) => {
    pinLocation = [e.lngLat.lng, e.lngLat.lat];
    
    // Remove old pin if exists
    if (pinMarker) pinMarker.remove();
    
    // Add new pin marker
    pinMarker = new mapboxgl.Marker({ color: '#FF6B35' })
        .setLngLat(pinLocation)
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Pinned Location</strong>'))
        .addTo(map);
    
    // Set pin location as virtual user location and scan
    userLocation = pinLocation;
    shouldScan = true;
    performScan(pinLocation);
    
    console.log(`📍 Pin placed at: ${pinLocation} - Now scanning nearby buildings...`);
});

// D. The Scanner (Runs only when 'shouldScan' is true)
map.on('moveend', () => {
    if (shouldScan) {
        performScan();
        shouldScan = false; // Reset flag so it doesn't scan randomly
    }
});

// Map clicking is now automatic - no need for toggle function

// Calculate distance between two coordinates (using Haversine formula)
function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Format distance for display
function calculateDistance(lat1, lon1, lat2, lon2) {
    const distanceKm = calculateDistanceInKm(lat1, lon1, lat2, lon2);
    return distanceKm < 1 ? (distanceKm * 1000).toFixed(0) + 'm' : distanceKm.toFixed(2) + 'km';
}

// E. The Scan Function - Using Overpass API for reliable building data
function performScan(referencePoint) {
    const listContainer = document.getElementById('building-list');
    listContainer.innerHTML = `<div class="empty-state"><i class="fas fa-satellite"></i><p>Scanning structures...</p></div>`;

    let bbox;
    
    if (referencePoint) {
        // If we have a reference point (user location), create a bounding box around it
        // Radius of approximately 1.6km (0.014 degrees ≈ 1.6km) - 20 minutes walking at 5km/h
        const radius = 0.014;
        bbox = [
            referencePoint[1] - radius, // south
            referencePoint[0] - radius, // west
            referencePoint[1] + radius, // north
            referencePoint[0] + radius  // east
        ];
    } else {
        // Otherwise use current map bounds
        const bounds = map.getBounds();
        bbox = [
            bounds.getSouth(),
            bounds.getWest(),
            bounds.getNorth(),
            bounds.getEast()
        ];
    }

    console.log(`🔍 Scanning area: ${bbox.join(', ')}`);

    // Enhanced Query: Get buildings (including houses with 2+ floors) AND safe places
    const overpassQuery = `
        [bbox:${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}];
        (
            way["building"]["building:levels"~"^[2-9]|[1-9][0-9]+$"];
            way["building"="house"]["building:levels"~"^[2-9]|[1-9][0-9]+$"];
            way["building"="residential"]["building:levels"~"^[2-9]|[1-9][0-9]+$"];
            way["building"];
            relation["building"];
            node["amenity"="hospital"];
            way["amenity"="hospital"];
            node["amenity"="shelter"];
            way["amenity"="shelter"];
            node["emergency"="assembly_point"];
            way["emergency"="assembly_point"];
            node["leisure"="park"];
            way["leisure"="park"];
            node["natural"="peak"];
            way["natural"="peak"];
        );
        out geom;
    `;

    // Call Overpass API
    fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(overpassQuery),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    .then(response => response.text())
    .then(data => {
        const allPlaces = parseOverpassData(data);
        
        // Calculate distances and filter by 20-minute walking distance (1.6km)
        if (referencePoint) {
            allPlaces.forEach(p => {
                p.distanceKm = calculateDistanceInKm(referencePoint[1], referencePoint[0], p.lat, p.lon);
                p.distance = p.distanceKm < 1 ? (p.distanceKm * 1000).toFixed(0) + 'm' : p.distanceKm.toFixed(2) + 'km';
            });
            // Filter: Only show places within 1.6km (20 min walk at 5km/h)
            const filteredPlaces = allPlaces.filter(p => p.distanceKm <= 1.6);
            console.log(`✅ Found ${allPlaces.length} total places, ${filteredPlaces.length} within 20-min walking distance`);
            allPlaces.length = 0;
            allPlaces.push(...filteredPlaces);
        }
        
        console.log(`✅ Showing ${allPlaces.length} safe places and buildings`);
        
        // Categorize by safety priority
        const safePlaces = allPlaces.map(place => {
            // Assign safety score and category
            let safetyScore = 0;
            let category = 'building';
            let icon = 'fa-building';
            
            if (place.amenity === 'hospital') {
                safetyScore = 100;
                category = 'Hospital';
                icon = 'fa-hospital';
            } else if (place.amenity === 'shelter' || place.emergency === 'assembly_point') {
                safetyScore = 95;
                category = 'Emergency Shelter';
                icon = 'fa-house-circle-check';
            } else if (place.natural === 'peak') {
                safetyScore = 90;
                category = 'High Ground';
                icon = 'fa-mountain';
            } else if (place.leisure === 'park') {
                safetyScore = 70;
                category = 'Open Space';
                icon = 'fa-tree';
            } else {
                // Buildings - check height
                const levels = parseInt(place.levels) || 0;
                const height = parseFloat(place.height) || 0;
                if (levels >= 3 || height >= 9) {
                    safetyScore = 80;
                    category = 'Tall Building';
                    icon = 'fa-building';
                } else if (levels >= 2 || height >= 6) {
                    safetyScore = 60;
                    category = 'Safe Building';
                    icon = 'fa-building';
                } else {
                    safetyScore = 40;
                    category = 'Building';
                    icon = 'fa-building';
                }
            }
            
            return { ...place, safetyScore, category, icon };
        });

        // Sort by distance (nearest first)
        safePlaces.sort((a, b) => {
            const getDistanceValue = (distStr) => {
                if (!distStr) return Infinity;
                if (distStr.includes('m')) return parseFloat(distStr);
                if (distStr.includes('km')) return parseFloat(distStr) * 1000;
                return Infinity;
            };
            return getDistanceValue(a.distance) - getDistanceValue(b.distance);
        });

        document.getElementById('result-count').innerText = `${safePlaces.length} found`;
        renderCards(safePlaces.slice(0, 15)); // Show top 15
    })
    .catch(err => {
        console.error('Overpass API error:', err);
        // Fallback: Try Mapbox query
        performMapboxScan(bounds, listContainer);
    });
}

// Parse Overpass API XML response
function parseOverpassData(xmlData) {
    const places = [];
    
    try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlData, 'text/xml');
        
        // Get all elements (nodes, ways, relations)
        const nodes = xml.querySelectorAll('node');
        const ways = xml.querySelectorAll('way');
        const relations = xml.querySelectorAll('relation');

        const allElements = [...nodes, ...ways, ...relations];

        allElements.forEach(element => {
            const levels = element.querySelector('tag[k="levels"]')?.getAttribute('v');
            const height = element.querySelector('tag[k="height"]')?.getAttribute('v');
            const name = element.querySelector('tag[k="name"]')?.getAttribute('v') || null;
            const type = element.querySelector('tag[k="building"]')?.getAttribute('v') || null;
            const amenity = element.querySelector('tag[k="amenity"]')?.getAttribute('v');
            const emergency = element.querySelector('tag[k="emergency"]')?.getAttribute('v');
            const leisure = element.querySelector('tag[k="leisure"]')?.getAttribute('v');
            const natural = element.querySelector('tag[k="natural"]')?.getAttribute('v');
            const addr_street = element.querySelector('tag[k="addr:street"]')?.getAttribute('v');
            const addr_housenumber = element.querySelector('tag[k="addr:housenumber"]')?.getAttribute('v');

            // Get coordinates
            let lat = 0, lon = 0;
            
            if (element.tagName === 'node') {
                // For nodes, get lat/lon directly
                lat = parseFloat(element.getAttribute('lat'));
                lon = parseFloat(element.getAttribute('lon'));
            } else {
                // For ways/relations, calculate center from nodes
                const nodeElements = element.querySelectorAll('nd');
                let count = 0;
                nodeElements.forEach(node => {
                    const nodeLat = node.getAttribute('lat');
                    const nodeLon = node.getAttribute('lon');
                    if (nodeLat && nodeLon) {
                        lat += parseFloat(nodeLat);
                        lon += parseFloat(nodeLon);
                        count++;
                    }
                });
                if (count > 0) {
                    lat /= count;
                    lon /= count;
                }
            }

            if (lat && lon) {
                // Create a meaningful label
                let label = name;
                if (!label) {
                    if (amenity === 'hospital') label = 'Hospital';
                    else if (amenity === 'shelter') label = 'Emergency Shelter';
                    else if (emergency === 'assembly_point') label = 'Assembly Point';
                    else if (leisure === 'park') label = 'Park';
                    else if (natural === 'peak') label = 'Peak';
                    else if (addr_housenumber && addr_street) label = `${addr_street} ${addr_housenumber}`;
                    else if (addr_street) label = addr_street;
                    else if (type) label = `${type.charAt(0).toUpperCase() + type.slice(1)}`;
                    else label = 'Safe Place';
                }

                places.push({
                    name: label,
                    type: type || amenity || emergency || leisure || natural || 'safe_place',
                    levels: levels,
                    height: height,
                    lat: lat,
                    lon: lon,
                    amenity: amenity,
                    emergency: emergency,
                    leisure: leisure,
                    natural: natural,
                    id: element.getAttribute('id')
                });
            }
        });
    } catch (err) {
        console.error('Parse error:', err);
    }

    return places;
}

// Fallback: Query Mapbox if Overpass fails
function performMapboxScan(bounds, listContainer) {
    console.log('📍 Trying Mapbox query as fallback...');
    
    try {
        let features = map.queryRenderedFeatures({ 
            layers: ['3d-buildings'] 
        });
        
        if (features.length === 0) {
            features = map.querySourceFeatures('composite', {
                sourceLayer: 'building'
            });
        }

        console.log(`Mapbox features found: ${features.length}`);

        const safeBuildings = features.filter(f => {
            const levels = parseInt(f.properties['building:levels']) || 0;
            const height = parseFloat(f.properties['height']) || 0;
            return levels >= 2 || height >= 6;
        });

        console.log(`Mapbox safe buildings: ${safeBuildings.length}`);
        document.getElementById('result-count').innerText = `${safeBuildings.length} found`;
        renderCards(safeBuildings.slice(0, 15));
    } catch (err) {
        console.error('Mapbox fallback error:', err);
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Unable to scan. Please try:<br>1. Zooming in more<br>2. Moving to an urban area</p>
            </div>`;
    }
}

function renderCards(places) {
    const container = document.getElementById('building-list');
    container.innerHTML = '';

    if (places.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-city"></i>
                <p>No safe places found.<br>Try zooming in or searching a different area.</p>
            </div>`;
        return;
    }

    places.forEach((place, index) => {
        // Handle height display
        let height = place.height;
        let heightStr = '?';
        
        if (height) {
            if (typeof height === 'string') {
                const num = parseFloat(height);
                heightStr = isNaN(num) ? '?' : (num >= 1 ? `${Math.round(num)}m` : `${height}`);
            } else {
                heightStr = `${Math.round(height)}m`;
            }
        } else if (place.levels) {
            const numLevels = parseInt(place.levels) || 0;
            const estHeight = Math.round(numLevels * 3.5);
            heightStr = `~${estHeight}m`;
        }
        
        const levels = place.levels || '?';
        
        // Use category or type for display
        const displayCategory = place.category || place.type || 'Safe Place';
        const displayName = place.name || displayCategory;
        
        // Safety badge based on score
        let badgeText = 'SAFE';
        let badgeClass = 'badge safe';
        if (place.safetyScore >= 90) {
            badgeText = 'PRIORITY';
            badgeClass = 'badge priority';
        } else if (place.safetyScore >= 70) {
            badgeText = 'SAFE';
            badgeClass = 'badge safe';
        } else if (place.safetyScore >= 50) {
            badgeText = 'MODERATE';
            badgeClass = 'badge moderate';
        } else {
            badgeText = 'INFO';
            badgeClass = 'badge info';
        }
        
        const card = document.createElement('div');
        card.className = 'building-card';
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">#${index + 1}</span>
                <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="card-icon-row">
                <i class="fas ${place.icon || 'fa-building'}"></i>
                <div class="card-content">
                    <div class="card-name" title="${displayName}">${displayName.substring(0, 50)}</div>
                    <div class="card-type">${displayCategory}</div>
                </div>
            </div>
            <div class="stat-row">
                ${heightStr !== '?' ? `<div class="stat"><i class="fas fa-ruler-vertical"></i> ${heightStr}</div>` : ''}
                ${levels !== '?' ? `<div class="stat"><i class="fas fa-layer-group"></i> ${levels} Fl</div>` : ''}
                ${place.distance ? `<div class="stat"><i class="fas fa-location-dot"></i> ${place.distance}</div>` : ''}
            </div>
            <div class="nav-btn">
                <i class="fas fa-location-arrow"></i> Navigate
            </div>
        `;

        card.onclick = () => {
            openGoogleMaps(place, index);
        };

        container.appendChild(card);
    });
}

// ===== PAGE NAVIGATION FUNCTIONS =====

// Open Google Maps directly with directions
function openGoogleMaps(place, index) {
    // Get start location from pinLocation or searchLocation
    const startLocation = pinLocation || (JSON.parse(sessionStorage.getItem('searchLocation') || 'null'))?.coordinates;
    
    if (startLocation) {
        // Create Google Maps URL with search/pin location as start
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${startLocation[1]},${startLocation[0]}&destination=${place.lat},${place.lon}&travelmode=walking`;
        // Open Google Maps in a new tab
        window.open(googleMapsUrl, '_blank');
    } else {
        alert('Please search for a location or use My Location first.');
    }
}