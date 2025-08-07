/**
 * Test script for weather station API integration
 * Run this in the browser console to test the weather station functionality
 */

// Test weather station API
async function testWeatherStationAPI() {
  console.log("🧪 Testing Weather Station API...");
  
  try {
    // Test 1: Fetch raw weather station data
    console.log("📡 Fetching raw weather station data...");
    const endTime = new Date().toISOString();
    const startTime = new Date().toISOString().split('T')[0] + "T00:00:00Z";
    
    const rawData = await window.WeatherAPI.fetchWeatherStationData(startTime, endTime);
    console.log("✅ Raw data fetched:", rawData.length, "measurements");
    console.log("Sample data:", rawData.slice(0, 2));
    
    // Test 2: Process weather station data
    console.log("🔧 Processing weather station data...");
    const currentDate = new Date().toISOString().split('T')[0];
    const processedData = window.WeatherAPI.processWeatherStationData(rawData, currentDate);
    console.log("✅ Processed data:", processedData);
    
    // Test 3: Get Konstanz weather station data
    console.log("🇩🇪 Getting Konstanz weather station data...");
    const konstanzData = await window.WeatherAPI.getKonstanzWeatherStationData(currentDate);
    console.log("✅ Konstanz data:", konstanzData);
    
    return {
      rawData: rawData.length,
      processedData: processedData,
      konstanzData: konstanzData
    };
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    return { error: error.message };
  }
}

// Test the integration
console.log("🚀 Weather Station API Test");
console.log("Run testWeatherStationAPI() to test the integration");

// Auto-run test if API is available
if (window.WeatherAPI) {
  setTimeout(() => {
    testWeatherStationAPI().then(result => {
      console.log("🎯 Test Results:", result);
    });
  }, 1000);
} else {
  console.log("⚠️ WeatherAPI not available yet, run testWeatherStationAPI() after page loads");
}
