// ============================================
// UTILS MODULE - Utility functions
// ============================================

import { CONSTANTS } from './config.js';

// Calculate distance using Haversine formula (in km)
export function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Calculate distance and return formatted string
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const distanceKm = calculateDistanceInKm(lat1, lon1, lat2, lon2);
    return distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m` : `${distanceKm.toFixed(2)}km`;
}

// Analyze flood risk based on elevation
export function analyzeFloodRisk(lat, lon, elevation = 0) {
    const { CRITICAL, HIGH, MODERATE } = CONSTANTS.ELEVATION_THRESHOLDS;
    
    if (elevation < CRITICAL) {
        return { level: 'critical', color: '#FF6B6B', description: 'High flood risk area' };
    } else if (elevation < HIGH) {
        return { level: 'high', color: '#FF8C42', description: 'Moderate flood risk' };
    } else if (elevation < MODERATE) {
        return { level: 'moderate', color: '#FFD93D', description: 'Low flood risk' };
    } else {
        return { level: 'low', color: '#25D366', description: 'Minimal flood risk' };
    }
}

// Get badge information based on safety score
export function getBadgeInfo(safetyScore) {
    const { PRIORITY, SAFE, CAUTION } = CONSTANTS.SAFETY_SCORE_THRESHOLDS;
    
    if (safetyScore >= PRIORITY) {
        return { text: 'PRIORITY', class: 'priority' };
    } else if (safetyScore >= SAFE) {
        return { text: 'SAFE', class: 'safe' };
    } else if (safetyScore >= CAUTION) {
        return { text: 'CAUTION', class: 'moderate' };
    } else {
        return { text: 'UNSAFE', class: 'unsafe' };
    }
}

// Format display name for places
export function formatDisplayName(place) {
    let displayName = place.name || null;
    const displayCategory = place.category || place.type || 'Safe Place';
    
    if (!displayName || displayName === 'Safe Place' || 
        displayName.toLowerCase() === 'yes' || 
        displayName.toLowerCase() === 'unknown') {
        displayName = place.distance ? `Building ${place.distance} away` : displayCategory;
    }
    
    return { displayName, displayCategory };
}

// Format height display
export function formatHeight(place) {
    let height = place.height;
    let heightStr = '?';
    
    if (height) {
        if (typeof height === 'string') {
            const num = parseFloat(height);
            heightStr = isNaN(num) ? '?' : (num >= 1 ? `${Math.round(num)}m` : height);
        } else {
            heightStr = `${Math.round(height)}m`;
        }
    } else if (place.levels && place.levels !== '?') {
        const numLevels = parseInt(place.levels) || 0;
        const estHeight = Math.round(numLevels * 3.5);
        heightStr = `~${estHeight}m`;
    }
    
    return heightStr;
}
