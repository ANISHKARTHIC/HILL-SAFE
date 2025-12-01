// ============================================
// CONFIG MODULE - Configuration and constants
// ============================================

// Mapbox Access Token
mapboxgl.accessToken = 'pk.eyJ1IjoiYW5pc2hrYXJ0aGljIiwiYSI6ImNtaW11eDF3ODFkNHYzZHM0YmhjZWtsY2EifQ.e348Mf0727rJCGBX7rJzpA';

// Global State
export const state = {
    userLocation: null,
    shouldScan: false,
    pinLocation: null,
    pinMarker: null,
    isPinMode: false,
    allBuildings: [],
    currentSafePlaces: [],
    activeFilter: 'all'
};

// Constants
export const CONSTANTS = {
    MAX_DISTANCE_KM: 1.6, // 20 min walk
    ELEVATION_THRESHOLDS: {
        CRITICAL: 1200,
        HIGH: 1500,
        MODERATE: 1800
    },
    SAFETY_SCORE_THRESHOLDS: {
        PRIORITY: 90,
        SAFE: 65,
        CAUTION: 40
    }
};
