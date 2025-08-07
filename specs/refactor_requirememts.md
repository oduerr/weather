Weather Watcher – Short Requirements (v0.1) extracted via ChatGPT and hand coded

Purpose

Provide a single-page web app to closely monitor local weather using interactive, multi-panel charts.

Data & Dependencies
	•	APIs: Open-Meteo Forecast (/v1/forecast) and Ensemble (https://ensemble-api.open-meteo.com/v1/ensemble), timezone Europe/Berlin.
	•	Libraries: Plotly (CDN).
	•	Storage: localStorage cache, per (lat,lon,model), TTL 1 hour.

Functional Requirements
	1.	Location selection: Choose from predefined list; support custom location via URL params ?lat=…&lon=…&name=… (deduplicate if already present).
	2.	Model selection: Deterministic and ensemble models; call matching endpoint; pass models= parameter.
	3.	Charting: One Plotly figure with three logical rows:
	•	R1: Temperature & dew point; relative humidity on secondary axis; weather icon overlay per WMO code.
	•	R2: Precipitation (bars) with probability and sunshine percentage on secondary axis.
	•	R3: Cloud cover (low/mid/high “tiles” + total) with visibility on secondary axis.
	4.	Temporal features: Night shading (sunset→next sunrise); “Now” vertical line; weekday labels per day.
	5.	View controls: Buttons for 2d, 5d, All; ranges align around current time; manual relayout.
	6.	Status & metadata: Status text (ready/loading/error); title shows model, location, coordinates, elevation, first sunrise/sunset.
	7.	Radar shortcut: Button opens external radar page in new tab (https://www.meteoradar.ch/bilder/mch_aktuell.php)
	8.	Caching: Use cache when fresh; otherwise fetch and update cache; show last update time.
	9.	Error handling: Graceful degradation with user-visible error in status text.

Non-Functional Requirements
	•	Pure client-side; no backend.
	•	Responsive to full-viewport; interactive pan/zoom.
	•	Reasonable performance for multi-day hourly data; first render typically <2–3s on broadband.
	•	Privacy: no PII; only localStorage used.

Acceptance Criteria (samples)
	•	Selecting a different location or model updates the chart and status within 2s.
	•	2d/5d/All buttons adjust the x-axis as specified.
	•	With valid data, night shading and the Now line are visible; weekday annotations appear once per day.
	•	Within 1 hour, a repeated request for the same (lat,lon,model) uses cached data (no network call).
	•	When Konstanz is selected and the station endpoint is reachable, a current temperature is displayed near the controls.

