import type { TimeFormat, DateFormat, TimeZone, FormatterOptions, ParsedTime } from "./types.js";
import { parseTime } from "./parser.js";

export function formatTime(date: Date | string | number, format: TimeFormat = "iso", timeZone: TimeZone = "local"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return "";
  }

  switch (format) {
    case "iso":
      return d.toISOString();

    case "iso-date":
      if (timeZone === "utc") {
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    case "iso-time":
      if (timeZone === "utc") {
        return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      }
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    case "rfc2822":
      return d.toUTCString();

    case "unix":
      return Math.floor(d.getTime() / 1000).toString();

    case "milliseconds":
      return d.getTime().toString();

    default:
      return d.toISOString();
  }
}

export function formatDate(date: Date | string | number, format: DateFormat = "full", locale: string = "en-US"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return "";
  }

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: format === "full" ? "long" : format === "long" ? "long" : format === "medium" ? "short" : "numeric",
    day: "numeric",
  };

  return d.toLocaleDateString(locale, options);
}

export function formatDateTime(date: Date | string | number, options: FormatterOptions = {}): string {
  const { dateFormat = "medium", timeZone = "local" } = options;
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return "";
  }

  const datePart = formatDate(d, dateFormat);
  const timePart = formatTime(d, "iso-time", timeZone);

  return `${datePart} ${timePart}`;
}

export function formatParsedTime(parsed: ParsedTime, format: string = "YYYY-MM-DD HH:mm:ss"): string {
  if (!parsed.isValid) {
    return "";
  }

  return format
    .replace("YYYY", String(parsed.year))
    .replace("YY", String(parsed.year).slice(-2))
    .replace("MM", pad(parsed.month))
    .replace("M", String(parsed.month))
    .replace("DD", pad(parsed.day))
    .replace("D", String(parsed.day))
    .replace("HH", pad(parsed.hour))
    .replace("H", String(parsed.hour))
    .replace("mm", pad(parsed.minute))
    .replace("m", String(parsed.minute))
    .replace("ss", pad(parsed.second))
    .replace("s", String(parsed.second))
    .replace("SSS", pad(parsed.millisecond, 3));
}

export function toUtcString(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toUTCString();
}

export function toLocalString(date: Date | string | number, locale: string = "en-US"): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return d.toLocaleString(locale);
}

function pad(value: number, length: number = 2): string {
  return String(value).padStart(length, "0");
}