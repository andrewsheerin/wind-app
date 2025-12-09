from flask import Flask, render_template, request, jsonify, send_from_directory
from open_meteo import OpenMeteo
from open_meteo.models import HourlyParameters
from datetime import datetime, timedelta
import asyncio
import threading
import numpy as np
import os

app = Flask(__name__)

# Ensure a static path for the rendered figure
STATIC_DIR = os.path.join(app.root_path, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
PLOT_PATH = os.path.join(STATIC_DIR, "figure.png")

# Open-Meteo client
open_meteo = OpenMeteo()

async def fetch_openmeteo(lat: float, lon: float, hours: int = 120):
    forecast = await open_meteo.forecast(
        latitude=lat,
        longitude=lon,
        current_weather=False,
        wind_speed_unit='kn',
        hourly=[
            HourlyParameters.TEMPERATURE_2M,
            HourlyParameters.WIND_DIRECTION_10M,
            HourlyParameters.WIND_SPEED_10M,
            HourlyParameters.WIND_GUSTS_10M
        ],
    )

    nhours = max(1, int(hours))
    hourly_time = forecast.hourly.time[0:nhours]
    wind_dir = forecast.hourly.wind_direction_10m[0:nhours]
    wind_speed = forecast.hourly.wind_speed_10m[0:nhours]
    wind_gusts = forecast.hourly.wind_gusts_10m[0:nhours]

    # Normalize timestamps to datetimes for Matplotlib
    times_dt = []
    for t in hourly_time:
        if isinstance(t, datetime):
            times_dt.append(t)
        else:
            try:
                times_dt.append(datetime.fromisoformat(str(t).replace("Z", "+00:00")))
            except Exception:
                times_dt.append(datetime.fromtimestamp(0))

    return {
        "time_dt": times_dt,
        "wind_dir": list(wind_dir),
        "wind_speed": list(wind_speed),
        "wind_gust": list(wind_gusts),
    }

# Background event loop runner for async client
class _LoopRunner:
    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run(self, coro, timeout=None):
        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return fut.result(timeout=timeout)

loop_runner = _LoopRunner()


@app.route("/")
def index():
    return render_template("windapp.html")

@app.route("/api/forecast", methods=["POST"])
def api_forecast():
    try:
        payload = request.get_json(force=True)
        lat = float(payload["lat"])
        lon = float(payload["lon"])
        hours = 120 # 5 days
    except Exception:
        return jsonify({"error": "Invalid payload. Provide lat, lon, optional hours."}), 400

    try:
        series = loop_runner.run(fetch_openmeteo(lat, lon, hours), timeout=30)
        # render_png(series, PLOT_PATH)
        times_iso = [t.isoformat() for t in series["time_dt"]]
        return jsonify({
            "time": times_iso,
            "wind_dir": series["wind_dir"],
            "wind_speed": series["wind_speed"],
            "wind_gust": series["wind_gust"],
            "meta": {"lat": lat, "lon": lon, "hours": hours, "unit": "knots"}
        })
    except Exception as e:
        return jsonify({"error": f"Forecast fetch failed: {e}"}), 500


if __name__ == "__main__":
    app.run(debug=True)
