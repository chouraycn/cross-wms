import type { CommandExplanation, ExplainCommandOptions } from "./types.js";
import { extractHelpText } from "./help-extractor.js";
import { generateDocumentation } from "./documentation.js";
import { generateExamples } from "./example-generator.js";
import { analyzeCommandSafety, getRiskLevel } from "../command-analysis/safety-analysis.js";

export async function explainCommand(options: ExplainCommandOptions): Promise<CommandExplanation> {
  const { command, args = [], includeSafetyAnalysis = true, includeExamples = true, includeDocumentation = true } = options;

  let description = "";
  let optionsList: { short?: string; long: string; description: string; argument?: string }[] = [];
  let examples: { command: string; description: string }[] = [];
  let risks: string[] = [];
  let safetyLevel: "safe" | "warning" | "danger" = "safe";

  if (includeDocumentation) {
    try {
      const helpText = await extractHelpText({ command });
      if (helpText) {
        const docs = generateDocumentation(helpText, { format: "json" });
        description = docs.description || description;
        optionsList = docs.options || optionsList;
        examples = docs.examples.map((e) => ({ command: e.command, description: e.description }));
      }
    } catch {
    }
  }

  if (includeExamples && examples.length === 0) {
    examples = generateExamples(command, { count: 3, complexity: "simple" });
  }

  if (includeSafetyAnalysis) {
    const safetyResult = analyzeCommandSafety(command, args);
    risks = safetyResult.warnings;
    const riskLevel = getRiskLevel(command, args);
    if (riskLevel === "critical" || riskLevel === "high") {
      safetyLevel = "danger";
    } else if (riskLevel === "medium") {
      safetyLevel = "warning";
    }
  }

  return {
    command,
    parsedCommand: [command, ...args].join(" "),
    description: description || `Execute the '${command}' command`,
    options: optionsList.map((o) => ({
      short: o.short,
      long: o.long,
      description: o.description,
      argument: o.argument,
    })),
    examples,
    risks,
    safetyLevel,
  };
}

export function getCommandDescription(command: string): string {
  const commandDescriptions: Record<string, string> = {
    ls: "List directory contents",
    cd: "Change directory",
    pwd: "Print working directory",
    mkdir: "Make directory",
    rm: "Remove files or directories",
    cp: "Copy files or directories",
    mv: "Move or rename files or directories",
    cat: "Concatenate and print files",
    grep: "Search text using patterns",
    find: "Search for files in a directory hierarchy",
    sed: "Stream editor for filtering and transforming text",
    awk: "Pattern scanning and processing language",
    echo: "Print text to standard output",
    export: "Set environment variable",
    source: "Execute commands from a file",
    chmod: "Change file permissions",
    chown: "Change file owner",
    sudo: "Execute command as superuser",
    ssh: "Secure shell connection",
    git: "Version control system",
    npm: "Node.js package manager",
    yarn: "Package manager for JavaScript",
    pnpm: "Fast, disk space efficient package manager",
    node: "Node.js runtime",
    python: "Python interpreter",
    ruby: "Ruby interpreter",
    java: "Java runtime",
    docker: "Containerization platform",
    kubectl: "Kubernetes command-line tool",
    curl: "Transfer data from or to a server",
    wget: "Download files from the web",
    tar: "Archive utility",
    zip: "Compression utility",
    unzip: "Decompression utility",
    ping: "Send ICMP echo requests",
    netstat: "Network statistics",
    ps: "Process status",
    kill: "Send signal to a process",
    top: "Display system processes",
    htop: "Interactive process viewer",
    df: "Disk space usage",
    du: "Disk usage",
    free: "Memory usage",
    uptime: "System uptime",
    date: "Display or set date and time",
    cal: "Calendar",
    man: "Manual pages",
    help: "Display help",
    exit: "Exit shell",
    history: "Command history",
    clear: "Clear terminal screen",
  };

  return commandDescriptions[command] || `Unknown command '${command}'`;
}

export function explainCommandBrief(command: string): string {
  return getCommandDescription(command);
}