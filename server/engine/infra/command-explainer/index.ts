export type {
  CommandOption,
  CommandSection,
  CommandDocumentation,
  CommandExample,
  HelpTextSection,
  ManPageSection,
  ManPageData,
  CommandExplanation,
  DocumentationGeneratorOptions,
  ExampleGeneratorOptions,
  HelpExtractorOptions,
  ManPageParserOptions,
  ExplainCommandOptions,
} from "./types.js";

export {
  explainCommand,
  getCommandDescription,
  explainCommandBrief,
} from "./explainer.js";

export {
  generateDocumentation,
  formatDocumentationAsMarkdown,
  formatDocumentationAsPlainText,
} from "./documentation.js";

export {
  generateExamples,
  generateExampleVariations,
  getCommandExample,
} from "./example-generator.js";

export {
  extractHelpText,
  extractVersion,
  extractCommandInfo,
  commandExists,
} from "./help-extractor.js";

export {
  parseManPage,
  parseManPageContent,
  getManPageSummary,
} from "./man-page-parser.js";