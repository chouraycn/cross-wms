export type TimeFormat = "iso" | "iso-date" | "iso-time" | "rfc2822" | "unix" | "milliseconds";

export type DateFormat = "full" | "long" | "medium" | "short";

export type TimeZone = "utc" | "local" | string;

export type RelativeTimeOptions = {
  now?: Date;
  style?: "long" | "short" | "narrow";
  maxUnit?: "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
};

export type DurationFormatOptions = {
  style?: "long" | "short" | "narrow";
  units?: ("year" | "month" | "day" | "hour" | "minute" | "second")[];
  maxUnits?: number;
};

export type ParsedTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  timeZone?: string;
  isValid: boolean;
};

export type TimeParserOptions = {
  timeZone?: TimeZone;
  strict?: boolean;
};

export type FormatterOptions = {
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
  timeZone?: TimeZone;
  locale?: string;
};