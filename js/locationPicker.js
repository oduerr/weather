/**
 * Location Picker Module
 * Provides map-based location selection functionality
 */

window.LocationPicker = {
  map: null,
  marker: null,
  isOpen: false,
  
  /**
   * Initialize the location picker
   */
  init: function() {
    this.addMapPickerOption();
    this.setupLocationSelectHandler();
  },
  
  /**
   * Add location picker options to the location dropdown
   */
  addMapPickerOption: function() {
    const locationSelect = document.getElementById('locationSelect');
    if (!locationSelect) return;
    
    // Add separator and location picker options
    const separatorOption = document.createElement('option');
    separatorOption.disabled = true;
    separatorOption.textContent = '────────────────';
    locationSelect.appendChild(separatorOption);
    
    // Search by name option
    const searchOption = document.createElement('option');
    searchOption.value = 'SEARCH_LOCATION';
    searchOption.textContent = '🔍 Search for location';
    locationSelect.appendChild(searchOption);
    
    // Current location option
    const currentLocationOption = document.createElement('option');
    currentLocationOption.value = 'CURRENT_LOCATION';
    currentLocationOption.textContent = '📍 Use current location';
    locationSelect.appendChild(currentLocationOption);
    
    // Map picker option
    const mapPickerOption = document.createElement('option');
    mapPickerOption.value = 'MAP_PICKER';
    mapPickerOption.textContent = '🗺️ Pick location from map';
    locationSelect.appendChild(mapPickerOption);
  },
  
  /**
   * Setup event handler for location select dropdown
   */
  setupLocationSelectHandler: function() {
    const locationSelect = document.getElementById('locationSelect');
    if (!locationSelect) return;
    
    // Store original change handler if it exists
    const originalHandler = locationSelect.onchange;
    
    locationSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      
      if (value === 'SEARCH_LOCATION') {
        event.preventDefault();
        event.stopPropagation();
        // Trigger search mode in LocationSearch module
        if (window.LocationSearch && typeof window.LocationSearch.toggleSearchMode === 'function') {
          window.LocationSearch.toggleSearchMode();
        }
        // Reset to previous selection
        setTimeout(() => {
          locationSelect.selectedIndex = 0;
        }, 100);
        return false;
      }
      
      if (value === 'CURRENT_LOCATION') {
        event.preventDefault();
        event.stopPropagation();
        // Trigger current location in LocationSearch module
        if (window.LocationSearch && typeof window.LocationSearch.getCurrentLocation === 'function') {
          window.LocationSearch.getCurrentLocation();
        }
        // Reset to previous selection
        setTimeout(() => {
          locationSelect.selectedIndex = 0;
        }, 100);
        return false;
      }
      
      if (value === 'MAP_PICKER') {
        event.preventDefault();
        event.stopPropagation();
        this.openMapModal();
        // Reset to previous selection
        setTimeout(() => {
          locationSelect.selectedIndex = 0;
        }, 100);
        return false;
      }
      
      // Call original handler for other options
      if (originalHandler) {
        originalHandler.call(locationSelect, event);
      }
    });
  },
  
  /**
   * Open the map modal for location selection
   */
  openMapModal: function() {
    if (this.isOpen) return;
    this.isOpen = true;
    
    // Get current location from dropdown
    const currentLocation = this.getCurrentLocation();
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'map-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 90vw;
      height: 80vh;
      max-width: 800px;
      max-height: 600px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
    `;
    
    // Create modal header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 20px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Pick Weather Location';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #333;';
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeButton.onclick = () => this.closeMapModal();
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // Create map container
    const mapContainer = document.createElement('div');
    mapContainer.id = 'location-picker-map';
    mapContainer.style.cssText = `
      flex: 1;
      min-height: 0;
    `;
    
    // Create instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
      padding: 12px 20px;
      background: #f8f9fa;
      border-top: 1px solid #eee;
      font-size: 14px;
      color: #666;
      flex-shrink: 0;
    `;
    instructions.textContent = 'Click anywhere on the map to select a location and get weather data for that area.';
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(mapContainer);
    modal.appendChild(instructions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeMapModal();
      }
    });
    
    // Initialize map after a short delay to ensure container is rendered
    setTimeout(() => {
      this.initMap(currentLocation);
    }, 100);
  },
  
  /**
   * Close the map modal
   */
  closeMapModal: function() {
    const overlay = document.getElementById('map-modal-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
    
    this.isOpen = false;
  },
  
  /**
   * Get current location from dropdown selection or URL parameters
   */
  getCurrentLocation: function() {
    const locationSelect = document.getElementById('locationSelect');
    const specialOptions = ['MAP_PICKER', 'SEARCH_LOCATION', 'CURRENT_LOCATION'];

    // First priority: Check dropdown selection (works for predefined locations)
    if (locationSelect && locationSelect.value && !specialOptions.includes(locationSelect.value)) {
      try {
        const locationData = JSON.parse(locationSelect.value);
        // Validate that we have proper coordinates
        if (locationData.lat && locationData.lon) {
          console.log("Using dropdown location for map:", locationData);
          return {
            lat: locationData.lat,
            lon: locationData.lon,
            name: locationData.name || 'Current Location'
          };
        }
      } catch (e) {
        console.log("Dropdown value is not JSON, checking URL parameters...");
      }
    }

    // Second priority: Check URL parameters (works for search results)
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lon = parseFloat(params.get("lon"));
    if (!isNaN(lat) && !isNaN(lon)) {
      const name = params.get("name") || `Location ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      console.log("Using URL location for map:", { lat, lon, name });
      return { lat, lon, name };
    }

    // Third priority: Check if dropdown has a valid selection (fallback for edge cases)
    if (locationSelect && locationSelect.selectedIndex >= 0 && locationSelect.selectedIndex < locationSelect.options.length) {
      const selectedOption = locationSelect.options[locationSelect.selectedIndex];
      if (selectedOption && selectedOption.value && !specialOptions.includes(selectedOption.value)) {
        try {
          const locationData = JSON.parse(selectedOption.value);
          if (locationData.lat && locationData.lon) {
            console.log("Using selected option for map:", locationData);
            return {
              lat: locationData.lat,
              lon: locationData.lon,
              name: locationData.name || selectedOption.textContent
            };
          }
        } catch (e) {
          // Continue to final fallback
        }
      }
    }

    // Final fallback to Konstanz
    console.log("Using Konstanz as fallback location");
    return { lat: 47.6952, lon: 9.1307, name: 'Konstanz (Default)' };
  },
  
  /**
   * Initialize the Leaflet map
   */
  initMap: function(currentLocation) {
    // Use Leaflet from CDN
    if (typeof L === 'undefined') {
      this.loadLeaflet(() => {
        this.createMap(currentLocation);
      });
    } else {
      this.createMap(currentLocation);
    }
  },
  
  /**
   * Load Leaflet library dynamically
   */
  loadLeaflet: function(callback) {
    // Load CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    cssLink.crossOrigin = '';
    document.head.appendChild(cssLink);
    
    // Load JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = callback;
    document.head.appendChild(script);
  },
  
  /**
   * Create the actual map instance
   */
  createMap: function(currentLocation) {
    const mapContainer = document.getElementById('location-picker-map');
    if (!mapContainer) return;
    
    // Initialize map
    this.map = L.map('location-picker-map').setView([currentLocation.lat, currentLocation.lon], 10);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(this.map);
    
    // Add current location marker
    this.marker = L.marker([currentLocation.lat, currentLocation.lon])
      .addTo(this.map)
      .bindPopup(`Current: ${currentLocation.name}`)
      .openPopup();
    
    // Add click handler for location selection
    this.map.on('click', (e) => {
      this.selectLocation(e.latlng.lat, e.latlng.lng);
    });
    
    // Invalidate size to ensure proper rendering
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 300);
  },
  
  /**
   * Handle location selection on map click
   */
  selectLocation: function(lat, lng) {
    // Round to reasonable precision
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLng = Math.round(lng * 10000) / 10000;
    
    // Generate location name based on coordinates
    const locationName = `Location ${roundedLat}°N, ${roundedLng}°E`;
    
    // Close modal
    this.closeMapModal();
    
    // Redirect to weather app with new location
    const baseUrl = window.location.origin + window.location.pathname;
    const newUrl = `${baseUrl}?lat=${roundedLat}&lon=${roundedLng}&name=${encodeURIComponent(locationName)}`;
    
    // Navigate to new location
    window.location.href = newUrl;
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure other scripts have loaded
  setTimeout(() => {
    window.LocationPicker.init();
  }, 200);
});
