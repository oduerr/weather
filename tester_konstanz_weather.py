from os import path
import requests
from datetime import datetime, timedelta, timezone

base_url = "https://fogcast.in.htwg-konstanz.de/api/" # To access the external API
url = base_url + "weatherstation"
end_time = datetime.now(timezone.utc)
start_time = end_time - timedelta(minutes=5)

params = {
    "start": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "stop": end_time.strftime("%Y-%m-%dT%H:%M:%SZ")
}

response = requests.get(url, params=params, verify=False)
weather_json = response.json()
print(weather_json)
