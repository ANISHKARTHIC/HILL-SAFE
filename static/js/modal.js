// ============================================
// MODAL MODULE - Modal functionality
// ============================================

import { state } from './config.js';
import { map, directions } from './map.js';
import { getBadgeInfo, formatDisplayName, formatHeight } from './utils.js';
import { calculateRouteInfo } from './route.js';

// Initialize all modals
export function initializeModal() {
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
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
    
    initializePlaceModal();
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
            if (directions) {
                directions.removeRoutes();
            }
            const routeInfo = document.getElementById('route-info-panel');
            if (routeInfo) {
                routeInfo.style.display = 'none';
            }
        });
    }
    
    if (mapContainer) {
        mapContainer.addEventListener('click', (e) => {
            if (!mapPanel.classList.contains('expanded')) {
                mapPanel.classList.add('expanded');
                setTimeout(() => {
                    map.resize();
                }, 400);
            }
        });
    }
}

// Open place details modal
export async function openPlaceModal(place, index) {
    const modal = document.getElementById('place-modal');
    
    const { displayName, displayCategory } = formatDisplayName(place);
    const badgeInfo = getBadgeInfo(place.safetyScore);
    
    // Populate modal fields
    document.getElementById('place-modal-name').textContent = displayName;
    
    const badge = document.getElementById('place-modal-badge');
    badge.textContent = badgeInfo.text;
    badge.className = 'place-modal-badge ' + badgeInfo.class;
    
    document.getElementById('place-modal-category').textContent = displayCategory;
    document.getElementById('place-modal-distance').textContent = place.distance;
    
    // Floors
    const floorsContainer = document.getElementById('place-modal-floors-container');
    if (place.levels && place.levels !== '?') {
        document.getElementById('place-modal-floors').textContent = place.levels + ' floors';
        floorsContainer.style.display = 'flex';
    } else {
        floorsContainer.style.display = 'none';
    }
    
    // Height
    const heightContainer = document.getElementById('place-modal-height-container');
    const heightStr = formatHeight(place);
    if (heightStr !== '?') {
        document.getElementById('place-modal-height').textContent = heightStr;
        heightContainer.style.display = 'flex';
    } else {
        heightContainer.style.display = 'none';
    }
    
    // Elevation
    const elevationContainer = document.getElementById('place-modal-elevation-container');
    if (place.elevation) {
        document.getElementById('place-modal-elevation').textContent = `${Math.round(place.elevation)}m`;
        elevationContainer.style.display = 'flex';
    } else {
        elevationContainer.style.display = 'none';
    }
    
    // Flood Risk
    const floodContainer = document.getElementById('place-modal-flood-container');
    if (place.floodRisk) {
        const floodRiskText = place.floodRisk.charAt(0).toUpperCase() + place.floodRisk.slice(1);
        document.getElementById('place-modal-flood').textContent = floodRiskText;
        floodContainer.style.display = 'flex';
    } else {
        floodContainer.style.display = 'none';
    }
    
    // Calculate and show route info
    const searchLocation = JSON.parse(sessionStorage.getItem('searchLocation') || 'null');
    let startLng, startLat;
    
    if (searchLocation && searchLocation.coordinates) {
        startLng = searchLocation.coordinates[0];
        startLat = searchLocation.coordinates[1];
    } else if (state.pinLocation) {
        startLng = state.pinLocation.lng;
        startLat = state.pinLocation.lat;
    } else if (state.userLocation) {
        startLng = state.userLocation.lng;
        startLat = state.userLocation.lat;
    }
    
    // Get route info
    const routeDistContainer = document.getElementById('place-modal-route-distance-container');
    const routeTimeContainer = document.getElementById('place-modal-route-time-container');
    
    if (startLng && startLat) {
        try {
            const routeInfo = await calculateRouteInfo(startLng, startLat, place.lon, place.lat);
            if (routeInfo) {
                document.getElementById('place-modal-route-distance').textContent = routeInfo.distance;
                document.getElementById('place-modal-route-time').textContent = routeInfo.duration;
                routeDistContainer.style.display = 'flex';
                routeTimeContainer.style.display = 'flex';
            } else {
                routeDistContainer.style.display = 'none';
                routeTimeContainer.style.display = 'none';
            }
        } catch (error) {
            routeDistContainer.style.display = 'none';
            routeTimeContainer.style.display = 'none';
        }
    } else {
        routeDistContainer.style.display = 'none';
        routeTimeContainer.style.display = 'none';
    }
    
    // Store place data for navigation
    modal.dataset.placeIndex = index;
    modal.dataset.placeLat = place.lat;
    modal.dataset.placeLon = place.lon;
    modal.dataset.placeName = displayName;
    
    modal.classList.add('active');
}

// Navigate to place
function navigateToPlace() {
    const modal = document.getElementById('place-modal');
    const mapPanel = document.getElementById('map-panel');
    
    const lat = parseFloat(modal.dataset.placeLat);
    const lon = parseFloat(modal.dataset.placeLon);
    
    modal.classList.remove('active');
    mapPanel.classList.add('expanded');
    
    const searchLocation = JSON.parse(sessionStorage.getItem('searchLocation') || 'null');
    let startLng, startLat;
    
    if (searchLocation && searchLocation.coordinates) {
        startLng = searchLocation.coordinates[0];
        startLat = searchLocation.coordinates[1];
    } else if (state.pinLocation) {
        startLng = state.pinLocation.lng;
        startLat = state.pinLocation.lat;
    } else if (state.userLocation) {
        startLng = state.userLocation.lng;
        startLat = state.userLocation.lat;
    }
    
    setTimeout(() => {
        map.resize();
        
        if (startLng && startLat) {
            directions.setOrigin([startLng, startLat]);
            directions.setDestination([lon, lat]);
            
            directions.on('route', (event) => {
                if (event.route && event.route[0]) {
                    displayRouteInfo(event.route[0], lat, lon);
                }
            });
            
            const bounds = new mapboxgl.LngLatBounds();
            bounds.extend([startLng, startLat]);
            bounds.extend([lon, lat]);
            
            map.fitBounds(bounds, {
                padding: 100,
                duration: 1000
            });
        } else {
            map.flyTo({
                center: [lon, lat],
                zoom: 16,
                duration: 1000
            });
        }
    }, 400);
}

// Display route information panel
async function displayRouteInfo(route, destLat, destLon) {
    const distance = (route.distance / 1000).toFixed(2);
    const duration = Math.round(route.duration / 60);
    
    let elevation = 'N/A';
    let floodRisk = 'Unknown';
    
    try {
        const elevationUrl = `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${destLon},${destLat}.json?layers=contour&access_token=${mapboxgl.accessToken}`;
        const response = await fetch(elevationUrl);
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            elevation = data.features[0].properties.ele || 'N/A';
            
            if (elevation !== 'N/A') {
                const elevNum = parseInt(elevation);
                if (elevNum < 1200) floodRisk = 'Critical';
                else if (elevNum < 1500) floodRisk = 'High';
                else if (elevNum < 1800) floodRisk = 'Moderate';
                else floodRisk = 'Low';
            }
        }
    } catch (error) {
        console.log('Could not fetch elevation data:', error);
    }
    
    const weatherCondition = 'Clear';
    
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
