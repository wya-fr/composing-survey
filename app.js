// --- CONFIGURATION & DATABASE ---
const CITIES = {
  TPE: { name: "台北桃園 (TPE)", code: "TPE", coords: [121.23, 25.08], offset: 8 },
  LAX: { name: "洛杉磯 (LAX)", code: "LAX", coords: [-118.41, 33.94], offset: -7 },
  JFK: { name: "紐約甘迺迪 (JFK)", code: "JFK", coords: [-73.78, 40.64], offset: -4 },
  LHR: { name: "倫敦希斯洛 (LHR)", code: "LHR", coords: [-0.45, 51.47], offset: 1 },
  SIN: { name: "新加坡樟宜 (SIN)", code: "SIN", coords: [103.99, 1.36], offset: 8 },
  NRT: { name: "東京成田 (NRT)", code: "NRT", coords: [140.39, 35.78], offset: 9 },
  SYD: { name: "雪梨 (SYD)", code: "SYD", coords: [151.17, -33.95], offset: 10 },
  DXB: { name: "杜拜 (DXB)", code: "DXB", coords: [55.36, 25.25], offset: 4 },
  FRA: { name: "法蘭克福 (FRA)", code: "FRA", coords: [8.57, 50.03], offset: 2 },
  CPT: { name: "開普敦 (CPT)", code: "CPT", coords: [18.60, -33.97], offset: 2 },
  CDG: { name: "巴黎戴高樂 (CDG)", code: "CDG", coords: [2.55, 49.01], offset: 2 },
  HKG: { name: "香港 (HKG)", code: "HKG", coords: [113.91, 22.31], offset: 8 },
  PEK: { name: "北京首都 (PEK)", code: "PEK", coords: [116.58, 40.08], offset: 8 },
  SFO: { name: "舊金山 (SFO)", code: "SFO", coords: [-122.37, 37.62], offset: -7 },
  ORD: { name: "芝加哥歐海爾 (ORD)", code: "ORD", coords: [-87.90, 41.98], offset: -5 },
  YVR: { name: "溫哥華 (YVR)", code: "YVR", coords: [-123.18, 49.19], offset: -7 },
  HNL: { name: "檀香山 (HNL)", code: "HNL", coords: [-157.92, 21.32], offset: -10 },
  AMS: { name: "阿姆斯特丹 (AMS)", code: "AMS", coords: [4.76, 52.31], offset: 2 },
  FCO: { name: "羅馬達文西 (FCO)", code: "FCO", coords: [12.24, 41.80], offset: 2 },
  IST: { name: "伊斯坦堡 (IST)", code: "IST", coords: [28.72, 41.26], offset: 3 },
  BKK: { name: "曼谷蘇凡納布 (BKK)", code: "BKK", coords: [100.75, 13.69], offset: 7 },
  ICN: { name: "首爾仁川 (ICN)", code: "ICN", coords: [126.45, 37.47], offset: 9 },
  GRU: { name: "聖保羅 (GRU)", code: "GRU", coords: [-46.47, -23.43], offset: -3 },
  DEL: { name: "新德里 (DEL)", code: "DEL", coords: [77.10, 28.57], offset: 5.5 },
  AKL: { name: "奧克蘭 (AKL)", code: "AKL", coords: [174.79, -37.01], offset: 12 },
  MEX: { name: "墨西哥城 (MEX)", code: "MEX", coords: [-99.07, 19.43], offset: -6 }
};

// --- STATE VARIABLES ---
let worldData = null;
let currentProjectionType = 'globe'; // 'flat' or 'globe'
let activeRoute = null;
let customRoute = null; // Used for user map-click route creation
let customOrigin = null;
let customDestination = null;

// Simulation Time and Speed
let baseRealTime = new Date(); // Actual wall-clock time at start/pause
let simDateTime = new Date();  // Current simulated Date/Time
let elapsedSimTime = 0;        // Simulated elapsed flight time (ms)
let speedMultiplier = 3600;    // 3600x (1 hour per second) by default
let isPlaying = true;
let lastFrameTime = performance.now();

// Map and Canvas
const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
let width = canvas.clientWidth;
let height = canvas.clientHeight;
let dpr = window.devicePixelRatio || 1;

// D3 Projections
let projection2D = d3.geoEquirectangular().precision(0.1);
let projection3D = d3.geoOrthographic().precision(0.1);
let projection = projection3D; // Active projection
let graticule = d3.geoGraticule();

// Interactive rotation (for Globe mode)
let globeRotation = [240, -20, 0]; // [longitude, latitude, roll]
let isCustomRouteActive = false;

// Tooltip
const tooltip = document.getElementById('tooltip');

// --- HELPER FUNCTIONS ---

// Returns Day of the Year
function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// Calculates the solar declination and subsolar longitude
function getSolarPosition(date) {
  const day = getDayOfYear(date);
  // Declination (simple approximation in radians)
  // Dec = 23.44 * sin(2*pi*(day - 80)/365)
  const decRad = 23.439 * Math.sin((360 / 365.25 * (day - 80)) * Math.PI / 180) * Math.PI / 180;

  // Equation of Time (to adjust subsolar longitude)
  const B = (360 * (day - 81) / 365) * Math.PI / 180;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // in minutes

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const solarTime = utcHours + eot / 60;
  let subsolarLon = (12 - solarTime) * 15; // 15 degrees per hour
  
  // Normalize to [-180, 180]
  subsolarLon = ((subsolarLon + 180) % 360 + 360) % 360 - 180;

  return {
    declination: decRad, // radians
    longitude: subsolarLon // degrees
  };
}

// Get timezone offset formatted time string
function getFormattedTime(date, offsetHours) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const localDate = new Date(utc + 3600000 * offsetHours);
  const hh = String(localDate.getHours()).padStart(2, '0');
  const mm = String(localDate.getMinutes()).padStart(2, '0');
  const ss = String(localDate.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Standard spherical bearing calculation
function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const λ1 = lon1 * Math.PI / 180;
  const λ2 = lon2 * Math.PI / 180;
  const Δλ = λ2 - λ1;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

// Great-circle distance between two points in km
function calculateDistance(lon1, lat1, lon2, lat2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Convert coordinates to friendly string
function formatCoords(lon, lat) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${latDir}, ${Math.abs(lon).toFixed(1)}°${lonDir}`;
}

// Draw stylized airplane pointing right
function drawAirplane(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  
  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 4;

  ctx.fillStyle = '#00f2fe';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  ctx.moveTo(12, 0); // nose
  ctx.lineTo(2, -3);
  ctx.lineTo(-4, -12); // wingtip left
  ctx.lineTo(-6, -12);
  ctx.lineTo(-4, -3);
  ctx.lineTo(-10, -2);
  ctx.lineTo(-14, -6); // tail Left
  ctx.lineTo(-15, -6);
  ctx.lineTo(-14, 0);
  ctx.lineTo(-15, 6); // tail Right
  ctx.lineTo(-14, 6);
  ctx.lineTo(-10, 2);
  ctx.lineTo(-4, 3);
  ctx.lineTo(-6, 12); // wingtip right
  ctx.lineTo(-4, 12);
  ctx.lineTo(2, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- INITIALIZATION ---

async function init() {
  // Setup HTML elements
  setupUIHandlers();
  setupCanvasResize();
  
  // Load World Map TopoJSON from local variable
  try {
    if (typeof worldDataJson !== 'undefined') {
      worldData = topojson.feature(worldDataJson, worldDataJson.objects.land);
    } else {
      console.error("worldDataJson is not defined. Map will be blank.");
    }
  } catch (err) {
    console.error("Failed to parse map data.", err);
  }

  // Setup initial route details
  handleDropdownRouteChange();

  // Set initial simulated datetime to current
  simDateTime = new Date();
  document.getElementById('date-picker').value = new Date(simDateTime.getTime() - simDateTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  // Setup dragging on canvas
  setupMapInteraction();

  // Start Animation loop
  requestAnimationFrame(updateLoop);
}

// Resize canvas properly for high-density screens
function resizeCanvas() {
  width = canvas.parentElement.clientWidth;
  height = canvas.parentElement.clientHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  
  // Update projections
  projection2D.translate([width / 2, height / 2]).scale(width / (2 * Math.PI));
  projection3D.translate([width / 2, height / 2]).scale(Math.min(width, height) * 0.45);
}

function setupCanvasResize() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

// --- SIMULATION LOGIC ---

function setRoute(routeObj) {
  activeRoute = routeObj;
  elapsedSimTime = 0;
  
  const oCity = CITIES[routeObj.origin] || { name: "自訂起點", code: "ORI", coords: routeObj.originCoords, offset: 8 };
  const dCity = CITIES[routeObj.destination] || { name: "自訂終點", code: "DST", coords: routeObj.destinationCoords, offset: -7 };

  // Update UI texts
  document.getElementById('origin-code').innerText = oCity.code;
  document.getElementById('dest-code').innerText = dCity.code;
  document.getElementById('lbl-origin').innerText = oCity.name.replace(/ \([A-Z]{3}\)/, '');
  document.getElementById('lbl-dest').innerText = dCity.name.replace(/ \([A-Z]{3}\)/, '');
  
  // Sync dropdown values
  const originSelect = document.getElementById('origin-select');
  const destSelect = document.getElementById('dest-select');

  if (originSelect && destSelect) {
    if (routeObj.origin === "ORI") {
      if (!originSelect.querySelector('option[value="ORI"]')) {
        const opt = document.createElement('option');
        opt.value = "ORI";
        opt.innerText = "📍 自訂起點 (地圖點擊)";
        originSelect.appendChild(opt);
      }
      originSelect.value = "ORI";
    } else {
      const opt = originSelect.querySelector('option[value="ORI"]');
      if (opt) opt.remove();
    }

    if (routeObj.destination === "DST") {
      if (!destSelect.querySelector('option[value="DST"]')) {
        const opt = document.createElement('option');
        opt.value = "DST";
        opt.innerText = "📍 自訂終點 (地圖點擊)";
        destSelect.appendChild(opt);
      }
      destSelect.value = "DST";
    } else {
      const opt = destSelect.querySelector('option[value="DST"]');
      if (opt) opt.remove();
    }
  }

  // Clock Labels
  document.getElementById('clock-origin-label').innerText = oCity.code;
  document.getElementById('clock-dest-label').innerText = dCity.code;
  document.getElementById('clock-origin-tz').innerText = `UTC${oCity.offset >= 0 ? '+' : ''}${oCity.offset}`;
  document.getElementById('clock-dest-tz').innerText = `UTC${dCity.offset >= 0 ? '+' : ''}${dCity.offset}`;

  // If in globe mode, center the globe rotation on the flight path midpoint
  if (currentProjectionType === 'globe') {
    const originCoords = oCity.coords;
    const destCoords = dCity.coords;
    const midLon = (originCoords[0] + destCoords[0]) / 2;
    const midLat = (originCoords[1] + destCoords[1]) / 2;
    globeRotation = [-midLon, -midLat, 0];
    projection3D.rotate(globeRotation);
  }
}

function updateLoop(timestamp) {
  const dt = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  // Advance simulation time
  if (isPlaying) {
    elapsedSimTime += dt * speedMultiplier;
    
    // Auto-restart or pause when flight ends
    if (elapsedSimTime >= activeRoute.duration) {
      elapsedSimTime = activeRoute.duration;
      isPlaying = false;
      document.getElementById('play-btn').innerHTML = '▶';
    }
  }

  // Calculate current date/time in the simulation
  const timeSlider = document.getElementById('time-slider');
  
  if (isPlaying) {
    // Sync slider with time
    const pct = (elapsedSimTime / activeRoute.duration) * 1000;
    timeSlider.value = pct;
  } else {
    // If not playing, time is controlled by slider
    const pct = parseFloat(timeSlider.value);
    elapsedSimTime = (pct / 1000) * activeRoute.duration;
  }

  // Update dates
  const pickVal = document.getElementById('date-picker').value;
  const pickedDate = new Date(pickVal);
  simDateTime = new Date(pickedDate.getTime() + elapsedSimTime);

  // Render Everything
  draw();

  // Update HUD text elements
  updateHUDReadouts();

  requestAnimationFrame(updateLoop);
}

// --- RENDER ENGINE ---

function draw() {
  ctx.clearRect(0, 0, width, height);

  // Set current projection
  projection = currentProjectionType === 'flat' ? projection2D : projection3D;
  const path = d3.geoPath(projection, ctx);

  // 1. Draw Globe ocean base / Space Background
  if (currentProjectionType === 'globe') {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, projection.scale(), 0, 2 * Math.PI);
    ctx.fillStyle = '#0a101e';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.stroke();
  }

  // 2. Draw Graticules (Gridlines)
  ctx.beginPath();
  path(graticule());
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.stroke();

  // 3. Draw World Landmasses
  if (worldData) {
    ctx.beginPath();
    path(worldData);
    ctx.fillStyle = '#1e293b'; // Slate gray land
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#334155'; // Darker gray borders
    ctx.stroke();
  }

  // 4. Draw Day/Night Terminator
  const solar = getSolarPosition(simDateTime);
  // Calculate antipode of subsolar point for night shadow center
  const antipodeLon = solar.longitude > 0 ? solar.longitude - 180 : solar.longitude + 180;
  const antipodeLat = -solar.declination * 180 / Math.PI;

  try {
    const nightCircle = d3.geoCircle()
      .center([antipodeLon, antipodeLat])
      .radius(90)();

    ctx.save();
    ctx.beginPath();
    path(nightCircle);
    // Draw night shadow (semi-transparent dark blue/black)
    ctx.fillStyle = 'rgba(3, 7, 18, 0.45)';
    ctx.fill();
    ctx.restore();
  } catch (e) {
    console.error("Error creating night circle path", e);
  }

  // Get active route coordinates
  const oCity = CITIES[activeRoute.origin] || { name: "Custom Origin", code: "ORI", coords: activeRoute.originCoords, offset: 8 };
  const dCity = CITIES[activeRoute.destination] || { name: "Custom Destination", code: "DST", coords: activeRoute.destinationCoords, offset: -7 };

  const pOrigin = oCity.coords;
  const pDest = dCity.coords;

  // 5. Draw Flight Route (Full Path - Great Circle Arc)
  const routeLine = {
    type: "LineString",
    coordinates: [pOrigin, pDest]
  };

  ctx.save();
  ctx.beginPath();
  path(routeLine);
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)'; // Neon cyan dashed line
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();

  // 6. Draw Flown Route (from origin to current airplane position)
  const progress = elapsedSimTime / activeRoute.duration;
  const interpolator = d3.geoInterpolate(pOrigin, pDest);
  const pPlane = interpolator(progress);

  const flownLine = {
    type: "LineString",
    coordinates: [pOrigin, pPlane]
  };

  ctx.save();
  ctx.beginPath();
  path(flownLine);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#00f2fe'; // Solid cyan
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();

  // 7. Draw Origin and Destination points
  ctx.save();
  [pOrigin, pDest].forEach((coords, i) => {
    const projPt = projection(coords);
    if (!projPt) return;

    // Check clipping for globe mode
    if (currentProjectionType === 'globe') {
      const gDistance = d3.geoDistance(projection.invert([width / 2, height / 2]), coords);
      if (gDistance > Math.PI / 2) return; // Point is on back of globe
    }

    ctx.beginPath();
    ctx.arc(projPt[0], projPt[1], i === 0 ? 5 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = i === 0 ? '#4facfe' : '#f59e0b'; // Origin blue, destination orange
    ctx.shadowColor = i === 0 ? '#4facfe' : '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Labels
    ctx.shadowBlur = 0;
    ctx.font = 'bold 10px Inter';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? oCity.code : dCity.code, projPt[0], projPt[1] - 10);
  });
  ctx.restore();

  // 8. Draw Airplane Icon
  const projPlane = projection(pPlane);
  let shouldDrawPlane = true;
  if (currentProjectionType === 'globe') {
    const gDistance = d3.geoDistance(projection.invert([width / 2, height / 2]), pPlane);
    if (gDistance > Math.PI / 2) shouldDrawPlane = false; // Plane is on back
  }

  if (projPlane && shouldDrawPlane) {
    // Calculate rotation angle based on projection tangent
    const pNext = interpolator(Math.min(1.0, progress + 0.002));
    const projPlaneNext = projection(pNext);
    
    let angle = 0;
    if (projPlaneNext) {
      angle = Math.atan2(projPlaneNext[1] - projPlane[1], projPlaneNext[0] - projPlane[0]);
    } else {
      // Fallback to spherical bearing
      angle = calculateBearing(pPlane[1], pPlane[0], pDest[1], pDest[0]) * Math.PI / 180;
    }

    drawAirplane(ctx, projPlane[0], projPlane[1], angle);
  }

  // 9. Draw Custom Route selection points
  if (isCustomRouteActive) {
    ctx.save();
    if (customOrigin) {
      const pt = projection(customOrigin);
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#10b981'; // Green for custom origin
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
      }
    }
    if (customDestination) {
      const pt = projection(customDestination);
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444'; // Red for custom destination
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// --- UPDATE HUD HUD READOUTS ---

function updateHUDReadouts() {
  const oCity = CITIES[activeRoute.origin] || { name: "Custom Origin", code: "ORI", coords: activeRoute.originCoords, offset: 8 };
  const dCity = CITIES[activeRoute.destination] || { name: "Custom Destination", code: "DST", coords: activeRoute.destinationCoords, offset: -7 };

  // 1. Clocks
  document.getElementById('clock-origin-time').innerText = getFormattedTime(simDateTime, oCity.offset);
  document.getElementById('clock-dest-time').innerText = getFormattedTime(simDateTime, dCity.offset);
  
  // Center plane clock (airplane timezone based on approximate longitude: 15deg = 1hour)
  const progress = elapsedSimTime / activeRoute.duration;
  const interpolator = d3.geoInterpolate(oCity.coords, dCity.coords);
  const pPlane = interpolator(progress);
  
  const planeOffset = Math.round(pPlane[0] / 15);
  document.getElementById('clock-plane-time').innerText = getFormattedTime(simDateTime, planeOffset);
  document.getElementById('clock-plane-tz').innerText = `UTC${planeOffset >= 0 ? '+' : ''}${planeOffset}`;

  // 2. Flight Progress bar
  const pct = progress * 100;
  document.getElementById('progress-bar-fill').style.width = `${pct}%`;

  // Time displays
  const elapsedMinutes = Math.floor(elapsedSimTime / (60 * 1000));
  const elapsedHH = String(Math.floor(elapsedMinutes / 60)).padStart(2, '0');
  const elapsedMM = String(elapsedMinutes % 60).padStart(2, '0');
  document.getElementById('time-elapsed').innerText = `${elapsedHH}:${elapsedMM}`;

  const remainingMinutes = Math.floor((activeRoute.duration - elapsedSimTime) / (60 * 1000));
  const remainingHH = String(Math.floor(remainingMinutes / 60)).padStart(2, '0');
  const remainingMM = String(remainingMinutes % 60).padStart(2, '0');
  document.getElementById('time-remaining').innerText = `${remainingHH}:${remainingMM}`;

  // 3. Telemetry parameters
  const totalDistance = calculateDistance(oCity.coords[0], oCity.coords[1], dCity.coords[0], dCity.coords[1]);
  const distanceTraveled = totalDistance * progress;
  const distanceRemaining = totalDistance - distanceTraveled;

  document.getElementById('tel-distance-traveled').innerText = Math.round(distanceTraveled).toLocaleString();
  document.getElementById('tel-distance-remaining').innerText = Math.round(distanceRemaining).toLocaleString();

  // Altitude simulation (in meters)
  // Starts at 0, goes to 11000, fluctuates a bit, goes to 0 at the end
  let altitude = 0;
  let groundSpeed = 0;
  let temperature = 15; // C
  let headwind = 0;

  const cruiseAlt = 11300; // Cruise altitude meters (~37,000 ft)
  const cruiseSpeed = 910; // Cruise speed km/h

  // Phase profiles based on progress (from 0 to 1)
  if (progress < 0.05) {
    // Takeoff & Climb (first 5% of flight)
    const p = progress / 0.05;
    altitude = Math.round(cruiseAlt * Math.sin(p * Math.PI / 2));
    groundSpeed = Math.round(250 + (cruiseSpeed - 250) * Math.sqrt(p));
    temperature = Math.round(25 - (25 - (-56)) * p);
  } else if (progress > 0.95) {
    // Descent & Landing (last 5% of flight)
    const p = (1.0 - progress) / 0.05;
    altitude = Math.round(cruiseAlt * Math.sin(p * Math.PI / 2));
    groundSpeed = Math.round(240 + (cruiseSpeed - 240) * p);
    temperature = Math.round(20 - (20 - (-56)) * p);
  } else {
    // Cruise phase
    // Add tiny altitude oscillations
    const osc = Math.sin(progress * 150) * 40;
    altitude = Math.round(cruiseAlt + osc);
    // Speed fluctuates slightly due to headwind/turbulence
    const speedOsc = Math.sin(progress * 300) * 15;
    groundSpeed = Math.round(cruiseSpeed + speedOsc);
    // Cruise temp stays cold
    temperature = Math.round(-56 + Math.sin(progress * 80) * 3);
  }

  // Tailwind / Headwind simulation
  // Depends on heading vs local prevailing wind (we randomize wind direction slightly)
  const prevailingWindDir = 270; // Westerly jet stream
  const planeHeading = calculateBearing(pPlane[1], pPlane[0], dCity.coords[1], dCity.coords[0]);
  const windAngleDiff = (prevailingWindDir - planeHeading) * Math.PI / 180;
  const windSpeed = 70 + Math.sin(progress * 50) * 30; // 40-100 km/h wind
  headwind = Math.round(windSpeed * Math.cos(windAngleDiff));

  // Update UI values
  document.getElementById('tel-altitude').innerText = altitude.toLocaleString();
  document.getElementById('tel-speed').innerText = groundSpeed;
  document.getElementById('tel-temp').innerText = temperature;
  
  const windLabel = document.getElementById('tel-wind');
  if (headwind >= 0) {
    windLabel.innerText = `Head ${headwind}`;
    windLabel.style.color = '#f8fafc';
  } else {
    windLabel.innerText = `Tail ${Math.abs(headwind)}`;
    windLabel.style.color = 'var(--accent-cyan)';
  }

  // Estimated Arrival time (ETA)
  const etaTime = new Date(simDateTime.getTime() + (activeRoute.duration - elapsedSimTime));
  document.getElementById('tel-eta').innerText = getFormattedTime(etaTime, dCity.offset);

  // Position
  document.getElementById('tel-coords').innerText = formatCoords(pPlane[0], pPlane[1]);
}

// --- USER INTERACTION HANDLERS ---

function setupUIHandlers() {
  // Projection switchers
  document.getElementById('btn-proj-flat').addEventListener('click', () => {
    currentProjectionType = 'flat';
    document.getElementById('btn-proj-flat').classList.add('active');
    document.getElementById('btn-proj-globe').classList.remove('active');
    projection = projection2D;
    
    // Reset rotations for flat map to standard
    projection2D.rotate([0, 0, 0]);
    draw();
  });

  document.getElementById('btn-proj-globe').addEventListener('click', () => {
    currentProjectionType = 'globe';
    document.getElementById('btn-proj-flat').classList.remove('active');
    document.getElementById('btn-proj-globe').classList.add('active');
    projection = projection3D;
    
    // Restore globe rotation
    projection3D.rotate(globeRotation);
    draw();
  });

  // Play / Pause Button
  const playBtn = document.getElementById('play-btn');
  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playBtn.innerHTML = isPlaying ? '⏸' : '▶';
  });

  // Speed Multiplier Buttons
  const speedBtns = document.querySelectorAll('.speed-btn');
  speedBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      speedMultiplier = parseInt(btn.getAttribute('data-speed'));
    });
  });

  // Populate Origin and Destination dropdowns
  const originSelect = document.getElementById('origin-select');
  const destSelect = document.getElementById('dest-select');

  if (originSelect && destSelect) {
    originSelect.innerHTML = '';
    destSelect.innerHTML = '';

    // Sort cities alphabetically by name
    const sortedKeys = Object.keys(CITIES).sort((a, b) => CITIES[a].name.localeCompare(CITIES[b].name, 'zh-TW'));

    sortedKeys.forEach(code => {
      const city = CITIES[code];
      
      const optOrigin = document.createElement('option');
      optOrigin.value = code;
      optOrigin.innerText = city.name;
      originSelect.appendChild(optOrigin);

      const optDest = document.createElement('option');
      optDest.value = code;
      optDest.innerText = city.name;
      destSelect.appendChild(optDest);
    });

    // Set initial selected values
    originSelect.value = "TPE";
    destSelect.value = "LAX";

    originSelect.addEventListener('change', handleDropdownRouteChange);
    destSelect.addEventListener('change', handleDropdownRouteChange);
  }

  // Date / Time picker sync
  document.getElementById('date-picker').addEventListener('change', () => {
    // Sync slider back to 0 so we begin flight at the picked date
    document.getElementById('time-slider').value = 0;
    elapsedSimTime = 0;
  });

  // Restart Flight Button
  document.getElementById('btn-restart').addEventListener('click', () => {
    elapsedSimTime = 0;
    document.getElementById('time-slider').value = 0;
    isPlaying = true;
    document.getElementById('play-btn').innerHTML = '⏸';
  });

  // Custom route setup
  const btnCustom = document.getElementById('btn-custom-route');
  btnCustom.addEventListener('click', () => {
    if (!isCustomRouteActive) {
      enterCustomRouteMode();
    } else {
      exitCustomRouteMode();
    }
  });
}

function enterCustomRouteMode() {
  isCustomRouteActive = true;
  customOrigin = null;
  customDestination = null;
  document.getElementById('btn-custom-route').innerText = "Cancel Custom";
  document.getElementById('btn-custom-route').classList.add('btn-secondary');
  document.getElementById('custom-banner').style.display = 'flex';
  document.getElementById('custom-banner-text').innerText = "Click on the map to set Origin Point.";
}

function exitCustomRouteMode() {
  isCustomRouteActive = false;
  customOrigin = null;
  customDestination = null;
  document.getElementById('btn-custom-route').innerText = "Custom Route";
  document.getElementById('btn-custom-route').classList.remove('btn-secondary');
  document.getElementById('custom-banner').style.display = 'none';
}

// Map Click & Drag interaction
function setupMapInteraction() {
  // Dragging logic
  d3.select(canvas).call(d3.drag()
    .on("start", (event) => {
      // Hide tooltip during drag
      tooltip.style.display = 'none';
    })
    .on("drag", (event) => {
      if (currentProjectionType === 'globe') {
        const k = 75 / projection.scale();
        globeRotation[0] += event.dx * k;
        globeRotation[1] -= event.dy * k;
        // Keep latitude rotation bounded so it doesn't flip upside down
        globeRotation[1] = Math.max(-80, Math.min(80, globeRotation[1]));
        
        projection3D.rotate(globeRotation);
      } else {
        // Flat map dragging (panning)
        const k = 360 / (width * projection2D.scale() / (width / (2 * Math.PI)));
        const rotate = projection2D.rotate();
        projection2D.rotate([rotate[0] + event.dx * k, rotate[1] - event.dy * k, 0]);
      }
      draw();
    })
  );

  // Click handling (for tooltips and custom routes)
  canvas.addEventListener('click', (event) => {
    // Get mouse coords
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert mouse to geo coords
    const geoCoords = projection.invert([mouseX, mouseY]);
    if (!geoCoords) return;

    // Check clipping for globe mode
    if (currentProjectionType === 'globe') {
      const gDistance = d3.geoDistance(projection.invert([width / 2, height / 2]), geoCoords);
      if (gDistance > Math.PI / 2) return; // Ignore clicks on back of globe
    }

    if (isCustomRouteActive) {
      handleCustomRouteClick(geoCoords);
    } else {
      handleMapTooltip(mouseX, mouseY, geoCoords, event);
    }
  });

  // Mouse move to show coordinates in status bar
  canvas.addEventListener('mousemove', (event) => {
    if (isCustomRouteActive) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const geoCoords = projection.invert([mouseX, mouseY]);
    
    if (geoCoords) {
      if (currentProjectionType === 'globe') {
        const gDistance = d3.geoDistance(projection.invert([width / 2, height / 2]), geoCoords);
        if (gDistance > Math.PI / 2) return;
      }
      // Draw standard hover feedback (optional - can be coordinate tooltip)
    }
  });
}

function handleCustomRouteClick(coords) {
  if (!customOrigin) {
    customOrigin = coords;
    document.getElementById('custom-banner-text').innerText = "Origin set! Now click to set Destination Point.";
    draw();
  } else if (!customDestination) {
    customDestination = coords;
    
    // We now have both!
    // Setup the custom flight path
    const distanceKm = calculateDistance(customOrigin[0], customOrigin[1], customDestination[0], customDestination[1]);
    
    // Estimate flight duration based on 850 km/h avg speed
    const durationMs = (distanceKm / 850) * 3600 * 1000;
    
    // Add custom route to simulation
    customRoute = {
      origin: "ORI",
      destination: "DST",
      originCoords: customOrigin,
      destinationCoords: customDestination,
      duration: durationMs,
      name: `Custom Route (${Math.round(distanceKm)} km)`
    };

    // Temporarily replace preset route
    setRoute(customRoute);
    
    // Exit custom mode selection
    isCustomRouteActive = false;
    document.getElementById('btn-custom-route').innerText = "Custom Route";
    document.getElementById('btn-custom-route').classList.remove('btn-secondary');
    document.getElementById('custom-banner').style.display = 'none';
    
    // Trigger reset timeline
    elapsedSimTime = 0;
    document.getElementById('time-slider').value = 0;
    isPlaying = true;
    document.getElementById('play-btn').innerHTML = '⏸';
    draw();
  }
}

function handleMapTooltip(mouseX, mouseY, geoCoords, event) {
  // Check if click was near any city
  let nearestCity = null;
  let minDist = 15; // Max click radius in pixels

  for (const code in CITIES) {
    const city = CITIES[code];
    const pt = projection(city.coords);
    if (!pt) continue;

    // Distance on screen
    const dx = pt[0] - mouseX;
    const dy = pt[1] - mouseY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist < minDist) {
      minDist = dist;
      nearestCity = city;
    }
  }

  if (nearestCity) {
    // Show city info in tooltip
    const cityTime = getFormattedTime(simDateTime, nearestCity.offset);
    tooltip.innerHTML = `
      <strong style="color:var(--accent-cyan); font-size:12px">${nearestCity.name} (${nearestCity.code})</strong><br/>
      Time: <strong>${cityTime}</strong><br/>
      Coords: ${formatCoords(nearestCity.coords[0], nearestCity.coords[1])}<br/>
      Timezone: UTC${nearestCity.offset >= 0 ? '+' : ''}${nearestCity.offset}
    `;
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY - 20}px`;
    tooltip.style.display = 'block';

    // Hide after 4 seconds
    setTimeout(() => {
      tooltip.style.display = 'none';
    }, 4000);
  } else {
    tooltip.style.display = 'none';
  }
}

function handleDropdownRouteChange() {
  const originSelect = document.getElementById('origin-select');
  const destSelect = document.getElementById('dest-select');
  if (!originSelect || !destSelect) return;

  exitCustomRouteMode();

  const originCode = originSelect.value;
  const destCode = destSelect.value;

  // Find sorted keys for fallback
  const sortedKeys = Object.keys(CITIES).sort((a, b) => CITIES[a].name.localeCompare(CITIES[b].name, 'zh-TW'));

  if (originCode === destCode) {
    const nextIndex = (sortedKeys.indexOf(originCode) + 1) % sortedKeys.length;
    destSelect.value = sortedKeys[nextIndex];
    handleDropdownRouteChange();
    return;
  }

  const oCity = CITIES[originCode];
  const dCity = CITIES[destCode];

  const dist = calculateDistance(oCity.coords[0], oCity.coords[1], dCity.coords[0], dCity.coords[1]);
  // Estimate duration: 850 km/h average cruise + 40 mins takeoff/landing buffer
  const durationMs = (dist / 850) * 3600 * 1000 + 40 * 60 * 1000;

  const newRoute = {
    origin: originCode,
    destination: destCode,
    duration: durationMs,
    name: `${oCity.name} ➔ ${dCity.name}`
  };

  setRoute(newRoute);
  
  elapsedSimTime = 0;
  document.getElementById('time-slider').value = 0;
  isPlaying = true;
  document.getElementById('play-btn').innerHTML = '⏸';
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);
