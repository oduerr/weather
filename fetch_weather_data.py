import requests
import json
from datetime import datetime

def fetch_weather_data_to_json(latitude=47.6952, longitude=9.1307, model="icon_d2", output_file="fixtures/weather_data.json"):
    """
    Fetch weather data from Open-Meteo API and save to JSON file
    
    Args:
        latitude (float): Latitude coordinate
        longitude (float): Longitude coordinate  
        model (str): Weather model (e.g., "icon_d2", "meteoswiss_icon_ch1")
        output_file (str): Output JSON file path
    """
    
    # API endpoint
    url = "https://api.open-meteo.com/v1/forecast"
    
    # Parameters for deterministic model
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "dew_point_2m",
            "precipitation", "precipitation_probability", "weather_code",
            "cloud_cover", "cloud_cover_low", "cloud_cover_mid",
            "cloud_cover_high", "visibility", "sunshine_duration",
            "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
        ],
        "daily": ["sunrise", "sunset"],
        "timezone": "Europe/Berlin",
        "models": model
    }
    
    try:
        # Make API request
        print(f"Fetching weather data for {latitude}, {longitude} using {model}...")
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        # Get the data
        data = response.json()
        
        # Add metadata
        data["_metadata"] = {
            "generated_at": datetime.now().isoformat(),
            "source": "Open-Meteo API",
            "location": {"lat": latitude, "lon": longitude},
            "model": model
        }
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Weather data saved to {output_file}")
        print(f"📊 Data contains {len(data['hourly']['time'])} hourly data points")
        print(f"🌡️ Temperature range: {min(data['hourly']['temperature_2m'])}°C to {max(data['hourly']['temperature_2m'])}°C")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching data: {e}")
        return None
    except Exception as e:
        print(f"❌ Error saving data: {e}")
        return None

def fetch_ensemble_data_to_json(latitude=47.6952, longitude=9.1307, model="icon_d2", output_file="fixtures/ensemble_data.json"):
    """
    Fetch ensemble weather data from Open-Meteo API and save to JSON file
    
    Args:
        latitude (float): Latitude coordinate
        longitude (float): Longitude coordinate  
        model (str): Weather model (e.g., "icon_d2", "gfs025")
        output_file (str): Output JSON file path
    """
    
    # API endpoint for ensemble data
    url = "https://ensemble-api.open-meteo.com/v1/ensemble"
    
    # Parameters for ensemble model
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": [
            "temperature_2m", "relative_humidity_2m",
            "precipitation", "cloud_cover", "weather_code",
            "uv_index", "uv_index_clear_sky", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
        ],
        "timezone": "Europe/Berlin",
        "models": model
    }
    
    try:
        # Make API request
        print(f"Fetching ensemble weather data for {latitude}, {longitude} using {model}...")
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        # Get the data
        data = response.json()
        
        # Add metadata
        data["_metadata"] = {
            "generated_at": datetime.now().isoformat(),
            "source": "Open-Meteo Ensemble API",
            "location": {"lat": latitude, "lon": longitude},
            "model": model,
            "type": "ensemble"
        }
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Ensemble weather data saved to {output_file}")
        print(f"📊 Data contains {len(data['hourly']['time'])} hourly data points")
        print(f"🌡️ Temperature range: {min(data['hourly']['temperature_2m'])}°C to {max(data['hourly']['temperature_2m'])}°C")
        
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching ensemble data: {e}")
        return None
    except Exception as e:
        print(f"❌ Error saving ensemble data: {e}")
        return None

# Example usage:
if __name__ == "__main__":
    print("🌤️ Weather Data Fetcher")
    print("=" * 50)
    
    # Fetch data for Konstanz (deterministic)
    fetch_weather_data_to_json(
        latitude=47.6952, 
        longitude=9.1307, 
        model="icon_d2",
        output_file="fixtures/konstanz_weather.json"
    )
    
    # Fetch data for Zurich
    fetch_weather_data_to_json(
        latitude=47.3769, 
        longitude=8.5417, 
        model="meteoswiss_icon_ch1",
        output_file="fixtures/zurich_weather.json"
    )
    
    # Fetch data for Espoo
    fetch_weather_data_to_json(
        latitude=60.205490, 
        longitude=24.655899, 
        model="icon_d2",
        output_file="fixtures/espoo_weather.json"
    )
    
    # Fetch ensemble data for Konstanz
    fetch_ensemble_data_to_json(
        latitude=47.6952, 
        longitude=9.1307, 
        model="icon_d2",
        output_file="fixtures/konstanz_ensemble.json"
    )
    
    print("\n🎉 All weather data files created successfully!")
    print("📁 Check the fixtures/ folder for the JSON files")
