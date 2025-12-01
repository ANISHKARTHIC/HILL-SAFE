// ============================================
// MAP MODULE - Map initialization and controls
// ============================================

import { state } from './config.js';

// Initialize Map
export const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    center: [77.1734, 31.1048], // Shimla Default
    zoom: 16, 
    pitch: 60,
    bearing: -20
});

// Navigation Control
export const directions = new MapboxDirections({
    accessToken: mapboxgl.accessToken,
    unit: 'metric',
    profile: 'mapbox/walking',
    controls: { inputs: false, instructions: false },
    interactive: false
});
map.addControl(directions, 'top-left');

// Load Map Layers
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
                ['any', 
                    ['>=', ['to-number', ['get', 'building:levels'], 0], 3],
                    ['>=', ['to-number', ['get', 'height'], 0], 9]
                ], 
                '#4CAF50',
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
                '#EF5350'
            ],
            'fill-extrusion-height': [
                'case',
                ['has', 'height'],
                ['to-number', ['get', 'height'], 5],
                ['*', ['to-number', ['get', 'building:levels'], 1], 3.5]
            ],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.85
        }
    });

    map.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15
        }
    });
});
