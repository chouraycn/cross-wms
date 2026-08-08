export {
  type DocumentationConfig,
  type ParamDoc,
  type ToolDoc,
  type CommandDoc,
  type ExampleDoc,
  type ApiReferenceDoc,
  type SkillDocumentation,
  generateSkillDocs,
  generateAllDocs,
  generateApiReference,
  generateSkillIndex,
  formatDocAsMarkdown,
  formatDocAsHtml,
  formatDocAsJson,
  saveDoc,
  saveAllDocs,
} from './docs-generator.js';

export {
  getMarkdownTemplate,
  getHtmlTemplate,
  applyTemplate,
} from './templates.js';
