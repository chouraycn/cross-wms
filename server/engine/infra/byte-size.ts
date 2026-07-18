export type ByteSizeOptions = {
  precision?: number;
  units?: "binary" | "decimal";
  format?: "short" | "long";
};

export function formatByteSize(bytes: number, options: ByteSizeOptions = {}): string {
  const { precision = 2, units = "binary", format = "short" } = options;

  if (bytes === 0) {
    return "0 B";
  }

  const k = units === "binary" ? 1024 : 1000;
  const sizes =
    units === "binary"
      ? format === "short"
        ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
        : ["bytes", "kibibytes", "mebibytes", "gibibytes", "tebibytes", "pebibytes"]
      : format === "short"
      ? ["B", "KB", "MB", "GB", "TB", "PB"]
      : ["bytes", "kilobytes", "megabytes", "gigabytes", "terabytes", "petabytes"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(precision))} ${sizes[i]}`;
}

export function parseByteSize(input: string): number {
  const match = input.match(/^([\d.]+)\s*(bytes?|b|kilobytes?|kb|megabytes?|mb|gigabytes?|gb|terabytes?|tb|petabytes?|pb)$/i);
  if (!match) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    byte: 1,
    bytes: 1,
    b: 1,
    kilobyte: 1024,
    kilobytes: 1024,
    kb: 1024,
    megabyte: 1024 * 1024,
    megabytes: 1024 * 1024,
    mb: 1024 * 1024,
    gigabyte: 1024 * 1024 * 1024,
    gigabytes: 1024 * 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    terabyte: 1024 * 1024 * 1024 * 1024,
    terabytes: 1024 * 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
    petabyte: 1024 * 1024 * 1024 * 1024 * 1024,
    petabytes: 1024 * 1024 * 1024 * 1024 * 1024,
    pb: 1024 * 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}

export function getByteSize(bytes: number): {
  value: number;
  unit: string;
  shortUnit: string;
} {
  if (bytes === 0) {
    return { value: 0, unit: "bytes", shortUnit: "B" };
  }

  const k = 1024;
  const units = ["bytes", "kibibytes", "mebibytes", "gibibytes", "terabytes", "petabytes"];
  const shortUnits = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return {
    value: parseFloat((bytes / Math.pow(k, i)).toFixed(2)),
    unit: units[i],
    shortUnit: shortUnits[i],
  };
}

export function bytesToHumanReadable(bytes: number): string {
  return formatByteSize(bytes);
}

export function humanReadableToBytes(input: string): number {
  return parseByteSize(input);
}