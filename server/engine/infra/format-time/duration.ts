import type { DurationFormatOptions } from "./types.js";

export function formatDuration(milliseconds: number, options: DurationFormatOptions = {}): string {
  const { style = "long", units, maxUnits = 3 } = options;

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const allUnits: { value: number; unit: string; short: string; narrow: string }[] = [
    { value: years, unit: "year", short: "yr", narrow: "y" },
    { value: months, unit: "month", short: "mo", narrow: "m" },
    { value: weeks, unit: "week", short: "wk", narrow: "w" },
    { value: days, unit: "day", short: "d", narrow: "d" },
    { value: hours, unit: "hour", short: "hr", narrow: "h" },
    { value: minutes, unit: "minute", short: "min", narrow: "m" },
    { value: seconds % 60, unit: "second", short: "sec", narrow: "s" },
  ];

  let filteredUnits = allUnits.filter((u) => u.value > 0);

  if (units) {
    const allowedUnits = new Set(units);
    filteredUnits = filteredUnits.filter((u) => allowedUnits.has(u.unit as "year" | "month" | "day" | "hour" | "minute" | "second"));
  }

  filteredUnits = filteredUnits.slice(0, maxUnits);

  if (filteredUnits.length === 0) {
    return style === "narrow" ? "0s" : style === "short" ? "0 sec" : "0 seconds";
  }

  const parts: string[] = [];

  for (const u of filteredUnits) {
    const suffix = style === "narrow" ? u.narrow : style === "short" ? u.short : u.unit;
    const plural = u.value !== 1 && style !== "narrow";
    parts.push(`${u.value}${suffix}${plural && style !== "short" ? "s" : ""}`);
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return parts.join(style === "narrow" ? "" : " ");
  }

  const last = parts.pop();
  return `${parts.join(style === "narrow" ? "" : ", ")}${style === "narrow" ? "" : " and "}${last}`;
}

export function formatDurationCompact(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  if (minutes > 0) {
    return `${minutes}:${pad(seconds)}`;
  }
  return `${seconds}s`;
}

export function parseDuration(input: string): number {
  const match = input.match(/^(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?|s|m|h|d|w|y)$/i);
  if (!match) {
    return 0;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    second: 1000,
    seconds: 1000,
    s: 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    m: 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 1000);
}

export function getDurationParts(milliseconds: number): {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  return {
    years,
    months: months % 12,
    days: days % 30,
    hours: hours % 24,
    minutes: minutes % 60,
    seconds: seconds % 60,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}