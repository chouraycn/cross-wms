import type { CommandExample, ExampleGeneratorOptions } from "./types.js";

const COMMAND_EXAMPLES: Record<string, { command: string; description: string }[]> = {
  ls: [
    { command: "ls", description: "List files in current directory" },
    { command: "ls -la", description: "List files with detailed information" },
    { command: "ls -la /path/to/dir", description: "List files in specific directory" },
  ],
  cd: [
    { command: "cd /path/to/dir", description: "Change to specific directory" },
    { command: "cd ..", description: "Go up one directory" },
    { command: "cd ~", description: "Go to home directory" },
  ],
  pwd: [
    { command: "pwd", description: "Print current working directory" },
    { command: "pwd -P", description: "Print physical path (resolve symlinks)" },
  ],
  mkdir: [
    { command: "mkdir newdir", description: "Create a new directory" },
    { command: "mkdir -p dir1/dir2/dir3", description: "Create nested directories" },
    { command: "mkdir -m 755 newdir", description: "Create directory with specific permissions" },
  ],
  rm: [
    { command: "rm file.txt", description: "Remove a file" },
    { command: "rm -r directory", description: "Remove directory recursively" },
    { command: "rm -rf directory", description: "Force remove directory recursively" },
  ],
  cp: [
    { command: "cp source.txt dest.txt", description: "Copy file" },
    { command: "cp -r source/ dest/", description: "Copy directory recursively" },
    { command: "cp -i source.txt dest.txt", description: "Copy with interactive confirmation" },
  ],
  mv: [
    { command: "mv old.txt new.txt", description: "Rename a file" },
    { command: "mv file.txt /path/to/dir/", description: "Move file to directory" },
    { command: "mv -i old.txt new.txt", description: "Move with interactive confirmation" },
  ],
  cat: [
    { command: "cat file.txt", description: "Display file content" },
    { command: "cat file1.txt file2.txt", description: "Concatenate multiple files" },
    { command: "cat > newfile.txt", description: "Create new file from stdin" },
  ],
  grep: [
    { command: "grep pattern file.txt", description: "Search for pattern in file" },
    { command: "grep -r pattern /path/to/dir/", description: "Recursively search in directory" },
    { command: "grep -i pattern file.txt", description: "Case-insensitive search" },
  ],
  find: [
    { command: "find /path -name '*.txt'", description: "Find files by name" },
    { command: "find /path -type f -size +10M", description: "Find files larger than 10MB" },
    { command: "find /path -mtime -7", description: "Find files modified in last 7 days" },
  ],
  sed: [
    { command: "sed 's/old/new/g' file.txt", description: "Replace all occurrences" },
    { command: "sed -i 's/old/new/g' file.txt", description: "Replace in-place" },
    { command: "sed '/pattern/d' file.txt", description: "Delete lines matching pattern" },
  ],
  awk: [
    { command: "awk '{print $1}' file.txt", description: "Print first column" },
    { command: "awk '/pattern/ {print $0}' file.txt", description: "Print lines matching pattern" },
    { command: "awk '{sum += $1} END {print sum}' file.txt", description: "Sum first column" },
  ],
  echo: [
    { command: "echo 'Hello World'", description: "Print text to stdout" },
    { command: "echo $PATH", description: "Print environment variable" },
    { command: "echo 'text' >> file.txt", description: "Append text to file" },
  ],
  export: [
    { command: "export VAR=value", description: "Set environment variable" },
    { command: "export PATH=$PATH:/new/path", description: "Add to PATH" },
    { command: "export -p", description: "Print all exported variables" },
  ],
  chmod: [
    { command: "chmod 755 file.txt", description: "Set file permissions" },
    { command: "chmod +x script.sh", description: "Make file executable" },
    { command: "chmod -R 755 directory/", description: "Recursively set permissions" },
  ],
  chown: [
    { command: "chown user file.txt", description: "Change file owner" },
    { command: "chown user:group file.txt", description: "Change owner and group" },
    { command: "chown -R user:group directory/", description: "Recursively change ownership" },
  ],
  sudo: [
    { command: "sudo command", description: "Run command as superuser" },
    { command: "sudo -i", description: "Get interactive root shell" },
    { command: "sudo -u user command", description: "Run command as specific user" },
  ],
  ssh: [
    { command: "ssh user@host", description: "Connect to remote host" },
    { command: "ssh -p 2222 user@host", description: "Connect on specific port" },
    { command: "ssh -i key.pem user@host", description: "Connect with specific key" },
  ],
  git: [
    { command: "git clone repo-url", description: "Clone a repository" },
    { command: "git commit -m 'message'", description: "Commit changes" },
    { command: "git push origin main", description: "Push to remote" },
  ],
  npm: [
    { command: "npm install", description: "Install dependencies" },
    { command: "npm install package", description: "Install specific package" },
    { command: "npm run build", description: "Run build script" },
  ],
  curl: [
    { command: "curl https://example.com", description: "Fetch URL content" },
    { command: "curl -o file.html https://example.com", description: "Save to file" },
    { command: "curl -X POST -d 'data' https://example.com", description: "POST request" },
  ],
  wget: [
    { command: "wget https://example.com/file.zip", description: "Download file" },
    { command: "wget -P /path https://example.com/file.zip", description: "Download to specific directory" },
    { command: "wget -r https://example.com", description: "Recursive download" },
  ],
  tar: [
    { command: "tar -czf archive.tar.gz directory/", description: "Create compressed archive" },
    { command: "tar -xzf archive.tar.gz", description: "Extract compressed archive" },
    { command: "tar -tf archive.tar.gz", description: "List archive contents" },
  ],
  zip: [
    { command: "zip archive.zip file1.txt file2.txt", description: "Create zip archive" },
    { command: "zip -r archive.zip directory/", description: "Create zip of directory" },
    { command: "zip -d archive.zip file.txt", description: "Delete file from archive" },
  ],
  unzip: [
    { command: "unzip archive.zip", description: "Extract zip archive" },
    { command: "unzip archive.zip -d /path", description: "Extract to specific directory" },
    { command: "unzip -l archive.zip", description: "List archive contents" },
  ],
  ping: [
    { command: "ping example.com", description: "Ping host" },
    { command: "ping -c 4 example.com", description: "Ping with 4 packets" },
    { command: "ping -i 0.5 example.com", description: "Ping with 0.5s interval" },
  ],
  ps: [
    { command: "ps", description: "List current processes" },
    { command: "ps aux", description: "List all processes with details" },
    { command: "ps aux | grep process", description: "Search for specific process" },
  ],
  kill: [
    { command: "kill PID", description: "Send signal to process" },
    { command: "kill -9 PID", description: "Force kill process" },
    { command: "killall processname", description: "Kill all processes by name" },
  ],
  top: [
    { command: "top", description: "Display system processes" },
    { command: "top -u user", description: "Display processes for specific user" },
    { command: "top -n 1", description: "Display single snapshot" },
  ],
  df: [
    { command: "df", description: "Display disk space usage" },
    { command: "df -h", description: "Display in human-readable format" },
    { command: "df -T", description: "Display file system type" },
  ],
  du: [
    { command: "du", description: "Display disk usage" },
    { command: "du -h", description: "Display in human-readable format" },
    { command: "du -sh directory/", description: "Display total size of directory" },
  ],
  free: [
    { command: "free", description: "Display memory usage" },
    { command: "free -h", description: "Display in human-readable format" },
    { command: "free -m", description: "Display in megabytes" },
  ],
  date: [
    { command: "date", description: "Display current date and time" },
    { command: "date +'%Y-%m-%d'", description: "Custom date format" },
    { command: "date -d '2 days ago'", description: "Display past date" },
  ],
};

export function generateExamples(command: string, options: ExampleGeneratorOptions = {}): CommandExample[] {
  const { count = 3, complexity = "simple" } = options;

  const examples = COMMAND_EXAMPLES[command] || [
    { command, description: `Execute ${command}` },
    { command: `${command} --help`, description: "Show help" },
    { command: `${command} --version`, description: "Show version" },
  ];

  return examples.slice(0, count).map((e) => ({
    command: e.command,
    description: e.description,
  }));
}

export function generateExampleVariations(command: string, baseArgs: string[] = [], count: number = 5): string[] {
  const variations: string[] = [];
  const optionSets = [
    [],
    ["-h"],
    ["--help"],
    ["-v"],
    ["--version"],
    ["-a"],
    ["--all"],
    ["-l"],
    ["-r"],
    ["-f"],
    ["-i"],
    ["-o", "output"],
    ["--output", "output"],
  ];

  for (let i = 0; i < count && i < optionSets.length; i++) {
    const options = optionSets[i];
    const cmd = [command, ...baseArgs, ...options].join(" ");
    if (!variations.includes(cmd)) {
      variations.push(cmd);
    }
  }

  return variations;
}

export function getCommandExample(command: string): CommandExample | null {
  const examples = COMMAND_EXAMPLES[command];
  if (!examples || examples.length === 0) return null;
  return examples[0];
}