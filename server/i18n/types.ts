export type TranslationMap = { [key: string]: string | TranslationMap };

export type Locale =
  | "en"
  | "zh-CN"
  | "zh-TW"
  | "de"
  | "es"
  | "ja-JP";