import type { RelativeTimeOptions } from "./types.js";

export function formatRelativeTime(date: Date | string | number, options: RelativeTimeOptions = {}): string {
  const { now = new Date(), style = "long" } = options;
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  if (isNaN(d.getTime()) || isNaN(now.getTime())) {
    return "";
  }

  const diff = now.getTime() - d.getTime();
  const isFuture = diff < 0;
  const absDiff = Math.abs(diff);

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (years > 0) {
    value = years;
    unit = "year";
  } else if (months > 0) {
    value = months;
    unit = "month";
  } else if (weeks > 0) {
    value = weeks;
    unit = "week";
  } else if (days > 0) {
    value = days;
    unit = "day";
  } else if (hours > 0) {
    value = hours;
    unit = "hour";
  } else if (minutes > 0) {
    value = minutes;
    unit = "minute";
  } else {
    value = seconds;
    unit = "second";
  }

  const rtf = new Intl.RelativeTimeFormat("en-US", { style });
  return rtf.format(isFuture ? value : -value, unit);
}

export function getRelativeTime(date: Date | string | number): { value: number; unit: string; isFuture: boolean } {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = new Date();

  if (isNaN(d.getTime()) || isNaN(now.getTime())) {
    return { value: 0, unit: "second", isFuture: false };
  }

  const diff = now.getTime() - d.getTime();
  const isFuture = diff < 0;
  const absDiff = Math.abs(diff);

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return { value: years, unit: "year", isFuture };
  }
  if (months > 0) {
    return { value: months, unit: "month", isFuture };
  }
  if (weeks > 0) {
    return { value: weeks, unit: "week", isFuture };
  }
  if (days > 0) {
    return { value: days, unit: "day", isFuture };
  }
  if (hours > 0) {
    return { value: hours, unit: "hour", isFuture };
  }
  if (minutes > 0) {
    return { value: minutes, unit: "minute", isFuture };
  }
  return { value: seconds, unit: "second", isFuture };
}

export function isToday(date: Date | string | number): boolean {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = new Date();

  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function isYesterday(date: Date | string | number): boolean {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
}

export function isThisWeek(date: Date | string | number): boolean {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return d >= startOfWeek && d < endOfWeek;
}

export function isThisMonth(date: Date | string | number): boolean {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = new Date();

  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function isThisYear(date: Date | string | number): boolean {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const now = new Date();

  return d.getFullYear() === now.getFullYear();
}