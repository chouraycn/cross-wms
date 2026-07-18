export type IssueSeverity = "low" | "medium" | "high" | "critical";

export type IssueType = "bug" | "feature" | "enhancement" | "question" | "documentation" | "security";

export type Issue = {
  id: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  type: IssueType;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
  resolvedAt?: number;
  resolved?: boolean;
  metadata?: Record<string, unknown>;
};

export type IssueFormatOptions = {
  includeMetadata?: boolean;
  includeTimestamp?: boolean;
  format?: "markdown" | "json" | "plain";
};

export function formatIssue(issue: Issue, options: IssueFormatOptions = {}): string {
  const { includeMetadata = false, includeTimestamp = true, format = "markdown" } = options;

  switch (format) {
    case "json":
      return JSON.stringify(issue, null, 2);

    case "plain": {
      let text = `[${issue.id}] ${issue.title}\n`;
      text += `Type: ${issue.type}\n`;
      text += `Severity: ${issue.severity}\n`;
      text += `Tags: ${issue.tags.join(", ")}\n`;
      if (includeTimestamp) {
        text += `Created: ${new Date(issue.createdAt).toISOString()}\n`;
      }
      text += `\n${issue.description}\n`;
      if (includeMetadata && issue.metadata) {
        text += `\nMetadata:\n${JSON.stringify(issue.metadata, null, 2)}\n`;
      }
      return text;
    }

    case "markdown":
    default: {
      let markdown = `## ${issue.title}\n\n`;
      markdown += `**ID:** ${issue.id}\n\n`;
      markdown += `**Type:** ${issue.type}\n\n`;
      markdown += `**Severity:** ${issue.severity}\n\n`;
      markdown += `**Tags:** ${issue.tags.map((t) => `\`${t}\``).join(", ")}\n\n`;
      if (includeTimestamp) {
        markdown += `**Created:** ${new Date(issue.createdAt).toISOString()}\n\n`;
      }
      markdown += `${issue.description}\n\n`;
      if (includeMetadata && issue.metadata) {
        markdown += `### Metadata\n\n\`\`\`json\n${JSON.stringify(issue.metadata, null, 2)}\n\`\`\`\n`;
      }
      return markdown;
    }
  }
}

export function createIssue(
  title: string,
  description: string,
  options: {
    severity?: IssueSeverity;
    type?: IssueType;
    tags?: string[];
    metadata?: Record<string, unknown>;
  } = {},
): Issue {
  return {
    id: `ISSUE-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    description,
    severity: options.severity ?? "medium",
    type: options.type ?? "bug",
    tags: options.tags ?? [],
    createdAt: Date.now(),
    metadata: options.metadata,
  };
}

export function parseIssue(content: string): Issue | null {
  try {
    return JSON.parse(content) as Issue;
  } catch {
    return null;
  }
}

export function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "high":
      return "#ea580c";
    case "medium":
      return "#ca8a04";
    case "low":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

export function getTypeLabel(type: IssueType): string {
  switch (type) {
    case "bug":
      return "Bug";
    case "feature":
      return "Feature Request";
    case "enhancement":
      return "Enhancement";
    case "question":
      return "Question";
    case "documentation":
      return "Documentation";
    case "security":
      return "Security";
    default:
      return type;
  }
}