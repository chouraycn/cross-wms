import { logger } from '../../../../logger.js';

interface SearchResult {
  file: string;
  line: number;
  endLine: number;
  snippet: string;
  language: string;
  score: number;
  type: 'function' | 'class' | 'variable' | 'comment' | 'import';
  description: string;
}

interface CodeContext {
  file: string;
  startLine: number;
  endLine: number;
  code: string;
  language: string;
}

const mockResults: SearchResult[] = [
  {
    file: 'src/auth/login.ts',
    line: 15,
    endLine: 42,
    snippet: 'export async function authenticateUser(username, password) {\n  const user = await findUser(username);\n  if (!user) throw new Error("User not found");\n  const valid = await verifyPassword(password, user.hash);\n  if (!valid) throw new Error("Invalid password");\n  return generateToken(user);\n}',
    language: 'typescript',
    score: 0.95,
    type: 'function',
    description: '用户认证函数，验证用户名和密码',
  },
  {
    file: 'src/auth/token.ts',
    line: 8,
    endLine: 25,
    snippet: 'export function generateToken(user) {\n  return jwt.sign(\n    { userId: user.id, role: user.role },\n    process.env.JWT_SECRET,\n    { expiresIn: "24h" }\n  );\n}',
    language: 'typescript',
    score: 0.87,
    type: 'function',
    description: '生成 JWT 访问令牌',
  },
  {
    file: 'src/db/query.ts',
    line: 1,
    endLine: 120,
    snippet: 'export class DatabaseQuery {\n  constructor(private connection) {}\n  async find(table, conditions) { ... }\n  async insert(table, data) { ... }\n  async update(table, data, where) { ... }\n  async delete(table, where) { ... }\n}',
    language: 'typescript',
    score: 0.82,
    type: 'class',
    description: '数据库查询类，封装 CRUD 操作',
  },
];

function calculateScore(query: string, item: SearchResult): number {
  const lowerQuery = query.toLowerCase();
  let score = item.score;
  if (item.description.toLowerCase().includes(lowerQuery)) score += 0.1;
  if (item.snippet.toLowerCase().includes(lowerQuery)) score += 0.05;
  return Math.min(score, 1.0);
}

export function semanticSearch(query: string, language?: string): SearchResult[] {
  logger.debug('[sag] semanticSearch query:', query, 'language:', language);

  let results = mockResults.map((r) => ({
    ...r,
    score: calculateScore(query, r),
  }));

  if (language) {
    results = results.filter((r) => r.language === language.toLowerCase());
  }

  return results.sort((a, b) => b.score - a.score);
}

export function findFunction(name: string): SearchResult[] {
  logger.debug('[sag] findFunction:', name);
  const lowerName = name.toLowerCase();
  return mockResults
    .filter((r) => r.type === 'function' && r.snippet.toLowerCase().includes(lowerName))
    .sort((a, b) => b.score - a.score);
}

export function searchByPattern(pattern: string): SearchResult[] {
  logger.debug('[sag] searchByPattern:', pattern);
  try {
    const regex = new RegExp(pattern, 'i');
    return mockResults
      .filter((r) => regex.test(r.snippet) || regex.test(r.file))
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

export function getCodeContext(file: string, line: number, range: number = 10): CodeContext {
  logger.debug('[sag] getCodeContext file:', file, 'line:', line, 'range:', range);

  const result = mockResults.find((r) => r.file === file);
  const code = result ? result.snippet : '// 代码未找到';
  const startLine = Math.max(1, line - range);
  const endLine = line + range;

  return {
    file,
    startLine,
    endLine,
    code,
    language: result?.language || 'unknown',
  };
}

export default {
  name: 'sag',
  description: '在代码库中进行语义搜索',
  tools: [
    {
      name: 'sag_search',
      description: '语义搜索代码',
      handler: (args: { query: string; language?: string }) => semanticSearch(args.query, args.language),
    },
    {
      name: 'sag_findFunction',
      description: '按名称查找函数',
      handler: (args: { name: string }) => findFunction(args.name),
    },
    {
      name: 'sag_searchByPattern',
      description: '按正则模式搜索',
      handler: (args: { pattern: string }) => searchByPattern(args.pattern),
    },
    {
      name: 'sag_getContext',
      description: '获取代码上下文',
      handler: (args: { file: string; line: number; range?: number }) =>
        getCodeContext(args.file, args.line, args.range),
    },
  ],
};
