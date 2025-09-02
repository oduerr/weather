/**
 * Location Search Module
 * Provides location search functionality using Open-Meteo Geocoding API
 * and browser geolocation with reverse geocoding
 */

window.LocationSearch = {
  isSearchMode: false,
  searchTimeout: null,
  
  /**
   * Initialize the location search functionality
   */
  init: function() {
    this.setupEventListeners();
    console.log("✅ Location search initialized");
  },
  
  /**
   * Setup event listeners for search functionality
   */
  setupEventListeners: function() {
    const searchInput = document.getElementById('locationSearchInput');
    const locationSelect = document.getElementById('locationSelect');
    const searchContainer = document.getElementById('locationSearchContainer');
    const searchResults = document.getElementById('locationSearchResults');
    
    if (!searchInput) {
      console.warn("Location search input not found");
      return;
    }
    
    // Search input handling
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        this.debounceSearch(query);
      } else {
        this.hideSearchResults();
      }
    });
    
    // Handle keyboard navigation and selection
    searchInput.addEventListener('keydown', (e) => {
      this.handleKeyNavigation(e);
    });
    
    // Hide search results when clicking outside
    document.addEventListener('click', (e) => {
      if (searchContainer && !searchContainer.contains(e.target)) {
        this.hideSearchResults();
        if (this.isSearchMode && searchInput.value.trim() === '') {
          this.toggleSearchMode(); // Exit search mode if empty
        }
      }
    });
    
    // Handle escape key to exit search mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isSearchMode) {
        this.toggleSearchMode();
      }
    });
  },
  
  /**
   * Open search modal dialog
   */
  toggleSearchMode: function() {
    this.openSearchModal();
  },

  /**
   * Open the search modal for location search
   */
  openSearchModal: function() {
    if (this.isSearchMode) return;
    this.isSearchMode = true;
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'search-modal-overlay';
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
      max-width: 500px;
      max-height: 80vh;
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
    title.textContent = 'Search for Location';
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
    closeButton.onclick = () => this.closeSearchModal();
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // Create search content
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 20px;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'modal-search-input';
    searchInput.placeholder = 'Type a city name (e.g., Berlin, Paris, Tokyo)...';
    searchInput.style.cssText = `
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
      margin-bottom: 16px;
    `;
    
    // Create results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'modal-search-results';
    resultsContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      border: 1px solid #eee;
      border-radius: 8px;
      min-height: 200px;
      max-height: 300px;
    `;
    
    // Add initial message
    resultsContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #666;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <div>Start typing to search for locations</div>
      </div>
    `;
    
    content.appendChild(searchInput);
    content.appendChild(resultsContainer);
    
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
    instructions.innerHTML = 'Use <kbd>↑</kbd> <kbd>↓</kbd> arrow keys to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close.';
    
    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(instructions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Setup event listeners
    this.setupModalEventListeners(searchInput, resultsContainer, overlay);
    
    // Focus search input
    setTimeout(() => {
      searchInput.focus();
    }, 100);
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeSearchModal();
      }
    });
  },

  /**
   * Setup event listeners for the search modal
   */
  setupModalEventListeners: function(searchInput, resultsContainer, overlay) {
    // Search input handling
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query.length >= 2) {
        this.debounceModalSearch(query, resultsContainer);
      } else {
        this.showModalInitialState(resultsContainer);
      }
    });
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
      this.handleModalKeyNavigation(e, resultsContainer);
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isSearchMode) {
        this.closeSearchModal();
      }
    });
  },

  /**
   * Close the search modal
   */
  closeSearchModal: function() {
    const overlay = document.getElementById('search-modal-overlay');
    if (overlay) {
      overlay.remove();
    }
    this.isSearchMode = false;
    
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  },

  /**
   * Show initial state in modal
   */
  showModalInitialState: function(resultsContainer) {
    resultsContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #666;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <div>Start typing to search for locations</div>
      </div>
    `;
  },
  
  /**
   * Debounced search to avoid too many API calls
   */
  debounceSearch: function(query) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    
    this.searchTimeout = setTimeout(() => {
      this.searchLocations(query);
    }, 300);
  },

  /**
   * Debounced search for modal
   */
  debounceModalSearch: function(query, resultsContainer) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    
    this.searchTimeout = setTimeout(() => {
      this.searchModalLocations(query, resultsContainer);
    }, 300);
  },
  
  /**
   * Search for locations using Open-Meteo Geocoding API
   */
  searchLocations: async function(query) {
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.displaySearchResults(data.results || []);
    } catch (error) {
      console.error('Error searching locations:', error);
      this.displaySearchError();
    }
  },

  /**
   * Search for locations in modal
   */
  searchModalLocations: async function(query, resultsContainer) {
    // Show loading state
    resultsContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #666;">
        <div style="font-size: 48px; margin-bottom: 16px;">⌛</div>
        <div>Searching for "${query}"...</div>
      </div>
    `;
    
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      this.displayModalSearchResults(data.results || [], resultsContainer);
    } catch (error) {
      console.error('Error searching locations:', error);
      this.displayModalSearchError(resultsContainer);
    }
  },

  /**
   * Display search results in modal
   */
  displayModalSearchResults: function(results, resultsContainer) {
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; color: #666;">
          <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
          <div>No locations found</div>
          <div style="font-size: 14px; margin-top: 8px;">Try a different search term</div>
        </div>
      `;
      return;
    }
    
    const resultsHtml = results.map((location, index) => {
      const displayName = this.formatLocationName(location);
      return `
        <div 
          class="modal-search-result-item" 
          data-index="${index}"
          data-lat="${location.latitude}" 
          data-lon="${location.longitude}" 
          data-name="${displayName}"
          style="
            padding: 16px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            transition: background-color 0.2s ease;
          "
          onmouseover="this.style.backgroundColor='#f5f5f5'"
          onmouseout="this.style.backgroundColor='white'"
        >
          <div style="font-weight: 500; color: #333; font-size: 16px;">${displayName}</div>
          <div style="font-size: 14px; color: #666; margin-top: 4px;">
            ${location.country}${location.admin1 ? `, ${location.admin1}` : ''}
          </div>
          <div style="font-size: 12px; color: #999; margin-top: 2px;">
            ${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°
          </div>
        </div>
      `;
    }).join('');
    
    resultsContainer.innerHTML = resultsHtml;
    
    // Add click handlers to results
    resultsContainer.querySelectorAll('.modal-search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectModalSearchResult(item);
      });
    });
  },

  /**
   * Display search error in modal
   */
  displayModalSearchError: function(resultsContainer) {
    resultsContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #d32f2f;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div>Error searching locations</div>
        <div style="font-size: 14px; margin-top: 8px;">Please try again</div>
      </div>
    `;
  },

  /**
   * Handle keyboard navigation in modal
   */
  handleModalKeyNavigation: function(e, resultsContainer) {
    const items = resultsContainer.querySelectorAll('.modal-search-result-item');
    
    if (items.length === 0) return;
    
    const currentSelected = resultsContainer.querySelector('.modal-search-result-item.selected');
    let selectedIndex = currentSelected ? parseInt(currentSelected.dataset.index) : -1;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        this.highlightModalResult(selectedIndex, resultsContainer);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        this.highlightModalResult(selectedIndex, resultsContainer);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          this.selectModalSearchResult(items[selectedIndex]);
        } else if (items.length > 0) {
          // Select first result if none highlighted
          this.selectModalSearchResult(items[0]);
        }
        break;
    }
  },

  /**
   * Highlight a modal search result
   */
  highlightModalResult: function(index, resultsContainer) {
    const items = resultsContainer.querySelectorAll('.modal-search-result-item');
    
    // Remove previous selection
    items.forEach(item => {
      item.classList.remove('selected');
      item.style.backgroundColor = 'white';
    });
    
    // Add selection to current item
    if (items[index]) {
      items[index].classList.add('selected');
      items[index].style.backgroundColor = '#e3f2fd';
      items[index].scrollIntoView({ block: 'nearest' });
    }
  },

  /**
   * Select a modal search result
   */
  selectModalSearchResult: function(item) {
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;
    
    this.closeSearchModal();
    this.navigateToLocation({ lat, lon, name });
  },
  
  /**
   * Display search results in dropdown
   */
  displaySearchResults: function(results) {
    const searchResults = document.getElementById('locationSearchResults');
    
    if (!results || results.length === 0) {
      searchResults.innerHTML = '<div style="padding: 12px; color: #666; text-align: center;">No locations found</div>';
      searchResults.style.display = 'block';
      return;
    }
    
    const resultsHtml = results.map((location, index) => {
      const displayName = this.formatLocationName(location);
      return `
        <div 
          class="search-result-item" 
          data-index="${index}"
          data-lat="${location.latitude}" 
          data-lon="${location.longitude}" 
          data-name="${displayName}"
          style="
            padding: 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            transition: background-color 0.2s ease;
          "
          onmouseover="this.style.backgroundColor='#f5f5f5'"
          onmouseout="this.style.backgroundColor='white'"
        >
          <div style="font-weight: 500; color: #333;">${displayName}</div>
          <div style="font-size: 12px; color: #666;">
            ${location.country}${location.admin1 ? `, ${location.admin1}` : ''}
            • ${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°
          </div>
        </div>
      `;
    }).join('');
    
    searchResults.innerHTML = resultsHtml;
    searchResults.style.display = 'block';
    
    // Add click handlers to results
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectSearchResult(item);
      });
    });
  },
  
  /**
   * Display search error message
   */
  displaySearchError: function() {
    const searchResults = document.getElementById('locationSearchResults');
    searchResults.innerHTML = '<div style="padding: 12px; color: #d32f2f; text-align: center;">Error searching locations. Please try again.</div>';
    searchResults.style.display = 'block';
  },
  
  /**
   * Format location name for display
   */
  formatLocationName: function(location) {
    let name = location.name;
    
    // Add country flag emoji if available
    const countryFlags = {
      'Germany': '🇩🇪',
      'Switzerland': '🇨🇭',
      'Austria': '🇦🇹',
      'France': '🇫🇷',
      'Italy': '🇮🇹',
      'United States': '🇺🇸',
      'United Kingdom': '🇬🇧',
      'Canada': '🇨🇦',
      'Australia': '🇦🇺',
      'Japan': '🇯🇵',
      'Finland': '🇫🇮',
      'Netherlands': '🇳🇱',
      'Denmark': '🇩🇰',
      'Norway': '🇳🇴',
      'Sweden': '🇸🇪'
    };
    
    const flag = countryFlags[location.country] || '🌍';
    return `${flag} ${name}`;
  },
  
  /**
   * Handle keyboard navigation in search results
   */
  handleKeyNavigation: function(e) {
    const searchResults = document.getElementById('locationSearchResults');
    const items = searchResults.querySelectorAll('.search-result-item');
    
    if (items.length === 0) return;
    
    const currentSelected = searchResults.querySelector('.search-result-item.selected');
    let selectedIndex = currentSelected ? parseInt(currentSelected.dataset.index) : -1;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        this.highlightResult(selectedIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        this.highlightResult(selectedIndex);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          this.selectSearchResult(items[selectedIndex]);
        } else if (items.length > 0) {
          // Select first result if none highlighted
          this.selectSearchResult(items[0]);
        }
        break;
    }
  },
  
  /**
   * Highlight a search result
   */
  highlightResult: function(index) {
    const searchResults = document.getElementById('locationSearchResults');
    const items = searchResults.querySelectorAll('.search-result-item');
    
    // Remove previous selection
    items.forEach(item => {
      item.classList.remove('selected');
      item.style.backgroundColor = 'white';
    });
    
    // Add selection to current item
    if (items[index]) {
      items[index].classList.add('selected');
      items[index].style.backgroundColor = '#e3f2fd';
    }
  },
  
  /**
   * Select a search result and navigate to location
   */
  selectSearchResult: function(item) {
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;
    
    this.navigateToLocation({ lat, lon, name });
  },
  
  /**
   * Hide search results dropdown
   */
  hideSearchResults: function() {
    const searchResults = document.getElementById('locationSearchResults');
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
  },
  
  /**
   * Get current location using browser geolocation API
   */
  getCurrentLocation: function() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by this browser.');
      return;
    }
    
    console.log('Getting current location...');
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    };
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Perform reverse geocoding to get location name
        this.reverseGeocode(lat, lon);
      },
      (error) => {
        console.error('Geolocation error:', error);
        
        let errorMessage = 'Unable to get your location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied by user.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }
        
        alert(errorMessage);
      },
      options
    );
  },
  
  /**
   * Reverse geocode coordinates to get location name using a different approach
   */
  reverseGeocode: async function(lat, lon) {
    try {
      // Since Open-Meteo doesn't support reverse geocoding, use a simple clean name
      // Coordinates are already in the URL parameters, so no need to include them in the name
      const locationName = 'Current Location';
      
      // Navigate to the location
      this.navigateToLocation({ lat, lon, name: locationName });
      
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      
      // Use simple fallback name - coordinates are in URL parameters anyway
      const locationName = 'Current Location';
      this.navigateToLocation({ lat, lon, name: locationName });
    }
  },
  
  /**
   * Navigate to a selected location
   */
  navigateToLocation: function(location) {
    console.log('Navigating to location:', location);
    
    // Round coordinates to reasonable precision
    const roundedLat = Math.round(location.lat * 10000) / 10000;
    const roundedLon = Math.round(location.lon * 10000) / 10000;
    
    // Create location object
    const locationData = {
      lat: roundedLat,
      lon: roundedLon,
      name: location.name
    };
    
    // Hide search results and exit search mode if active
    this.hideSearchResults();
    if (this.isSearchMode) {
      this.toggleSearchMode();
    }
    
    // Update URL parameters and trigger data loading
    const baseUrl = window.location.origin + window.location.pathname;
    const newUrl = `${baseUrl}?lat=${roundedLat}&lon=${roundedLon}&name=${encodeURIComponent(location.name)}`;
    
    // Use pushState to update URL without full page reload
    window.history.pushState({ location: locationData }, '', newUrl);
    
    // Add to dropdown if not already present
    this.addLocationToDropdown(locationData);
    
    // Trigger weather data fetch
    if (window.fetchAndPlot && typeof window.fetchAndPlot === 'function') {
      window.fetchAndPlot();
    }
  },
  
  /**
   * Add a new location to the dropdown if not already present
   */
  addLocationToDropdown: function(locationData) {
    const locationSelect = document.getElementById('locationSelect');
    
    // Decode the location name in case it came from URL parameters
    const decodedName = decodeURIComponent(locationData.name);
    const cleanLocationData = {
      lat: locationData.lat,
      lon: locationData.lon,
      name: decodedName
    };
    
    // Check if location already exists (check by coordinates)
    let exists = false;
    let existingIndex = -1;
    
    for (let i = 0; i < locationSelect.options.length; i++) {
      const option = locationSelect.options[i];
      try {
        const optValue = JSON.parse(option.value);
        if (Math.abs(optValue.lat - cleanLocationData.lat) < 0.001 && 
            Math.abs(optValue.lon - cleanLocationData.lon) < 0.001) {
          exists = true;
          existingIndex = i;
          break;
        }
      } catch (e) {
        // Skip invalid options (like MAP_PICKER, etc.)
        continue;
      }
    }
    
    if (exists) {
      // Select the existing option
      locationSelect.selectedIndex = existingIndex;
      console.log("Selected existing location at index:", existingIndex);
    } else {
      // Add new option and select it
      const option = document.createElement('option');
      option.value = JSON.stringify(cleanLocationData);
      option.textContent = cleanLocationData.name;
      
      // Insert before the separator (find the first disabled option)
      let insertIndex = locationSelect.options.length;
      for (let i = 0; i < locationSelect.options.length; i++) {
        if (locationSelect.options[i].disabled) {
          insertIndex = i;
          break;
        }
      }
      
      if (insertIndex < locationSelect.options.length) {
        locationSelect.insertBefore(option, locationSelect.options[insertIndex]);
        locationSelect.selectedIndex = insertIndex;
      } else {
        locationSelect.appendChild(option);
        locationSelect.selectedIndex = locationSelect.options.length - 1;
      }
      
      console.log("Added new location:", cleanLocationData);
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure other scripts have loaded
  setTimeout(() => {
    if (window.LocationSearch) {
      window.LocationSearch.init();
    }
  }, 250);
});
