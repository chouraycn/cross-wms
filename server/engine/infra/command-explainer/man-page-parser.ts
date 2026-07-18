import { execFile } from "child_process";
import type { ManPageData, ManPageParserOptions } from "./types.js";

export async function parseManPage(options: ManPageParserOptions): Promise<ManPageData | null> {
  const { command, section } = options;

  const args: string[] = [];
  if (section) {
    args.push(`${section}`);
  }
  args.push(command);

  return new Promise((resolve) => {
    execFile("man", args, (error, stdout) => {
      if (error) {
        return resolve(null);
      }

      const data = parseManPageContent(stdout);
      resolve(data);
    });
  });
}

export function parseManPageContent(content: string, cmd?: string): ManPageData {
  const lines = content.split("\n");
  let name = "unknown";
  let section = 1;
  let description = "";
  let synopsis = "";
  const sections: { name: string; content: string }[] = [];

  let currentSection: { name: string; content: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (cmd && trimmed.startsWith(cmd)) {
      const match = trimmed.match(/^(\w+)\((\d+)\)\s*-\s*(.+)/);
      if (match) {
        name = match[1];
        section = parseInt(match[2], 10);
        description = match[3];
      }
      continue;
    }

    if (trimmed.startsWith("SYNOPSIS")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "SYNOPSIS", content: "" };
      continue;
    }

    if (trimmed.startsWith("DESCRIPTION")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "DESCRIPTION", content: "" };
      continue;
    }

    if (trimmed.startsWith("OPTIONS")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "OPTIONS", content: "" };
      continue;
    }

    if (trimmed.startsWith("EXAMPLES")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "EXAMPLES", content: "" };
      continue;
    }

    if (trimmed.startsWith("ENVIRONMENT")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "ENVIRONMENT", content: "" };
      continue;
    }

    if (trimmed.startsWith("FILES")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "FILES", content: "" };
      continue;
    }

    if (trimmed.startsWith("SEE ALSO")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "SEE ALSO", content: "" };
      continue;
    }

    if (trimmed.startsWith("BUGS")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "BUGS", content: "" };
      continue;
    }

    if (trimmed.startsWith("AUTHOR")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: "AUTHOR", content: "" };
      continue;
    }

    if (trimmed.match(/^[A-Z ]{4,}$/) && !trimmed.includes("-")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: trimmed, content: "" };
      continue;
    }

    if (currentSection) {
      currentSection.content += line + "\n";
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  const synopsisSection = sections.find((s) => s.name === "SYNOPSIS");
  synopsis = synopsisSection?.content.trim() || "";

  return {
    name,
    section,
    description,
    synopsis,
    sections,
  };
}

export async function getManPageSummary(command: string): Promise<string | null> {
  const manPage = await parseManPage({ command });
  if (!manPage) return null;

  const descriptionSection = manPage.sections.find((s) => s.name === "DESCRIPTION");
  const description = descriptionSection?.content.trim() || manPage.description;

  return description.split("\n").slice(0, 3).join(" ").trim();
}