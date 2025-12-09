/***********************************************************
 * MAP + POINT SELECTION
 ***********************************************************/
let map, marker = null;

/**
 * Initialize the Leaflet map and default state
 */
function initMap() {
  map = L.map('map').setView([41.6785, -71.5338], 10);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM / CARTO',
    subdomains: 'abcd',
    maxZoom: 15,
    minZoom: 3
  }).addTo(map);

  // Clicking on the map updates the forecast location
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    setPoint(lat, lng);
  });

  // Initial point
  setPoint(41.5231, -71.3423);
}

/**
 * Update latitude/longitude fields and move the marker
 */
function setPoint(lat, lon) {
  document.getElementById('lat').value = lat.toFixed(5);
  document.getElementById('lon').value = lon.toFixed(5);

  if (marker) {
    marker.setLatLng([lat, lon]);
  } else {
    marker = L.marker([lat, lon]).addTo(map);
  }
}

/***********************************************************
 * FORECAST + PLOT
 ***********************************************************/
async function getForecast() {
  const lat = parseFloat(document.getElementById('lat').value);
  const lon = parseFloat(document.getElementById('lon').value);
  const hours = 120;

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    alert('Click the map to select a point first.');
    return;
  }

  const btn = document.getElementById('go');
  btn.disabled = true;
  btn.textContent = 'Fetching...';

  try {
    /*********************************************************
     * Request forecast from backend
     *********************************************************/
    const res = await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, hours })
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || `Request failed (${res.status})`);
    }

    const { time, wind_dir, wind_speed, wind_gust } = await res.json();

    /*********************************************************
     * Time window setup
     *********************************************************/
    const fullStart = new Date(time[0]);
    const fullEnd   = new Date(time[time.length - 1]);

    // Pad start/end so the first & last bars aren't clipped
    const barPad = 0.5 * 3600 * 1000;
    const fullStartPadded = new Date(fullStart.getTime() - barPad);
    const fullEndPadded   = new Date(fullEnd.getTime() + barPad);

    const visibleSpan = 36 * 3600 * 1000; // 36-hour view

    let currentStart = new Date(fullStartPadded);
    let currentEnd   = new Date(fullStartPadded.getTime() + visibleSpan);

    /*********************************************************
     * Build custom tick labels: even hours + date at 06 & 18
     *********************************************************/
    const tickvals = [];
    const ticktext = [];

    let cursor = new Date(fullStart);
    while (cursor <= fullEnd) {
      const hour = cursor.getHours();

      if (hour % 2 === 0) {
        const hourLabel = hour.toString().padStart(2, '0');
        let label;

        if (hour === 6 || hour === 18) {
          const dateLabel = cursor.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          });
          label = `${hourLabel}<br><b>${dateLabel}</b>`;
        } else {
          label = hourLabel;
        }

        tickvals.push(new Date(cursor));
        ticktext.push(label);
      }

      cursor = new Date(cursor.getTime() + 3600 * 1000);
    }

    /*********************************************************
     * Wind speed & gust error bars
     *********************************************************/
    const err = wind_speed.map((v, i) =>
      Math.max(0, (wind_gust[i] ?? v) - v)
    );

    // Pre-format tooltip date/hour fields
    const custom = time.map((t, i) => {
      const d = new Date(t);
      return [
        wind_gust[i],
        d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }),
        d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      ];
    });

    /*********************************************************
     * Plot traces
     *********************************************************/
    const bar = {
      type: 'bar',
      x: time,
      y: wind_speed,
      name: 'Wind speed (kt)',
      marker: {
        color: wind_speed,
        colorscale: 'Viridis',
        cmin: Math.min(...wind_speed),
        cmax: Math.max(...wind_gust)
      },
      error_y: {
        type: 'data',
        symmetric: false,
        array: err,
        arrayminus: new Array(err.length).fill(0),
        visible: true,
        capthickness: 0,
        layer: 'below'
      },
      customdata: custom,
      hovertemplate:
        'Date: %{customdata[1]}<br>' +
        'Hour: %{customdata[2]}<br>' +
        'Speed: %{y:.1f} kt<br>' +
        'Gust: %{customdata[0]:.1f} kt<extra></extra>',
      xaxis: 'x',
      yaxis: 'y'
    };

    // Single row of direction numbers in its own bottom axis band
    const dirNumbers = {
      type: 'scatter',
      mode: 'text',
      x: time,
      y: new Array(time.length).fill(0.3),
      text: wind_dir.map(v => v == null ? '' : `${Math.round(v)}°`),
      textfont: { size: 12, color: 'black' },
      textposition: 'middle center',
      hoverinfo: 'skip',
      xaxis: 'x',
      yaxis: 'y2'
    };

    /*********************************************************
     * Layout
     *********************************************************/
    const layout = {
      title: {
        text: 'High Resolution Rapid Refresh (HRRR) – Wind Forecast',
        font: { size: 20, family: 'Arial, sans-serif' },
        x: 0.5,
        xanchor: 'center'
      },
      margin: { l: 60, r: 20, t: 60, b: 0 },
      paper_bgcolor: 'rgb(245,245,245)',
      plot_bgcolor: 'rgb(245,245,245)',
      showlegend: false,

      xaxis: {
        type: 'date',
        range: [currentStart, currentEnd],
        rangeslider: { visible: false },
        fixedrange: false,
        tickmode: 'array',
        tickvals,
        ticktext,
        tickangle: 0,
        automargin: true,
        anchor: 'y',
        tickfont: { size: 12 },
        ticklabelmode: 'html'
      },

      yaxis: {
        title: 'Knots',
        domain: [0.30, 1.0],
        fixedrange: true
      },

      // Table row sits in this bottom band
      yaxis2: {
        domain: [0.00, 0.22],
        range: [0, 1],
        visible: false,
        fixedrange: true
      }
    };

    /*********************************************************
     * Draw plot
     *********************************************************/
    Plotly.newPlot('plot', [bar, dirNumbers], layout, { responsive: true });
    document.getElementById("plotBar").classList.add("loaded");
    Plotly.relayout('plot', { dragmode: 'pan' });

    const plot = document.getElementById('plot');

    /*********************************************************
     * Wheel / trackpad horizontal scrolling
     *********************************************************/
    plot.addEventListener('wheel', (e) => {
      let dx = e.deltaX;

      // Allow Shift+wheel for users without horizontal wheels
      if (Math.abs(dx) < Math.abs(e.deltaY)) {
        if (e.shiftKey) dx = e.deltaY;
        else return;
      }

      e.preventDefault();

      const panAmount = dx * 1 * 60 * 1000;

      let proposedStart = new Date(currentStart.getTime() + panAmount);
      let proposedEnd   = new Date(proposedStart.getTime() + visibleSpan);

      // Left bound
      if (proposedStart < fullStartPadded) {
        proposedStart = new Date(fullStartPadded);
        proposedEnd   = new Date(fullStartPadded.getTime() + visibleSpan);
      }

      // Right bound
      if (proposedEnd > fullEndPadded) {
        proposedEnd   = new Date(fullEndPadded);
        proposedStart = new Date(fullEndPadded.getTime() - visibleSpan);
      }

      currentStart = proposedStart;
      currentEnd   = proposedEnd;

      Plotly.relayout(plot, {
        'xaxis.range': [currentStart, currentEnd]
      });
    }, { passive: false });

    /*********************************************************
     * Clamp drag-panning to the dataset bounds
     *********************************************************/
    plot.on('plotly_relayout', (ev) => {
      if (!ev['xaxis.range[0]']) return;

      let proposedStart = new Date(ev['xaxis.range[0]']);
      let proposedEnd   = new Date(proposedStart.getTime() + visibleSpan);

      if (proposedStart < fullStartPadded) {
        proposedStart = new Date(fullStartPadded);
        proposedEnd   = new Date(fullStartPadded.getTime() + visibleSpan);
      }

      if (proposedEnd > fullEndPadded) {
        proposedEnd   = new Date(fullEndPadded);
        proposedStart = new Date(fullEndPadded.getTime() - visibleSpan);
      }

      currentStart = proposedStart;
      currentEnd   = proposedEnd;

      Plotly.relayout(plot, {
        'xaxis.range': [currentStart, currentEnd]
      });
    });

  } catch (err) {
    console.error(err);
    alert(err.message || 'Forecast request failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Forecast';
  }
}

/***********************************************************
 * PAGE STARTUP
 ***********************************************************/
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  document.getElementById('go').addEventListener('click', getForecast);
});
