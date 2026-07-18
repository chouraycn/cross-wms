import type { CommandDocumentation, CommandOption, CommandSection, CommandExample, DocumentationGeneratorOptions } from "./types.js";

export function generateDocumentation(helpText: string, opts: DocumentationGeneratorOptions = {}): CommandDocumentation {
  const { format = "plain" } = opts;
  const sections = parseHelpText(helpText);

  const usageSection = sections.find((s) => s.type === "usage");
  const optionsSection = sections.find((s) => s.type === "options");
  const descriptionSection = sections.find((s) => s.type === "description");
  const examplesSection = sections.find((s) => s.type === "examples");

  const parsedOptions = parseOptions(optionsSection?.content || "");
  const parsedExamples = parseExamples(examplesSection?.content || "");

  const docs: CommandDocumentation = {
    name: extractCommandName(helpText),
    description: descriptionSection?.content.trim() || "",
    usage: usageSection?.content.trim() || "",
    options: parsedOptions,
    sections: sections.filter((s) => !["usage", "options", "description", "examples"].includes(s.type)).map((s) => ({
      title: capitalize(s.type),
      content: s.content.trim(),
    })),
    examples: parsedExamples,
  };

  if (format === "markdown") {
    return docs;
  }

  if (format === "json") {
    return docs;
  }

  return docs;
}

export function formatDocumentationAsMarkdown(docs: CommandDocumentation): string {
  let markdown = `# ${docs.name}\n\n`;

  if (docs.description) {
    markdown += `${docs.description}\n\n`;
  }

  if (docs.usage) {
    markdown += `## Usage\n\n\`\`\`\n${docs.usage}\n\`\`\`\n\n`;
  }

  if (docs.options.length > 0) {
    markdown += "## Options\n\n";
    for (const option of docs.options) {
      const shortFlag = option.short ? `-${option.short}, ` : "";
      const argument = option.argument ? ` <${option.argument}>` : "";
      markdown += `- ${shortFlag}--${option.long}${argument}: ${option.description}\n`;
    }
    markdown += "\n";
  }

  for (const section of docs.sections) {
    markdown += `## ${section.title}\n\n${section.content}\n\n`;
  }

  if (docs.examples.length > 0) {
    markdown += "## Examples\n\n";
    for (const example of docs.examples) {
      markdown += `### ${example.description}\n\n\`\`\`\n${example.command}\n\`\`\`\n\n`;
    }
  }

  return markdown;
}

export function formatDocumentationAsPlainText(docs: CommandDocumentation): string {
  let text = `${docs.name}\n${"=".repeat(docs.name.length)}\n\n`;

  if (docs.description) {
    text += `${docs.description}\n\n`;
  }

  if (docs.usage) {
    text += `Usage:\n  ${docs.usage}\n\n`;
  }

  if (docs.options.length > 0) {
    text += "Options:\n";
    for (const option of docs.options) {
      const shortFlag = option.short ? `-${option.short}, ` : "    ";
      const argument = option.argument ? ` ${option.argument}` : "";
      text += `  ${shortFlag}--${option.long}${argument}\n    ${option.description}\n`;
    }
    text += "\n";
  }

  for (const section of docs.sections) {
    text += `${section.title}:\n${section.content}\n\n`;
  }

  if (docs.examples.length > 0) {
    text += "Examples:\n";
    for (const example of docs.examples) {
      text += `  ${example.command}\n    ${example.description}\n`;
    }
  }

  return text;
}

function parseHelpText(helpText: string): { type: string; content: string }[] {
  const sections: { type: string; content: string }[] = [];
  const lines = helpText.split("\n");

  let currentType = "description";
  let currentContent = "";

  for (const line of lines) {
    if (line.match(/^Options?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "options";
      currentContent = "";
    } else if (line.match(/^Usage?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "usage";
      currentContent = "";
    } else if (line.match(/^Examples?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "examples";
      currentContent = "";
    } else if (line.match(/^Notes?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "notes";
      currentContent = "";
    } else if (line.match(/^Environment?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "environment";
      currentContent = "";
    } else if (line.match(/^Files?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "files";
      currentContent = "";
    } else if (line.match(/^See Also?:$/i)) {
      if (currentContent.trim()) {
        sections.push({ type: currentType, content: currentContent });
      }
      currentType = "see-also";
      currentContent = "";
    } else {
      currentContent += line + "\n";
    }
  }

  if (currentContent.trim()) {
    sections.push({ type: currentType, content: currentContent });
  }

  return sections;
}

function parseOptions(optionsText: string): CommandOption[] {
  const options: CommandOption[] = [];
  const lines = optionsText.trim().split("\n");

  let currentOption: CommandOption | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("-")) {
      if (currentOption) {
        options.push(currentOption);
      }

      const match = trimmed.match(/^(-[a-zA-Z]),?\s*(--[a-zA-Z0-9-]+)?(\s+<[a-zA-Z0-9_-]+>)?/);
      if (match) {
        const [, short, long, argument] = match;
        const description = trimmed.slice(match[0].length).trim();
        currentOption = {
          short: short || undefined,
          long: long?.slice(2) || short?.slice(1) || "",
          description,
          argument: argument?.slice(1, -1),
        };
      } else {
        const longMatch = trimmed.match(/^(--[a-zA-Z0-9-]+)(\s+<[a-zA-Z0-9_-]+>)?/);
        if (longMatch) {
          const [, long, argument] = longMatch;
          const description = trimmed.slice(longMatch[0].length).trim();
          currentOption = {
            long: long.slice(2),
            description,
            argument: argument?.slice(1, -1),
          };
        }
      }
    } else if (currentOption && trimmed) {
      currentOption.description += " " + trimmed;
    }
  }

  if (currentOption) {
    options.push(currentOption);
  }

  return options;
}

function parseExamples(examplesText: string): CommandExample[] {
  const examples: CommandExample[] = [];
  const lines = examplesText.trim().split("\n");

  let currentExample: CommandExample | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("$ ") || trimmed.startsWith("> ")) {
      if (currentExample) {
        examples.push(currentExample);
      }
      currentExample = {
        command: trimmed.slice(2),
        description: "",
      };
    } else if (currentExample && trimmed) {
      currentExample.description += (currentExample.description ? " " : "") + trimmed;
    }
  }

  if (currentExample) {
    examples.push(currentExample);
  }

  return examples;
}

function extractCommandName(helpText: string): string {
  const lines = helpText.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\w+)\s+(?:\(\d+\))?\s*-/);
    if (match) {
      return match[1];
    }
    const usageMatch = line.match(/^Usage:\s*(\w+)/);
    if (usageMatch) {
      return usageMatch[1];
    }
  }
  return "unknown";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}