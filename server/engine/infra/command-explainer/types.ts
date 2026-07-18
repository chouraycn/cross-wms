export type CommandOption = {
  short?: string;
  long: string;
  description: string;
  argument?: string;
  isRequired?: boolean;
  defaultValue?: string;
};

export type CommandSection = {
  title: string;
  content: string;
};

export type CommandDocumentation = {
  name: string;
  description: string;
  usage: string;
  options: CommandOption[];
  sections: CommandSection[];
  examples: CommandExample[];
};

export type CommandExample = {
  command: string;
  description: string;
  output?: string;
};

export type HelpTextSection = {
  type: "usage" | "options" | "description" | "examples" | "notes" | "environment" | "files" | "see-also";
  content: string;
};

export type ManPageSection = {
  name: string;
  content: string;
};

export type ManPageData = {
  name: string;
  section: number;
  description: string;
  synopsis: string;
  sections: ManPageSection[];
};

export type CommandExplanation = {
  command: string;
  parsedCommand: string;
  description: string;
  options: CommandOption[];
  examples: CommandExample[];
  risks: string[];
  safetyLevel: "safe" | "warning" | "danger";
};

export type DocumentationGeneratorOptions = {
  includeExamples?: boolean;
  includeAdvancedOptions?: boolean;
  format?: "markdown" | "plain" | "json";
};

export type ExampleGeneratorOptions = {
  count?: number;
  complexity?: "simple" | "medium" | "advanced";
  includeExplanation?: boolean;
};

export type HelpExtractorOptions = {
  command: string;
  args?: string[];
  timeout?: number;
};

export type ManPageParserOptions = {
  command: string;
  section?: number;
};

export type ExplainCommandOptions = {
  command: string;
  args?: string[];
  includeSafetyAnalysis?: boolean;
  includeExamples?: boolean;
  includeDocumentation?: boolean;
};