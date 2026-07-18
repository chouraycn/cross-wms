import type { ParsedTime, TimeParserOptions } from "./types.js";

export function parseTime(input: string | number | Date, options: TimeParserOptions = {}): ParsedTime {
  const { timeZone, strict = false } = options;
  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === "number") {
    date = new Date(input);
  } else if (typeof input === "string") {
    const trimmed = input.trim();

    if (trimmed.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/)) {
      date = new Date(trimmed);
    } else if (trimmed.match(/^\d{4}-\d{2}-\d{2}/)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      date = new Date(year, month - 1, day);
    } else if (trimmed.match(/^\d{2}:\d{2}(:\d{2})?/)) {
      const now = new Date();
      const [hour, minute, second] = trimmed.split(":").map(Number);
      date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, second || 0);
    } else if (!isNaN(Number(trimmed))) {
      date = new Date(parseInt(trimmed, 10));
    } else {
      date = new Date(trimmed);
    }
  } else {
    date = new Date(NaN);
  }

  if (isNaN(date.getTime())) {
    return {
      year: 0,
      month: 0,
      day: 0,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      isValid: false,
    };
  }

  let year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number;

  if (timeZone === "utc") {
    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
    hour = date.getUTCHours();
    minute = date.getUTCMinutes();
    second = date.getUTCSeconds();
    millisecond = date.getUTCMilliseconds();
  } else {
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
    hour = date.getHours();
    minute = date.getMinutes();
    second = date.getSeconds();
    millisecond = date.getMilliseconds();
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    timeZone,
    isValid: true,
  };
}

export function parseIso8601(input: string): ParsedTime {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) {
    return {
      year: 0,
      month: 0,
      day: 0,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      isValid: false,
    };
  }

  const [, year, month, day, hour, minute, second, ms, tz] = match;

  return {
    year: parseInt(year, 10),
    month: parseInt(month, 10),
    day: parseInt(day, 10),
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    second: parseInt(second, 10),
    millisecond: ms ? parseInt(ms.slice(1), 10) : 0,
    timeZone: tz || "utc",
    isValid: true,
  };
}

export function parseUnixTimestamp(input: string | number): ParsedTime {
  const timestamp = typeof input === "string" ? parseInt(input, 10) : input;
  const date = new Date(timestamp * 1000);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    millisecond: date.getUTCMilliseconds(),
    timeZone: "utc",
    isValid: !isNaN(date.getTime()),
  };
}

export function isValidDate(input: string | number | Date): boolean {
  const parsed = parseTime(input);
  return parsed.isValid;
}

export function toDate(input: string | number | Date): Date | null {
  if (input instanceof Date) {
    return input;
  }

  if (typeof input === "number") {
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date;
  }

  const trimmed = input.trim();

  if (!isNaN(Number(trimmed))) {
    const timestamp = parseInt(trimmed, 10);
    const date = new Date(timestamp.toString().length > 12 ? timestamp : timestamp * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
}