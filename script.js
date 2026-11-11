const DEFAULT_CITY = 'Jaipur';
const SETTINGS_KEY = 'weatherly-settings';
const FAVORITES_KEY = 'weatherly-favorite-cities';
const API_BASE = 'https://api.openweathermap.org/data/2.5';

const form = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const searchButton = document.getElementById('search-button');
const locationButton = document.getElementById('location-button');
const statusMessage = document.getElementById('status');
const errorMessage = document.getElementById('error-message');
const weatherContent = document.getElementById('weather-content');
const currentCard = document.getElementById('current-card');
const forecastGrid = document.getElementById('forecast-grid');
const unitButtons = document.querySelectorAll('.unit-button');
const favoriteCities = document.getElementById('favorite-cities');

let settings = { city: DEFAULT_CITY, units: 'metric' };
let favorites = [];
let currentCity = '';

// Choose a background theme from OpenWeatherMap's current condition and icon suffix.
function getThemeFromWeather(weather) {
  const condition = String(weather?.weather?.[0]?.main || '').toLowerCase();
  const icon = String(weather?.weather?.[0]?.icon || '').toLowerCase();
  const isNight = icon.endsWith('n');
  if (condition === 'clear') return isNight ? 'clear-night' : 'clear-day';
  if (condition === 'clouds') return 'clouds';
  if (condition === 'rain' || condition === 'drizzle') return 'rain';
  if (condition === 'thunderstorm') return 'thunderstorm';
  if (condition === 'snow') return 'snow';
  if (['mist', 'haze', 'fog', 'smoke', 'dust', 'sand'].includes(condition)) return 'mist';
  return 'default';
}

// Apply the selected weather theme to the page background.
function applyTheme(weather) {
  const themes = ['default', 'clear-day', 'clear-night', 'clouds', 'rain', 'thunderstorm', 'snow', 'mist'];
  document.body.classList.remove(...themes.map((theme) => `theme-${theme}`));
  document.body.classList.add(`theme-${getThemeFromWeather(weather)}`);
}

// Read the saved city list, treating malformed or unavailable storage as empty.
function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    if (!Array.isArray(saved)) return [];
    const unique = new Map();
    saved.forEach((city) => {
      if (typeof city === 'string' && city.trim() && !unique.has(city.trim().toLocaleLowerCase())) {
        unique.set(city.trim().toLocaleLowerCase(), city.trim());
      }
    });
    return [...unique.values()];
  } catch (error) {
    return [];
  }
}

// Persist the current saved city list while keeping storage failures harmless.
function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (error) {
    // The feature remains usable for this page session if storage is unavailable.
  }
}

// Draw the saved cities as accessible buttons and wire their load and remove actions.
function renderFavorites() {
  favoriteCities.replaceChildren();
  favorites.forEach((city) => {
    const chip = makeElement('span', 'favorite-chip');
    const loadButton = makeElement('button', 'favorite-city-button', city);
    loadButton.type = 'button';
    loadButton.setAttribute('aria-label', `Load weather for ${city}`);
    loadButton.addEventListener('click', () => loadCity(city));
    const removeButton = makeElement('button', 'favorite-remove', '×');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${city} from saved cities`);
    removeButton.addEventListener('click', () => removeFavorite(city));
    chip.append(loadButton, removeButton);
    favoriteCities.append(chip);
  });
}

// Update the city heart button to reflect whether the current city is saved.
function updateFavoriteButton() {
  const button = currentCard.querySelector('.favorite-toggle');
  if (!button) return;
  const saved = favorites.some((city) => city.toLocaleLowerCase() === currentCity.toLocaleLowerCase());
  button.classList.toggle('is-saved', saved);
  button.textContent = saved ? '♥' : '♡';
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute('aria-label', saved ? 'Remove city from saved cities' : 'Save city');
}

// Add or remove the currently displayed city and refresh the saved city controls.
function toggleFavorite() {
  if (!currentCity) return;
  const existing = favorites.find((city) => city.toLocaleLowerCase() === currentCity.toLocaleLowerCase());
  if (existing) favorites = favorites.filter((city) => city.toLocaleLowerCase() !== currentCity.toLocaleLowerCase());
  else favorites.push(currentCity);
  saveFavorites();
  renderFavorites();
  updateFavoriteButton();
}

// Remove one saved city without changing the currently displayed weather.
function removeFavorite(city) {
  favorites = favorites.filter((saved) => saved.toLocaleLowerCase() !== city.toLocaleLowerCase());
  saveFavorites();
  renderFavorites();
  updateFavoriteButton();
}

// Load saved preferences safely, using defaults if storage is unavailable or invalid.
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && typeof saved === 'object') {
      if (typeof saved.city === 'string' && saved.city.trim()) settings.city = saved.city.trim();
      if (saved.units === 'metric' || saved.units === 'imperial') settings.units = saved.units;
    }
  } catch (error) {
    settings = { city: DEFAULT_CITY, units: 'metric' };
  }
  return settings;
}

// Save the current city and unit preference without disrupting the dashboard if storage fails.
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // Storage can be disabled by the browser; the current session still works.
  }
}

// Build the API URL with an encoded city and the required units and key parameters.
function buildUrl(endpoint, city, units) {
  const query = new URLSearchParams({ q: city, units, appid: API_KEY });
  return `${API_BASE}/${endpoint}?${query.toString()}`;
}

// Build an OpenWeatherMap URL from coordinates with the same units and API key as city search.
function buildCoordinatesUrl(endpoint, latitude, longitude, units) {
  const query = new URLSearchParams({ lat: latitude, lon: longitude, units, appid: API_KEY });
  return `${API_BASE}/${endpoint}?${query.toString()}`;
}

// Fetch one OpenWeatherMap endpoint and report an HTTP error before attempting JSON parsing.
async function fetchWeatherData(endpoint, city, units) {
  const response = await fetch(buildUrl(endpoint, city, units));
  if (!response.ok) {
    const error = new Error(`Weather request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Fetch an OpenWeatherMap endpoint by latitude and longitude and report HTTP failures consistently.
async function fetchWeatherAtCoordinates(endpoint, latitude, longitude, units) {
  const response = await fetch(buildCoordinatesUrl(endpoint, latitude, longitude, units));
  if (!response.ok) {
    const error = new Error(`Weather request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Retrieve the current weather for a city.
async function getWeather(city, units) {
  return fetchWeatherData('weather', city, units);
}

// Retrieve the five-day, three-hour forecast for a city.
async function getForecast(city, units) {
  return fetchWeatherData('forecast', city, units);
}

// Select one forecast near noon for each date and collect that date's temperature range.
function pickDailyForecast(forecastList) {
  const days = new Map();
  forecastList.forEach((entry) => {
    const date = entry.dt_txt.slice(0, 10);
    if (!days.has(date)) days.set(date, { entries: [], min: Infinity, max: -Infinity });
    const day = days.get(date);
    day.entries.push(entry);
    day.min = Math.min(day.min, entry.main.temp_min);
    day.max = Math.max(day.max, entry.main.temp_max);
  });
  return [...days.entries()].slice(0, 5).map(([date, day]) => {
    const midday = day.entries.reduce((closest, entry) => {
      const hour = Number(entry.dt_txt.slice(11, 13));
      const closestHour = Number(closest.dt_txt.slice(11, 13));
      return Math.abs(hour - 12) < Math.abs(closestHour - 12) ? entry : closest;
    });
    return { date, entry: midday, min: day.min, max: day.max };
  });
}

// Create a DOM element with text content and optional class without parsing HTML.
function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Return a formatted date using the browser's locale.
function formatDate(date, options) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

// Format a Unix timestamp using the city's UTC offset rather than the viewer's timezone.
function formatCityTime(timestamp, timezoneOffset) {
  const cityDate = new Date((timestamp + timezoneOffset) * 1000);
  return `${String(cityDate.getUTCHours()).padStart(2, '0')}:${String(cityDate.getUTCMinutes()).padStart(2, '0')}`;
}

// Add a labeled weather detail to the current conditions card.
function addDetail(container, icon, label, value) {
  const item = makeElement('div', 'detail');
  item.append(makeElement('span', 'detail-icon', icon));
  const copy = makeElement('div', '');
  copy.append(makeElement('span', 'detail-label', label), makeElement('span', 'detail-value', value));
  item.append(copy);
  container.append(item);
}

// Render current conditions, including local sunrise and sunset times for the city's timezone.
function renderCurrent(data) {
  applyTheme(data);
  currentCard.replaceChildren();
  const top = makeElement('div', 'location-line');
  const location = makeElement('div', '');
  const place = [data.name, data.sys.country].filter(Boolean).join(', ');
  currentCity = data.name;
  location.append(makeElement('h2', 'location-name', place));
  location.append(makeElement('p', 'location-date', formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })));
  top.append(location);
  const favoriteButton = makeElement('button', 'favorite-toggle', '♡');
  favoriteButton.type = 'button';
  favoriteButton.addEventListener('click', toggleFavorite);
  top.append(favoriteButton);
  currentCard.append(top);
  updateFavoriteButton();

  const main = makeElement('div', 'weather-main');
  const icon = document.createElement('img');
  icon.src = `https://openweathermap.org/img/wn/${encodeURIComponent(data.weather[0].icon)}@2x.png`;
  icon.alt = data.weather[0].description;
  main.append(icon);
  const summary = makeElement('div', '');
  summary.append(makeElement('div', 'temperature', `${Math.round(data.main.temp)}°`));
  summary.append(makeElement('p', 'description', data.weather[0].description));
  summary.append(makeElement('p', 'feels-like', `Feels like ${Math.round(data.main.feels_like)}°`));
  main.append(summary);
  currentCard.append(main);

  const details = makeElement('div', 'details-grid');
  const windUnit = settings.units === 'metric' ? 'm/s' : 'mph';
  addDetail(details, '◌', 'Humidity', `${data.main.humidity}%`);
  addDetail(details, '↗', 'Wind', `${data.wind.speed} ${windUnit}`);
  addDetail(details, '↑', 'Sunrise', formatCityTime(data.sys.sunrise, data.timezone));
  addDetail(details, '↓', 'Sunset', formatCityTime(data.sys.sunset, data.timezone));
  currentCard.append(details);
}

// Render the five selected daily forecasts with weekday names, icons, and low/high temperatures.
function renderForecast(dailyForecast) {
  forecastGrid.replaceChildren();
  dailyForecast.forEach((day) => {
    const card = makeElement('article', 'forecast-card');
    const dayDate = new Date(`${day.date}T12:00:00`);
    card.append(makeElement('div', 'forecast-day', formatDate(dayDate, { weekday: 'short' })));
    const icon = document.createElement('img');
    icon.src = `https://openweathermap.org/img/wn/${encodeURIComponent(day.entry.weather[0].icon)}@2x.png`;
    icon.alt = day.entry.weather[0].description;
    card.append(icon);
    card.append(makeElement('div', 'forecast-description', day.entry.weather[0].description));
    const temps = makeElement('div', 'forecast-temperatures');
    temps.append(makeElement('span', 'forecast-high', `${Math.round(day.max)}°`));
    temps.append(makeElement('span', 'forecast-low', `${Math.round(day.min)}°`));
    card.append(temps);
    forecastGrid.append(card);
  });
}

// Display a clear message for API, city, rate limit, and network failures.
function showError(error) {
  let message = 'Something went wrong while loading weather. Please try again.';
  if (error.status === 404) message = 'We couldn’t find that city. Check the spelling and try again.';
  else if (error.status === 401) message = 'The API key is invalid or not active. Check config.js and try again.';
  else if (error.status === 429) message = 'The weather service is receiving too many requests. Please wait a moment and try again.';
  else if (error instanceof TypeError) message = 'Could not connect to the weather service. Check your internet connection and try again.';
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

// Set the request state and keep the search control in sync.
function setLoading(isLoading, city) {
  searchButton.disabled = isLoading;
  locationButton.disabled = isLoading;
  searchButton.textContent = isLoading ? 'Loading…' : 'Search →';
  statusMessage.textContent = isLoading ? `Getting weather for ${city}…` : '';
  weatherContent.setAttribute('aria-busy', String(isLoading));
}

// Resolve the browser's current position, with a ten-second timeout and clear geolocation errors.
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
  });
}

// Load current conditions and forecast for the user's coordinates, then save the API's city name.
async function loadLocation() {
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  setLoading(true, 'your location');
  try {
    if (typeof API_KEY !== 'string' || !API_KEY.trim() || API_KEY === 'PASTE_KEY_HERE') {
      const error = new Error('API key is not configured');
      error.status = 401;
      throw error;
    }
    if (!('geolocation' in navigator)) {
      errorMessage.textContent = 'This browser does not support location services.';
      errorMessage.hidden = false;
      return;
    }
    const position = await getCurrentPosition();
    const { latitude, longitude } = position.coords;
    const [current, forecast] = await Promise.all([
      fetchWeatherAtCoordinates('weather', latitude, longitude, settings.units),
      fetchWeatherAtCoordinates('forecast', latitude, longitude, settings.units)
    ]);
    renderCurrent(current);
    renderForecast(pickDailyForecast(forecast.list));
    settings.city = current.name;
    cityInput.value = current.name;
    saveSettings();
  } catch (error) {
    if (error.code === 1) errorMessage.textContent = 'Location permission was denied. Allow location access and try again.';
    else if (error.code === 2) errorMessage.textContent = 'Your location is unavailable. Check your device location settings and try again.';
    else if (error.code === 3) errorMessage.textContent = 'Getting your location timed out. Please try again.';
    else {
      showError(error);
      return;
    }
    errorMessage.hidden = false;
  } finally {
    setLoading(false, 'your location');
  }
}

// Request current conditions and forecast together, then update and save the dashboard state.
async function loadCity(city) {
  const trimmedCity = city.trim();
  if (!trimmedCity) return;
  errorMessage.hidden = true;
  errorMessage.textContent = '';
  setLoading(true, trimmedCity);
  try {
    if (typeof API_KEY !== 'string' || !API_KEY.trim() || API_KEY === 'PASTE_KEY_HERE') {
      const error = new Error('API key is not configured');
      error.status = 401;
      throw error;
    }
    const [current, forecast] = await Promise.all([getWeather(trimmedCity, settings.units), getForecast(trimmedCity, settings.units)]);
    renderCurrent(current);
    renderForecast(pickDailyForecast(forecast.list));
    settings.city = trimmedCity;
    cityInput.value = trimmedCity;
    saveSettings();
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false, trimmedCity);
  }
}

// Update the selected temperature unit and submit a fresh request for the current city.
function selectUnits(units) {
  if (settings.units === units) return;
  settings.units = units;
  unitButtons.forEach((button) => {
    const active = button.dataset.unit === units;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  saveSettings();
  loadCity(settings.city);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (city) loadCity(city);
});

locationButton.addEventListener('click', loadLocation);

unitButtons.forEach((button) => button.addEventListener('click', () => selectUnits(button.dataset.unit)));

loadSettings();
favorites = loadFavorites();
renderFavorites();
cityInput.value = settings.city;
unitButtons.forEach((button) => {
  const active = button.dataset.unit === settings.units;
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', String(active));
});
loadCity(settings.city);
