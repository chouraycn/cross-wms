/**
 * Normalizes image-generation overrides against provider capabilities.
 *
 * 移植自 openclaw/src/image-generation/normalization.ts
 *
 * Ensures only supported parameters reach the provider and returns
 * metadata describing what was adjusted.
 */

import type {
  ImageGenerationBackground,
  ImageGenerationIgnoredOverride,
  ImageGenerationNormalization,
  ImageGenerationOutputFormat,
  ImageGenerationProvider,
  ImageGenerationQuality,
  ImageGenerationResolution,
  ImageGenerationSourceImage,
} from "./types.js";

type ResolveImageGenerationOverridesParams = {
  provider: ImageGenerationProvider;
  model: string;
  size?: string;
  aspectRatio?: string;
  resolution?: ImageGenerationResolution;
  quality?: ImageGenerationQuality;
  outputFormat?: ImageGenerationOutputFormat;
  background?: ImageGenerationBackground;
  inputImages?: ImageGenerationSourceImage[];
  mode?: "generate" | "edit";
};

type ResolveImageGenerationOverridesResult = {
  size?: string;
  aspectRatio?: string;
  resolution?: ImageGenerationResolution;
  quality?: ImageGenerationQuality;
  outputFormat?: ImageGenerationOutputFormat;
  background?: ImageGenerationBackground;
  normalization: ImageGenerationNormalization;
  ignoredOverrides: ImageGenerationIgnoredOverride[];
};

function getModelSpecificSizes(
  provider: ImageGenerationProvider,
  model: string,
): string[] | undefined {
  const geometry = provider.capabilities.geometry;
  if (!geometry) return undefined;
  if (geometry.sizesByModel?.[model]) {
    return geometry.sizesByModel[model];
  }
  return geometry.sizes;
}

function getModelSpecificAspectRatios(
  provider: ImageGenerationProvider,
  model: string,
): string[] | undefined {
  const geometry = provider.capabilities.geometry;
  if (!geometry) return undefined;
  if (geometry.aspectRatiosByModel?.[model]) {
    return geometry.aspectRatiosByModel[model];
  }
  return geometry.aspectRatios;
}

function getModelSpecificResolutions(
  provider: ImageGenerationProvider,
  model: string,
): ImageGenerationResolution[] | undefined {
  const geometry = provider.capabilities.geometry;
  if (!geometry) return undefined;
  if (geometry.resolutionsByModel?.[model]) {
    return geometry.resolutionsByModel[model];
  }
  return geometry.resolutions;
}

export function resolveImageGenerationOverrides(
  params: ResolveImageGenerationOverridesParams,
): ResolveImageGenerationOverridesResult {
  const {
    provider,
    model,
    size,
    aspectRatio,
    resolution,
    quality,
    outputFormat,
    background,
    mode = "generate",
  } = params;

  const caps = provider.capabilities;
  const modeCaps = mode === "edit" ? caps.edit : caps.generate;
  const ignoredOverrides: ImageGenerationIgnoredOverride[] = [];
  const normalization: ImageGenerationNormalization = {};

  // Size
  let appliedSize: string | undefined;
  if (size && modeCaps.supportsSize) {
    const supportedSizes = getModelSpecificSizes(provider, model);
    if (!supportedSizes || supportedSizes.includes(size)) {
      appliedSize = size;
    } else {
      ignoredOverrides.push({ key: "size", value: size });
    }
  } else if (size) {
    ignoredOverrides.push({ key: "size", value: size });
  }
  if (size !== appliedSize) {
    normalization.size = { requested: size, applied: appliedSize };
  }

  // Aspect ratio
  let appliedAspectRatio: string | undefined;
  if (aspectRatio && modeCaps.supportsAspectRatio && !appliedSize) {
    const supportedRatios = getModelSpecificAspectRatios(provider, model);
    if (!supportedRatios || supportedRatios.includes(aspectRatio)) {
      appliedAspectRatio = aspectRatio;
    } else {
      ignoredOverrides.push({ key: "aspectRatio", value: aspectRatio });
    }
  } else if (aspectRatio) {
    ignoredOverrides.push({ key: "aspectRatio", value: aspectRatio });
  }
  if (aspectRatio !== appliedAspectRatio) {
    normalization.aspectRatio = {
      requested: aspectRatio,
      applied: appliedAspectRatio,
    };
  }

  // Resolution
  let appliedResolution: ImageGenerationResolution | undefined;
  if (resolution && modeCaps.supportsResolution && !appliedSize && !appliedAspectRatio) {
    const supportedResolutions = getModelSpecificResolutions(provider, model);
    if (!supportedResolutions || supportedResolutions.includes(resolution)) {
      appliedResolution = resolution;
    } else {
      ignoredOverrides.push({ key: "resolution", value: resolution });
    }
  } else if (resolution) {
    ignoredOverrides.push({ key: "resolution", value: resolution });
  }
  if (resolution !== appliedResolution) {
    normalization.resolution = {
      requested: resolution,
      applied: appliedResolution,
    };
  }

  // Quality
  let appliedQuality: ImageGenerationQuality | undefined;
  if (quality && caps.output?.qualities?.includes(quality as ImageGenerationQuality)) {
    appliedQuality = quality;
  } else if (quality) {
    ignoredOverrides.push({ key: "quality", value: quality });
  }

  // Output format
  let appliedOutputFormat: ImageGenerationOutputFormat | undefined;
  if (outputFormat && caps.output?.formats?.includes(outputFormat as ImageGenerationOutputFormat)) {
    appliedOutputFormat = outputFormat;
  } else if (outputFormat) {
    ignoredOverrides.push({ key: "outputFormat", value: outputFormat });
  }

  // Background
  let appliedBackground: ImageGenerationBackground | undefined;
  if (background && caps.output?.backgrounds?.includes(background as ImageGenerationBackground)) {
    appliedBackground = background;
  } else if (background) {
    ignoredOverrides.push({ key: "background", value: background });
  }

  return {
    size: appliedSize,
    aspectRatio: appliedAspectRatio,
    resolution: appliedResolution,
    quality: appliedQuality,
    outputFormat: appliedOutputFormat,
    background: appliedBackground,
    normalization,
    ignoredOverrides,
  };
}
