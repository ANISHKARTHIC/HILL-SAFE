// ============================================
// ROUTE MODULE - Route calculation functions
// ============================================

// Calculate route information
export async function calculateRouteInfo(startLng, startLat, endLng, endLat) {
    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${startLng},${startLat};${endLng},${endLat}?access_token=${mapboxgl.accessToken}&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distance = (route.distance / 1000).toFixed(2) + ' km';
            const duration = Math.round(route.duration / 60) + ' min';
            
            return { distance, duration };
        }
    } catch (error) {
        console.error('Error calculating route:', error);
    }
    
    return null;
}
