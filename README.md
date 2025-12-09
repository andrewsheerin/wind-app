# HRRR Wind Forecast Viewer

This application provides an interactive 120-hour High Resolution Rapid Refresh (HRRR) wind forecast for any point on a map.  
A Flask backend retrieves forecast data from the Open-Meteo API, and the frontend uses Leaflet and Plotly to display the results.

---

## Overview

- Click anywhere on the map to select a location.  
- Fetches a 120-hour wind forecast (speed, gusts, direction).  
- Interactive Plotly bar chart with:
  - Color-mapped wind speeds  
  - Gust error bars   
  - Wind-direction table displayed under the main plot.  

---

## Output

Example forecast figure:

![Example HRRR Wind Forecast](figure.png)

---

## Requirements

### Python Dependencies

Install using pip:

```bash
pip install Flask open-meteo numpy
