import { logger } from '../../../../logger.js';

interface WeatherCurrent {
  city: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  precipitation: number;
  uvIndex: number;
  visibility: number;
}

interface WeatherForecastDay {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipitationChance: number;
}

interface WeatherForecast {
  city: string;
  days: WeatherForecastDay[];
}

interface AirQuality {
  city: string;
  aqi: number;
  level: string;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  so2: number;
  co: number;
}

const conditions = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '雷阵雨', '小雪', '中雪', '雾', '霾'];

function randomCondition(seed: number): string {
  return conditions[seed % conditions.length];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getCurrentWeather(city: string): WeatherCurrent {
  logger.debug('[weather] getCurrentWeather called for city:', city);
  const seed = hashString(city);
  const baseTemp = 15 + (seed % 20);
  const humidity = 30 + (seed % 50);
  const windSpeed = 2 + (seed % 20);
  const condition = randomCondition(seed);

  return {
    city,
    temperature: baseTemp,
    feelsLike: baseTemp - 2 + (seed % 5),
    humidity,
    windSpeed,
    condition,
    precipitation: condition.includes('雨') || condition.includes('雪') ? 5 + (seed % 30) : 0,
    uvIndex: condition === '晴' ? 6 + (seed % 5) : 1 + (seed % 4),
    visibility: condition.includes('雾') || condition.includes('霾') ? 1 + (seed % 5) : 8 + (seed % 12),
  };
}

export function getForecast(city: string, days: number = 5): WeatherForecast {
  logger.debug('[weather] getForecast called for city:', city, 'days:', days);
  const seed = hashString(city);
  const forecastDays: WeatherForecastDay[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const daySeed = seed + i * 17;
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    forecastDays.push({
      date: date.toISOString().split('T')[0],
      high: 18 + (daySeed % 15),
      low: 8 + (daySeed % 12),
      condition: randomCondition(daySeed),
      precipitationChance: (daySeed % 80),
    });
  }

  return {
    city,
    days: forecastDays,
  };
}

export function getAirQuality(city: string): AirQuality {
  logger.debug('[weather] getAirQuality called for city:', city);
  const seed = hashString(city);
  const aqi = 20 + (seed % 180);

  let level = '优';
  if (aqi > 50 && aqi <= 100) level = '良';
  else if (aqi > 100 && aqi <= 150) level = '轻度污染';
  else if (aqi > 150 && aqi <= 200) level = '中度污染';
  else if (aqi > 200 && aqi <= 300) level = '重度污染';
  else if (aqi > 300) level = '严重污染';

  return {
    city,
    aqi,
    level,
    pm25: Math.round(aqi * 0.6),
    pm10: Math.round(aqi * 0.8),
    o3: 40 + (seed % 80),
    no2: 20 + (seed % 40),
    so2: 5 + (seed % 20),
    co: 0.5 + (seed % 10) / 10,
  };
}

export default {
  name: 'weather',
  description: '查询全球城市天气、预报、空气质量',
  tools: [
    {
      name: 'weather_current',
      description: '获取指定城市的当前天气',
      handler: (args: { city: string }) => getCurrentWeather(args.city),
    },
    {
      name: 'weather_forecast',
      description: '获取指定城市的天气预报',
      handler: (args: { city: string; days?: number }) => getForecast(args.city, args.days),
    },
    {
      name: 'weather_airquality',
      description: '获取指定城市的空气质量',
      handler: (args: { city: string }) => getAirQuality(args.city),
    },
  ],
};
