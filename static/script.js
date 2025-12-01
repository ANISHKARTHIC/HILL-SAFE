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
let currentSafePlaces = []; // Store current safe places for WhatsApp sharing

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
    // Add terrain source
    map.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
    });
    map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

    // Remove default building layer if it exists
    if (map.getLayer('building')) {
        map.removeLayer('building');
    }

    // Add custom 3D buildings layer with color coding
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
                // Priority Safe (3+ floors or 9m+ height) - Bright Green
                ['any', 
                    ['>=', ['to-number', ['get', 'building:levels'], 0], 3],
                    ['>=', ['to-number', ['get', 'height'], 0], 9]
                ], 
                '#4CAF50',
                // Moderately Safe (2 floors or 6-9m height) - Yellow/Orange
                ['any', 
                    ['all', 
                        ['>=', ['to-number', ['get', 'building:levels'], 0], 2],
                        ['<', ['to-number', ['get', 'building:levels'], 0], 3]
                    ],
                    ['all', 
                        ['>=', ['to-number', ['get', 'height'], 0], 6],
                        ['<', ['to-number', ['get', 'height'], 0], 9]
                    ]
                ],
                '#FFA726',
                // Ground + 1 floor (1 floor or 3-6m height) - Light Orange
                ['any',
                    ['all', 
                        ['>=', ['to-number', ['get', 'building:levels'], 0], 1],
                        ['<', ['to-number', ['get', 'building:levels'], 0], 2]
                    ],
                    ['all', 
                        ['>=', ['to-number', ['get', 'height'], 0], 3],
                        ['<', ['to-number', ['get', 'height'], 0], 6]
                    ]
                ],
                '#FF7043',
                // Unsafe (ground level only or unknown) - Red
                '#EF5350'
            ],
            'fill-extrusion-height': [
                'case',
                ['has', 'height'],
                ['to-number', ['get', 'height'], 5],
                // Estimate height from levels if no height data
                ['*', ['to-number', ['get', 'building:levels'], 1], 3.5]
            ],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85
        }
    }, 'road-label'); // Insert before road labels so labels appear on top
    
    console.log('Map fully loaded with color-coded buildings. Ready to scan.');
});

// --- 2. SEARCH FUNCTIONALITY WITH SUGGESTIONS ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize modal functionality
    initializeModal();
    
    // Initialize filter chips
    initializeFilters();
    
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
            `<div class="empty-state">
                <div class="empty-icon"><i class="fas fa-satellite"></i></div>
                <h3>Scanning Area</h3>
                <p>Finding safe places near ${feature.text}...</p>
            </div>`;
        
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
                        `<div class="empty-state">
                            <div class="empty-icon"><i class="fas fa-satellite"></i></div>
                            <h3>Scanning Area</h3>
                            <p>Finding safe places within walking distance...</p>
                        </div>`;

                    // Wait for map to finish moving, then trigger scan
                    map.once('moveend', () => {
                        performScan(pinLocation);
                    });
                },
                (error) => {
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

// ===== MODAL FUNCTIONALITY =====
function initializeModal() {
    const emergencyBtn = document.getElementById('emergency-btn');
    const modal = document.getElementById('emergency-modal');
    const closeBtn = document.querySelector('.modal-close');
    
    if (emergencyBtn && modal) {
        emergencyBtn.addEventListener('click', () => {
            modal.classList.add('active');
        });
    }
    
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }
    
    if (modal) {
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
    
    // Place details modal
    initializePlaceModal();
    
    // Map expansion functionality
    initializeMapExpansion();
}

// Initialize place details modal
function initializePlaceModal() {
    const placeModal = document.getElementById('place-modal');
    const placeModalClose = document.getElementById('place-modal-close');
    const placeModalCloseBtn = document.getElementById('place-modal-close-btn');
    const placeModalNavigate = document.getElementById('place-modal-navigate');
    
    if (placeModalClose) {
        placeModalClose.addEventListener('click', () => {
            placeModal.classList.remove('active');
        });
    }
    
    if (placeModalCloseBtn) {
        placeModalCloseBtn.addEventListener('click', () => {
            placeModal.classList.remove('active');
        });
    }
    
    if (placeModalNavigate) {
        placeModalNavigate.addEventListener('click', navigateToPlace);
    }
    
    if (placeModal) {
        placeModal.addEventListener('click', (e) => {
            if (e.target === placeModal) {
                placeModal.classList.remove('active');
            }
        });
    }
}

// Initialize map expansion
function initializeMapExpansion() {
    const mapPanel = document.getElementById('map-panel');
    const mapCloseBtn = document.getElementById('map-close-btn');
    const mapContainer = document.querySelector('.map-container');
    
    if (mapCloseBtn) {
        mapCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mapPanel.classList.remove('expanded');
            // Clear directions
            if (directions) {
                directions.removeRoutes();
            }
            // Hide route info panel
            const routeInfo = document.getElementById('route-info-panel');
            if (routeInfo) {
                routeInfo.style.display = 'none';
            }
        });
    }
    
    // Click on small map to expand (only when not already expanded)
    if (mapContainer) {
        mapContainer.addEventListener('click', (e) => {
            if (!mapPanel.classList.contains('expanded')) {
                mapPanel.classList.add('expanded');
                // Resize map after expansion
                setTimeout(() => {
                    map.resize();
                }, 400);
            }
        });
    }
}

// ===== PLACE MODAL FUNCTIONALITY =====
// Open place details modal
function openPlaceModal(place, index) {
    const modal = document.getElementById('place-modal');
    
    // Calculate display name (same logic as renderCards)
    let displayName = place.name || null;
    const displayCategory = place.category || place.type || 'Safe Place';
    if (!displayName || displayName === 'Safe Place' || displayName.toLowerCase() === 'yes' || displayName.toLowerCase() === 'unknown') {
        displayName = place.distance ? `Building ${place.distance} away` : displayCategory;
    }
    
    // Populate modal fields
    document.getElementById('place-modal-name').textContent = displayName;
    
    // Calculate badge based on safety score (same logic as renderCards)
    let badgeText = 'SAFE';
    let badgeClass = 'safe';
    if (place.safetyScore >= 90) {
        badgeText = 'PRIORITY';
        badgeClass = 'priority';
    } else if (place.safetyScore >= 65) {
        badgeText = 'SAFE';
        badgeClass = 'safe';
    } else if (place.safetyScore >= 40) {
        badgeText = 'CAUTION';
        badgeClass = 'moderate';
    } else {
        badgeText = 'UNSAFE';
        badgeClass = 'unsafe';
    }
    
    // Badge
    const badge = document.getElementById('place-modal-badge');
    badge.textContent = badgeText;
    badge.className = 'place-modal-badge ' + badgeClass;
    
    // Category
    document.getElementById('place-modal-category').textContent = displayCategory;
    
    // Distance
    document.getElementById('place-modal-distance').textContent = place.distance;
    
    // Floors and height
    const floorsItem = document.getElementById('place-modal-floors').closest('.place-detail-item');
    const heightItem = document.getElementById('place-modal-height').closest('.place-detail-item');
    const elevationItem = document.getElementById('place-modal-elevation').closest('.place-detail-item');
    const floodItem = document.getElementById('place-modal-flood').closest('.place-detail-item');
    
    if (place.levels && place.levels !== '?') {
        document.getElementById('place-modal-floors').textContent = place.levels + ' floors';
        floorsItem.style.display = 'flex';
    } else {
        floorsItem.style.display = 'none';
    }
    
    if (place.height) {
        let heightStr = '';
        if (typeof place.height === 'string') {
            const num = parseFloat(place.height);
            heightStr = isNaN(num) ? '' : (num >= 1 ? `${Math.round(num)}m` : place.height);
        } else {
            heightStr = `${Math.round(place.height)}m`;
        }
        
        if (heightStr) {
            document.getElementById('place-modal-height').textContent = heightStr;
            heightItem.style.display = 'flex';
        } else {
            heightItem.style.display = 'none';
        }
    } else if (place.levels && place.levels !== '?') {
        // Estimate height from levels
        const numLevels = parseInt(place.levels) || 0;
        const estHeight = Math.round(numLevels * 3.5);
        document.getElementById('place-modal-height').textContent = `~${estHeight}m`;
        heightItem.style.display = 'flex';
    } else {
        heightItem.style.display = 'none';
    }
    
    // Elevation and flood risk (if available)
    if (place.elevation) {
        document.getElementById('place-modal-elevation').textContent = `${Math.round(place.elevation)}m`;
        elevationItem.style.display = 'flex';
    } else {
        elevationItem.style.display = 'none';
    }
    
    if (place.floodRisk) {
        const floodRiskText = place.floodRisk.charAt(0).toUpperCase() + place.floodRisk.slice(1);
        document.getElementById('place-modal-flood').textContent = floodRiskText;
        floodItem.style.display = 'flex';
    } else {
        floodItem.style.display = 'none';
    }
    
    // Store place data for navigation
    modal.dataset.placeIndex = index;
    modal.dataset.placeLat = place.lat;
    modal.dataset.placeLon = place.lon;
    modal.dataset.placeName = place.display_name || place.name;
    
    // Show modal
    modal.classList.add('active');
}

// Navigate to place (expand map and show route)
function navigateToPlace() {
    const modal = document.getElementById('place-modal');
    const mapPanel = document.getElementById('map-panel');
    
    const lat = parseFloat(modal.dataset.placeLat);
    const lon = parseFloat(modal.dataset.placeLon);
    const name = modal.dataset.placeName;
    
    // Close modal
    modal.classList.remove('active');
    
    // Expand map
    mapPanel.classList.add('expanded');
    
    // Get search location (priority) or pin/GPS location
    const searchLocation = JSON.parse(sessionStorage.getItem('searchLocation') || 'null');
    let startLng, startLat;
    
    if (searchLocation && searchLocation.coordinates) {
        startLng = searchLocation.coordinates[0];
        startLat = searchLocation.coordinates[1];
    } else if (pinLocation) {
        startLng = pinLocation.lng;
        startLat = pinLocation.lat;
    } else if (userLocation) {
        startLng = userLocation.lng;
        startLat = userLocation.lat;
    }
    
    // Resize map after expansion
    setTimeout(() => {
        map.resize();
        
        if (startLng && startLat) {
            // Set up directions
            directions.setOrigin([startLng, startLat]);
            directions.setDestination([lon, lat]);
            
            // Listen for route calculation
            directions.on('route', (event) => {
                if (event.route && event.route[0]) {
                    displayRouteInfo(event.route[0], lat, lon);
                }
            });
            
            // Fit map to show both points
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([startLng, startLat]);
            bounds.extend([lon, lat]);
            
            map.fitBounds(bounds, {
                padding: 100,
                duration: 1000
            });
        } else {
            // Just center on destination if no start location
            map.flyTo({
                center: [lon, lat],
                zoom: 16,
                duration: 1000
            });
        }
    }, 400);
}

// Display route information with weather and risk factors
async function displayRouteInfo(route, destLat, destLon) {
    const distance = (route.distance / 1000).toFixed(2); // km
    const duration = Math.round(route.duration / 60); // minutes
    
    // Get elevation data for destination
    let elevation = 'N/A';
    let floodRisk = 'Unknown';
    
    try {
        const elevationUrl = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${destLon},${destLat}.json?layers=contour&access_token=${mapboxgl.accessToken}`;
        const response = await fetch(elevationUrl);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            elevation = data.features[0].properties.ele || 'N/A';
            
            // Calculate flood risk based on elevation
            if (elevation !== 'N/A') {
                const elevNum = parseInt(elevation);
                if (elevNum < 1200) {
                    floodRisk = 'Critical';
                } else if (elevNum < 1500) {
                    floodRisk = 'High';
                } else if (elevNum < 1800) {
                    floodRisk = 'Moderate';
                } else {
                    floodRisk = 'Low';
                }
            }
        }
    } catch (error) {
        console.log('Could not fetch elevation data:', error);
    }
    
    // Get current weather (simplified - you can integrate a weather API)
    const weatherCondition = 'Clear'; // Placeholder
    
    // Create route info overlay
    let routeInfoDiv = document.getElementById('route-info-panel');
    if (!routeInfoDiv) {
        routeInfoDiv = document.createElement('div');
        routeInfoDiv.id = 'route-info-panel';
        routeInfoDiv.className = 'route-info-panel';
        document.querySelector('.map-container').appendChild(routeInfoDiv);
    }
    
    routeInfoDiv.innerHTML = `
        <div class="route-info-header">
            <h3><i class="fas fa-route"></i> Route Information</h3>
        </div>
        <div class="route-info-body">
            <div class="route-stat">
                <i class="fas fa-road"></i>
                <div>
                    <span class="stat-label">Distance</span>
                    <span class="stat-value">${distance} km</span>
                </div>
            </div>
            <div class="route-stat">
                <i class="fas fa-clock"></i>
                <div>
                    <span class="stat-label">Walking Time</span>
                    <span class="stat-value">${duration} min</span>
                </div>
            </div>
            <div class="route-stat">
                <i class="fas fa-mountain"></i>
                <div>
                    <span class="stat-label">Elevation</span>
                    <span class="stat-value">${elevation}m</span>
                </div>
            </div>
            <div class="route-stat">
                <i class="fas fa-water"></i>
                <div>
                    <span class="stat-label">Flood Risk</span>
                    <span class="stat-value risk-${floodRisk.toLowerCase()}">${floodRisk}</span>
                </div>
            </div>
            <div class="route-stat">
                <i class="fas fa-cloud-sun"></i>
                <div>
                    <span class="stat-label">Weather</span>
                    <span class="stat-value">${weatherCondition}</span>
                </div>
            </div>
        </div>
    `;
    
    routeInfoDiv.style.display = 'block';
}

// ===== FILTER CHIP FUNCTIONALITY =====
let activeFilter = 'all';

function initializeFilters() {
    const filterChips = document.querySelectorAll('.chip');
    
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Remove active class from all chips
            filterChips.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked chip
            chip.classList.add('active');
            
            // Get filter type
            activeFilter = chip.dataset.filter;
            
            // Re-render cards with filter
            if (currentSafePlaces && currentSafePlaces.length > 0) {
                renderCards(currentSafePlaces);
            }
        });
    });
}

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

// Analyze terrain elevation and flood risk using Mapbox terrain data
function analyzeFloodRisk(lat, lon, elevation = 0) {
    // Historical flood-prone elevation thresholds for hill areas
    // Lower elevations in valleys are high risk
    const CRITICAL_LOW_ELEVATION = 1200; // meters - very high flood risk
    const MODERATE_LOW_ELEVATION = 1500; // meters - moderate flood risk
    const SAFE_ELEVATION = 1800; // meters - generally safe from flooding
    
    let floodRisk = 'low';
    let riskScore = 0;
    
    if (elevation < CRITICAL_LOW_ELEVATION) {
        floodRisk = 'critical';
        riskScore = 90;
    } else if (elevation < MODERATE_LOW_ELEVATION) {
        floodRisk = 'high';
        riskScore = 60;
    } else if (elevation < SAFE_ELEVATION) {
        floodRisk = 'moderate';
        riskScore = 30;
    } else {
        floodRisk = 'low';
        riskScore = 10;
    }
    
    return { floodRisk, riskScore };
}

// Get terrain elevation from map
async function getElevationAt(lng, lat) {
    try {
        // Query terrain elevation from Mapbox terrain source
        const elevation = map.queryTerrainElevation([lng, lat]);
        return elevation || 0;
    } catch (err) {
        console.log('Elevation query not ready, using estimates');
        return 0;
    }
}

// E. The Scan Function - Using Overpass API for reliable building data
async function performScan(referencePoint) {
    const listContainer = document.getElementById('building-list');
    listContainer.innerHTML = `<div class="empty-state">
        <div class="empty-icon"><i class="fas fa-satellite"></i></div>
        <h3>Scanning Area</h3>
        <p>Analyzing terrain, buildings, and flood risk...</p>
    </div>`;

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

    // Get elevation of reference point for flood risk analysis
    let referenceElevation = 0;
    if (referencePoint) {
        referenceElevation = await getElevationAt(referencePoint[0], referencePoint[1]);
        console.log(`📏 Reference elevation: ${referenceElevation}m`);
    }

    // Enhanced Query: Get buildings (including ground+1 floor) AND safe places
    const overpassQuery = `
        [bbox:${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}];
        (
            way["building"]["building:levels"~"^[1-9]|[1-9][0-9]+$"];
            way["building"="house"]["building:levels"~"^[1-9]|[1-9][0-9]+$"];
            way["building"="residential"]["building:levels"~"^[1-9]|[1-9][0-9]+$"];
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
        
        // If no buildings found, generate safe zone recommendations based on terrain
        if (allPlaces.length === 0) {
            console.log('⚠️ No buildings found, generating terrain-based safe zones');
            allPlaces.push(...generateTerrainBasedSafeZones(referencePoint, referenceElevation));
        }
        
        console.log(`✅ Showing ${allPlaces.length} safe places and buildings`);
        
        // Categorize by safety priority with flood risk analysis
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
            } else if (place.isTerrainBased) {
                // Terrain-based safe zone
                safetyScore = place.safetyScore || 75;
                category = place.category || 'High Ground Zone';
                icon = place.icon || 'fa-mountain';
            } else {
                // Buildings - check height/floors with detailed categorization
                const levels = parseInt(place.levels) || 0;
                const height = parseFloat(place.height) || 0;
                
                if (levels >= 3 || height >= 9) {
                    safetyScore = 85;
                    category = 'Very Safe Building';
                    icon = 'fa-building';
                } else if (levels === 2 || (height >= 6 && height < 9)) {
                    safetyScore = 65;
                    category = 'Safe Building';
                    icon = 'fa-building';
                } else if (levels === 1 || (height >= 3 && height < 6)) {
                    safetyScore = 45;
                    category = 'Ground+1 Building';
                    icon = 'fa-home';
                } else {
                    safetyScore = 25;
                    category = 'Ground Level';
                    icon = 'fa-warehouse';
                }
            }
            
            // Adjust score based on flood risk if elevation data available
            if (place.elevation) {
                const floodAnalysis = analyzeFloodRisk(place.lat, place.lon, place.elevation);
                place.floodRisk = floodAnalysis.floodRisk;
                place.floodRiskScore = floodAnalysis.riskScore;
                
                // Reduce safety score for high flood risk areas
                if (floodAnalysis.floodRisk === 'critical') {
                    safetyScore = Math.max(20, safetyScore - 40);
                } else if (floodAnalysis.floodRisk === 'high') {
                    safetyScore = Math.max(30, safetyScore - 25);
                } else if (floodAnalysis.floodRisk === 'moderate') {
                    safetyScore = Math.max(40, safetyScore - 15);
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

        // Check if user is already in a safe location
        let userIsSafe = false;
        if (safePlaces.length > 0 && referencePoint) {
            const nearestPlace = safePlaces[0];
            // If nearest place is within 50 meters and has high safety score
            if (nearestPlace.distanceKm && nearestPlace.distanceKm <= 0.05 && nearestPlace.safetyScore >= 65) {
                userIsSafe = true;
            }
        }

        document.getElementById('result-count').innerText = `${safePlaces.length} found`;
        
        // Store safe places for WhatsApp sharing
        currentSafePlaces = safePlaces.slice(0, 15);
        
        // Show safety status message if user is safe
        if (userIsSafe) {
            const safetyMessage = document.createElement('div');
            safetyMessage.className = 'safety-alert safe';
            safetyMessage.innerHTML = `
                <div class="alert-icon">
                    <i class="fas fa-shield-halved"></i>
                </div>
                <div class="alert-content">
                    <h4>✓ You Are Safe!</h4>
                    <p>Your current location is in a safe area. ${safePlaces[0].category} nearby.</p>
                </div>
            `;
            listContainer.insertBefore(safetyMessage, listContainer.firstChild);
        }
        
        // Show WhatsApp button if places found
        const whatsappBtn = document.getElementById('whatsapp-share-btn');
        if (safePlaces.length > 0) {
            whatsappBtn.style.display = 'flex';
        } else {
            whatsappBtn.style.display = 'none';
        }
        
        renderCards(safePlaces.slice(0, 15)); // Show top 15
    })
    .catch(err => {
        console.error('Overpass API error:', err);
        // Generate terrain-based safe zones as fallback
        console.log('⚠️ API error, generating terrain-based safe zones');
        const terrainZones = generateTerrainBasedSafeZones(referencePoint, referenceElevation);
        
        if (terrainZones.length > 0) {
            const safePlaces = terrainZones.map(place => ({
                ...place,
                safetyScore: place.safetyScore || 70,
                category: place.category || 'High Ground Zone',
                icon: place.icon || 'fa-mountain'
            }));
            
            document.getElementById('result-count').innerText = `${safePlaces.length} found`;
            currentSafePlaces = safePlaces;
            renderCards(safePlaces);
        } else {
            performMapboxScan(bounds, listContainer);
        }
    });
}

// Generate terrain-based safe zones when no buildings found
function generateTerrainBasedSafeZones(referencePoint, referenceElevation) {
    if (!referencePoint) return [];
    
    const safeZones = [];
    const [lng, lat] = referencePoint;
    
    // Generate 8 directional high ground recommendations (N, NE, E, SE, S, SW, W, NW)
    const directions = [
        { name: 'North', angle: 0, icon: 'fa-arrow-up' },
        { name: 'Northeast', angle: 45, icon: 'fa-arrow-up-right' },
        { name: 'East', angle: 90, icon: 'fa-arrow-right' },
        { name: 'Southeast', angle: 135, icon: 'fa-arrow-down-right' },
        { name: 'South', angle: 180, icon: 'fa-arrow-down' },
        { name: 'Southwest', angle: 225, icon: 'fa-arrow-down-left' },
        { name: 'West', angle: 270, icon: 'fa-arrow-left' },
        { name: 'Northwest', angle: 315, icon: 'fa-arrow-up-left' }
    ];
    
    // Create safe zones at different distances in each direction
    const distances = [0.3, 0.6, 0.9, 1.2, 1.5]; // km
    
    directions.forEach((dir, idx) => {
        distances.forEach((dist, distIdx) => {
            // Calculate new coordinates
            const angleRad = dir.angle * Math.PI / 180;
            const distDeg = dist / 111; // Approximate: 1 degree ≈ 111 km
            
            const newLat = lat + (distDeg * Math.cos(angleRad));
            const newLng = lng + (distDeg * Math.sin(angleRad) / Math.cos(lat * Math.PI / 180));
            
            // Estimate elevation increase (assuming higher ground in upward directions)
            const elevationBonus = (dist * 50) + (referenceElevation || 1500);
            const floodAnalysis = analyzeFloodRisk(newLat, newLng, elevationBonus);
            
            // Only add zones that are safer than current location
            if (floodAnalysis.floodRisk === 'low' || floodAnalysis.floodRisk === 'moderate') {
                safeZones.push({
                    name: `${dir.name} High Ground`,
                    lat: newLat,
                    lon: newLng,
                    elevation: elevationBonus,
                    floodRisk: floodAnalysis.floodRisk,
                    floodRiskScore: floodAnalysis.riskScore,
                    category: 'High Ground Zone',
                    icon: 'fa-mountain',
                    safetyScore: 75 - floodAnalysis.riskScore / 4,
                    distance: `${(dist * 1000).toFixed(0)}m`,
                    distanceKm: dist,
                    isTerrainBased: true,
                    type: 'terrain_safe_zone'
                });
            }
        });
    });
    
    // Sort by safety score and distance
    safeZones.sort((a, b) => {
        const scoreDiff = b.safetyScore - a.safetyScore;
        if (Math.abs(scoreDiff) > 5) return scoreDiff;
        return a.distanceKm - b.distanceKm;
    });
    
    // Return top 12 zones
    return safeZones.slice(0, 12);
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
                    else label = null; // Will use distance as name
                }
                
                // Skip generic names like "Yes"
                if (label && (label.toLowerCase() === 'yes' || label.toLowerCase() === 'unknown')) {
                    label = null; // Will use distance as name
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
                <div class="empty-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Unable to Scan</h3>
                <p>We couldn't find safe places in this area.</p>
                <div class="quick-tips">
                    <div class="tip-item">
                        <i class="fas fa-search-plus"></i>
                        <span>Try zooming in more</span>
                    </div>
                    <div class="tip-item">
                        <i class="fas fa-city"></i>
                        <span>Move to an urban area</span>
                    </div>
                    <div class="tip-item">
                        <i class="fas fa-map-marked-alt"></i>
                        <span>Search a different location</span>
                    </div>
                </div>
            </div>`;
    }
}

function renderCards(places) {
    const container = document.getElementById('building-list');
    container.innerHTML = '';

    // Apply active filter
    let filteredPlaces = places;
    if (activeFilter !== 'all') {
        filteredPlaces = places.filter(place => {
            const category = (place.category || '').toLowerCase();
            switch(activeFilter) {
                case 'hospital':
                    return category.includes('hospital');
                case 'shelter':
                    return category.includes('shelter') || category.includes('assembly');
                case 'high-ground':
                    return category.includes('high ground') || category.includes('peak');
                case 'building':
                    return category.includes('building');
                default:
                    return true;
            }
        });
    }

    if (filteredPlaces.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-shield-halved"></i></div>
                <h3>Current Area Analysis</h3>
                <p>Based on terrain and elevation data, this area appears to be at a safe altitude with low flood risk.</p>
                <div class="quick-tips">
                    <div class="tip-item">
                        <i class="fas fa-mountain"></i>
                        <span>High elevation area detected</span>
                    </div>
                    <div class="tip-item">
                        <i class="fas fa-shield-halved"></i>
                        <span>Low flood risk zone</span>
                    </div>
                    <div class="tip-item">
                        <i class="fas fa-map-marked-alt"></i>
                        <span>Try searching nearby towns</span>
                    </div>
                </div>
            </div>`;
        
        // Update result count
        document.getElementById('result-count').innerText = 'Area analyzed';
        return;
    }

    // Update result count
    document.getElementById('result-count').innerText = `${filteredPlaces.length} found`;

    filteredPlaces.forEach((place, index) => {
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
        // Use distance as name if no proper name exists
        let displayName = place.name || null;
        if (!displayName || displayName === 'Safe Place' || displayName.toLowerCase() === 'yes' || displayName.toLowerCase() === 'unknown') {
            displayName = place.distance ? `Building ${place.distance} away` : displayCategory;
        }
        
        // Safety badge based on score
        let badgeText = 'SAFE';
        let badgeClass = 'card-badge safe';
        if (place.safetyScore >= 90) {
            badgeText = 'PRIORITY';
            badgeClass = 'card-badge priority';
        } else if (place.safetyScore >= 65) {
            badgeText = 'SAFE';
            badgeClass = 'card-badge safe';
        } else if (place.safetyScore >= 40) {
            badgeText = 'CAUTION';
            badgeClass = 'card-badge moderate';
        } else {
            badgeText = 'UNSAFE';
            badgeClass = 'card-badge unsafe';
        }
        
        const card = document.createElement('div');
        card.className = 'place-card';
        
        card.innerHTML = `
            <div class="card-header">
                <div class="card-rank">${index + 1}</div>
                <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="card-body">
                <div class="card-icon">
                    <i class="fas ${place.icon || 'fa-building'}"></i>
                </div>
                <div class="card-content">
                    <div class="card-title" title="${displayName}">${displayName}</div>
                    <div class="card-category">${displayCategory}</div>
                </div>
            </div>
            <div class="card-stats">
                ${place.elevation ? `<div class="stat-item"><i class="fas fa-mountain"></i> ${Math.round(place.elevation)}m elevation</div>` : ''}
                ${place.floodRisk ? `<div class="stat-item ${place.floodRisk === 'low' ? 'flood-low' : place.floodRisk === 'critical' ? 'flood-critical' : 'flood-moderate'}"><i class="fas fa-water"></i> ${place.floodRisk} flood risk</div>` : ''}
                ${heightStr !== '?' ? `<div class="stat-item"><i class="fas fa-ruler-vertical"></i> ${heightStr}</div>` : ''}
                ${levels !== '?' ? `<div class="stat-item"><i class="fas fa-layer-group"></i> ${levels} floors</div>` : ''}
                ${place.distance ? `<div class="stat-item"><i class="fas fa-location-dot"></i> ${place.distance}</div>` : ''}
            </div>
            <button class="card-action">
                <i class="fas fa-location-arrow"></i> Get Directions
            </button>
        `;

        card.onclick = () => {
            openPlaceModal(place, index);
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

// ===== WHATSAPP SHARING FUNCTIONALITY =====

// WhatsApp share button handler
document.addEventListener('DOMContentLoaded', () => {
    const whatsappBtn = document.getElementById('whatsapp-share-btn');
    if (whatsappBtn) {
        whatsappBtn.addEventListener('click', shareViaWhatsApp);
    }
});

async function shareViaWhatsApp() {
    if (!currentSafePlaces || currentSafePlaces.length === 0) {
        alert('No safe places to share. Please search for a location first.');
        return;
    }

    const searchLocation = JSON.parse(sessionStorage.getItem('searchLocation') || 'null');
    const locationName = searchLocation?.name || 'Unknown Location';

    // Format message for WhatsApp
    let message = `🆘 *HILL-SAFE Emergency Alert* 🆘\n\n`;
    message += `📍 *Safe Places Near: ${locationName}*\n`;
    message += `⏱️ All locations within 20-min walking distance\n\n`;
    message += `🏆 *Top ${currentSafePlaces.length} Safe Locations:*\n\n`;

    currentSafePlaces.forEach((place, index) => {
        const name = place.name || 'Unknown';
        const category = place.category || 'Building';
        const distance = place.distance || 'N/A';
        
        // Add emoji based on category
        let emoji = '🏢';
        if (category.includes('Hospital')) emoji = '🏥';
        else if (category.includes('Shelter')) emoji = '🏠';
        else if (category.includes('High Ground')) emoji = '⛰️';
        else if (category.includes('Park')) emoji = '🌳';
        
        message += `${index + 1}. ${emoji} *${name}*\n`;
        message += `   📂 ${category}\n`;
        message += `   📏 ${distance} away\n`;
        message += `   🗺️ https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}\n\n`;
    });

    message += `\n🔗 Generated by Hill-Safe App`;
    message += `\n⚠️ Stay Safe! Share with your family and friends.`;

    // Open WhatsApp with pre-filled message (Web version)
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://web.whatsapp.com/send?text=${encodedMessage}`, '_blank');
    
    console.log('WhatsApp share opened with message preview:\n', message);
}