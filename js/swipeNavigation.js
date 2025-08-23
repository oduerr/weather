/**
 * Swipe Navigation Module
 * Provides swipe gestures and keyboard navigation for time axis panning
 */

window.SwipeNavigation = {
  isEnabled: true,
  touchStartX: null,
  touchStartY: null,
  touchStartTime: null,
  minSwipeDistance: 50, // Minimum distance for a swipe
  maxSwipeTime: 500, // Maximum time for a swipe (ms)
  plotElement: null,
  
  /**
   * Initialize swipe navigation
   */
  init: function() {
    this.setupTouchListeners();
    this.setupKeyboardListeners();
    this.cacheElements();
  },
  
  /**
   * Cache DOM elements for performance
   */
  cacheElements: function() {
    this.plotElement = document.getElementById('plot');
  },
  
  /**
   * Setup touch event listeners
   */
  setupTouchListeners: function() {
    // Use document for global touch handling
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
  },
  
  /**
   * Setup keyboard event listeners
   */
  setupKeyboardListeners: function() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this), { passive: false });
  },
  
  /**
   * Handle touch start event
   */
  handleTouchStart: function(event) {
    if (!this.isEnabled || !this.hasActivePlot() || this.isTouchInPlotArea(event)) {
      return;
    }
    
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
  },
  
  /**
   * Handle touch end event
   */
  handleTouchEnd: function(event) {
    if (!this.isEnabled || !this.hasActivePlot() || 
        this.touchStartX === null || this.touchStartY === null) {
      this.resetTouch();
      return;
    }
    
    const touch = event.changedTouches[0];
    const touchEndX = touch.clientX;
    const touchEndY = touch.clientY;
    const touchEndTime = Date.now();
    
    // Calculate swipe metrics
    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;
    const deltaTime = touchEndTime - this.touchStartTime;
    const distance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);
    
    // Check if this is a valid horizontal swipe
    if (this.isValidSwipe(distance, verticalDistance, deltaTime)) {
      const direction = deltaX > 0 ? 'right' : 'left';
      this.handleSwipe(direction);
    }
    
    this.resetTouch();
  },
  
  /**
   * Handle keyboard navigation
   */
  handleKeyDown: function(event) {
    if (!this.isEnabled || !this.hasActivePlot()) {
      return;
    }
    
    // Only handle arrow keys and avoid interference with input fields
    if (event.target.tagName.toLowerCase() === 'input' || 
        event.target.tagName.toLowerCase() === 'select' ||
        event.target.tagName.toLowerCase() === 'textarea') {
      return;
    }
    
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.handleSwipe('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.handleSwipe('right');
        break;
    }
  },
  
  /**
   * Check if touch is within the Plotly plot area
   */
  isTouchInPlotArea: function(event) {
    if (!this.plotElement) {
      this.cacheElements();
    }
    
    if (!this.plotElement) {
      return false;
    }
    
    const touch = event.touches[0];
    const rect = this.plotElement.getBoundingClientRect();
    
    return (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    );
  },
  
  /**
   * Check if we have an active Plotly plot
   */
  hasActivePlot: function() {
    if (!this.plotElement) {
      this.cacheElements();
    }
    
    return this.plotElement && 
           this.plotElement.classList && 
           this.plotElement.classList.contains('js-plotly-plot');
  },
  
  /**
   * Validate swipe gesture
   */
  isValidSwipe: function(distance, verticalDistance, deltaTime) {
    return (
      distance >= this.minSwipeDistance && // Minimum horizontal distance
      deltaTime <= this.maxSwipeTime && // Within time limit
      verticalDistance < distance * 0.5 // More horizontal than vertical
    );
  },
  
  /**
   * Handle swipe gesture
   */
  handleSwipe: function(direction) {
    try {
      const currentRange = this.getCurrentXAxisRange();
      if (!currentRange) {
        console.warn('SwipeNavigation: Could not get current x-axis range');
        return;
      }
      
      const newRange = this.calculateNewRange(currentRange, direction);
      this.updateXAxisRange(newRange);
      
    } catch (error) {
      console.warn('SwipeNavigation: Error handling swipe', error);
    }
  },
  
  /**
   * Get current x-axis range from Plotly
   */
  getCurrentXAxisRange: function() {
    if (!this.plotElement || !this.plotElement.layout) {
      return null;
    }
    
    const layout = this.plotElement.layout || this.plotElement._fullLayout || {};
    const xaxis = layout.xaxis;
    
    if (!xaxis || !Array.isArray(xaxis.range) || xaxis.range.length !== 2) {
      return null;
    }
    
    return {
      start: new Date(xaxis.range[0]),
      end: new Date(xaxis.range[1])
    };
  },
  
  /**
   * Calculate new range based on swipe direction
   */
  calculateNewRange: function(currentRange, direction) {
    const currentWidth = currentRange.end - currentRange.start;
    const panDistance = currentWidth * 0.75; // 0.5x current range
    
    let newStart, newEnd;
    
    if (direction === 'right') {
      // Swipe right = move forward in time
      newStart = new Date(currentRange.start.getTime() + panDistance);
      newEnd = new Date(currentRange.end.getTime() + panDistance);
    } else {
      // Swipe left = move backward in time
      newStart = new Date(currentRange.start.getTime() - panDistance);
      newEnd = new Date(currentRange.end.getTime() - panDistance);
    }
    
    // Clamp to data boundaries if available
    const dataRange = this.getDataBoundaries();
    if (dataRange) {
      // Don't pan beyond data boundaries
      if (newStart < dataRange.start) {
        const offset = dataRange.start - newStart;
        newStart = dataRange.start;
        newEnd = new Date(newEnd.getTime() + offset);
      }
      
      if (newEnd > dataRange.end) {
        const offset = newEnd - dataRange.end;
        newEnd = dataRange.end;
        newStart = new Date(newStart.getTime() - offset);
      }
      
      // Final boundary check
      if (newStart < dataRange.start) {
        newStart = dataRange.start;
      }
      if (newEnd > dataRange.end) {
        newEnd = dataRange.end;
      }
    }
    
    return { start: newStart, end: newEnd };
  },
  
  /**
   * Get data boundaries from plot element
   */
  getDataBoundaries: function() {
    if (!this.plotElement) {
      return null;
    }
    
    const startTime = this.plotElement.getAttribute('data-start-time');
    const endTime = this.plotElement.getAttribute('data-end-time');
    
    if (!startTime || !endTime) {
      return null;
    }
    
    return {
      start: new Date(startTime),
      end: new Date(endTime)
    };
  },
  
  /**
   * Update x-axis range using Plotly
   */
  updateXAxisRange: function(newRange) {
    if (!window.Plotly || !this.plotElement) {
      return;
    }
    
    const formatTime = (date) => date.toISOString().replace('Z', '');
    
    Plotly.animate('plot', {
      layout: {
        'xaxis.range': [formatTime(newRange.start), formatTime(newRange.end)]
      }
    }, {
      transition: {
        duration: 600,  // 300ms animation
        easing: 'ease-out'
      },
      frame: {
        duration: 600,
        redraw: false
      }
    });
  },
  
  /**
   * Reset touch tracking variables
   */
  resetTouch: function() {
    this.touchStartX = null;
    this.touchStartY = null;
    this.touchStartTime = null;
  },
  
  /**
   * Enable swipe navigation
   */
  enable: function() {
    this.isEnabled = true;
  },
  
  /**
   * Disable swipe navigation
   */
  disable: function() {
    this.isEnabled = false;
    this.resetTouch();
  },
  
  /**
   * Cleanup event listeners (for potential future use)
   */
  destroy: function() {
    this.disable();
    // Note: In a production app, you might want to remove event listeners
    // For this implementation, we'll keep them attached since they're lightweight
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit to ensure other scripts have loaded
  setTimeout(() => {
    window.SwipeNavigation.init();
  }, 300);
});
