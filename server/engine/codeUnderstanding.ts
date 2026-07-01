/**
 * Code Understanding Service — 代码理解服务
 *
 * 提供代码分析和理解功能：
 * - analyzeFile() - 分析单个文件
 * - analyzeProject() - 分析整个项目
 * - explainSymbol() - 解释符号用途
 * - suggestImprovements() - 改进建议
 */

import { logger } from '../logger.js';
import { readFile, stat } from 'fs/promises';
import { join, extname, basename, dirname } from 'path';
import { getCodeIndexEngine } from './codeIndex.js';
import type { SymbolDefinition, SymbolKind } from './codeIndex.js';

// ===================== 分析结果类型 =====================

/**
 * 文件分析结果
 */
export interface FileAnalysisResult {
  /** 文件路径 */
  filePath: string;
  /** 语言类型 */
  language: string;
  /** 文件大小 */
  fileSize: number;
  /** 行数 */
  lineCount: number;
  /** 符号统计 */
  symbolStats: {
    total: number;
    functions: number;
    classes: number;
    interfaces: number;
    variables: number;
    constants: number;
    imports: number;
    exports: number;
  };
  /** 复杂度评分（0-100） */
  complexityScore: number;
  /** 可读性评分（0-100） */
  readabilityScore: number;
  /** 问题列表 */
  issues: CodeIssue[];
  /** 建议 */
  suggestions: string[];
  /** 依赖分析 */
  dependencies: {
    imports: string[];
    exports: string[];
    external: string[];
  };
  /** 文档覆盖率 */
  documentationCoverage: number;
}

/**
 * 代码问题
 */
export interface CodeIssue {
  /** 问题类型 */
  type: 'error' | 'warning' | 'info' | 'suggestion';
  /** 问题描述 */
  message: string;
  /** 位置 */
  line?: number;
  column?: number;
  /** 严重程度 */
  severity: number;
  /** 建议修复 */
  fix?: string;
}

/**
 * 项目分析结果
 */
export interface ProjectAnalysisResult {
  /** 项目路径 */
  rootPath: string;
  /** 文件总数 */
  totalFiles: number;
  /** 分析成功文件数 */
  analyzedFiles: number;
  /** 符号统计 */
  symbolStats: {
    total: number;
    byKind: Record<SymbolKind, number>;
    byLanguage: Record<string, number>;
  };
  /** 平均复杂度 */
  avgComplexity: number;
  /** 平均可读性 */
  avgReadability: number;
  /** 项目问题 */
  issues: CodeIssue[];
  /** 项目建议 */
  suggestions: string[];
  /** 依赖图 */
  dependencyGraph: {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
  };
  /** 技术栈 */
  techStack: string[];
}

/**
 * 符号解释结果
 */
export interface SymbolExplanation {
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  kind: SymbolKind;
  /** 定义位置 */
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  /** 用途描述 */
  purpose: string;
  /** 使用场景 */
  usageScenarios: string[];
  /** 相关符号 */
  relatedSymbols: string[];
  /** 示例用法 */
  example?: string;
  /** 最佳实践建议 */
  bestPractices: string[];
}

// ===================== 代码理解服务类 =====================

/**
 * 代码理解服务
 */
export class CodeUnderstandingService {
  /**
   * 分析单个文件
   */
  async analyzeFile(filePath: string): Promise<FileAnalysisResult> {
    logger.info(`[Code Understanding] 分析文件: ${filePath}`);

    try {
      // 读取文件内容
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const fileStat = await stat(filePath);

      // 获取语言类型
      const ext = extname(filePath).toLowerCase();
      const language = this.getLanguageFromExtension(ext);

      // 获取符号
      const engine = getCodeIndexEngine();
      const symbols = await engine.extractSymbols(filePath, content);

      // 计算符号统计
      const symbolStats = this.calculateSymbolStats(symbols);

      // 计算复杂度评分
      const complexityScore = this.calculateComplexity(lines, symbols);

      // 计算可读性评分
      const readabilityScore = this.calculateReadability(lines, symbols);

      // 检测问题
      const issues = this.detectIssues(content, lines, symbols);

      // 生成建议
      const suggestions = this.generateSuggestions(issues, symbolStats, complexityScore, readabilityScore);

      // 分析依赖
      const dependencies = this.analyzeDependencies(content, language);

      // 计算文档覆盖率
      const documentationCoverage = this.calculateDocumentationCoverage(lines, symbols);

      return {
        filePath,
        language,
        fileSize: fileStat.size,
        lineCount: lines.length,
        symbolStats,
        complexityScore,
        readabilityScore,
        issues,
        suggestions,
        dependencies,
        documentationCoverage,
      };
    } catch (error) {
      logger.error(`[Code Understanding] 分析文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 分析整个项目
   */
  async analyzeProject(rootPath: string): Promise<ProjectAnalysisResult> {
    logger.info(`[Code Understanding] 分析项目: ${rootPath}`);

    try {
      const engine = getCodeIndexEngine();
      const stats = engine.getStats();
      const files = engine.getIndexedFiles();

      // 分析每个文件
      const fileAnalyses: FileAnalysisResult[] = [];
      const allIssues: CodeIssue[] = [];

      for (const fileInfo of files.slice(0, 50)) { // 限制分析数量
        try {
          const analysis = await this.analyzeFile(join(rootPath, fileInfo.filePath));
          fileAnalyses.push(analysis);
          allIssues.push(...analysis.issues);
        } catch {
          // 跳过分析失败的文件
        }
      }

      // 计算平均值
      const avgComplexity = fileAnalyses.length > 0
        ? fileAnalyses.reduce((sum, a) => sum + a.complexityScore, 0) / fileAnalyses.length
        : 0;

      const avgReadability = fileAnalyses.length > 0
        ? fileAnalyses.reduce((sum, a) => sum + a.readabilityScore, 0) / fileAnalyses.length
        : 0;

      // 构建依赖图
      const dependencyGraph = this.buildDependencyGraph(fileAnalyses);

      // 推测技术栈
      const techStack = this.detectTechStack(files);

      // 生成项目建议
      const suggestions = this.generateProjectSuggestions(stats, avgComplexity, avgReadability, techStack);

      return {
        rootPath,
        totalFiles: stats.totalFiles,
        analyzedFiles: fileAnalyses.length,
        symbolStats: {
          total: stats.totalSymbols,
          byKind: stats.symbolsByKind,
          byLanguage: stats.symbolsByLanguage,
        },
        avgComplexity,
        avgReadability,
        issues: allIssues.slice(0, 100),
        suggestions,
        dependencyGraph,
        techStack,
      };
    } catch (error) {
      logger.error(`[Code Understanding] 分析项目失败: ${rootPath}`, error);
      throw error;
    }
  }

  /**
   * 解释符号用途
   */
  async explainSymbol(
    filePath: string,
    symbolName: string,
    line?: number,
  ): Promise<SymbolExplanation> {
    logger.info(`[Code Understanding] 解释符号: ${symbolName} (${filePath})`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const engine = getCodeIndexEngine();
      const symbols = await engine.extractSymbols(filePath, content);

      // 查找目标符号
      const targetSymbol = symbols.find(s =>
        s.name === symbolName && (line === undefined || s.line === line)
      );

      if (!targetSymbol) {
        throw new Error(`未找到符号: ${symbolName}`);
      }

      // 查找相关符号
      const relatedSymbols = this.findRelatedSymbols(content, targetSymbol, symbols);

      // 提取示例用法
      const example = this.extractExample(content, targetSymbol);

      // 推断用途
      const purpose = this.inferPurpose(targetSymbol, content);

      // 推断使用场景
      const usageScenarios = this.inferUsageScenarios(targetSymbol, content);

      // 最佳实践建议
      const bestPractices = this.generateBestPractices(targetSymbol);

      return {
        name: targetSymbol.name,
        kind: targetSymbol.kind,
        location: {
          filePath: targetSymbol.filePath,
          line: targetSymbol.line,
          column: targetSymbol.column,
        },
        purpose,
        usageScenarios,
        relatedSymbols,
        example,
        bestPractices,
      };
    } catch (error) {
      logger.error(`[Code Understanding] 解释符号失败: ${symbolName}`, error);
      throw error;
    }
  }

  /**
   * 生成改进建议
   */
  async suggestImprovements(filePath: string): Promise<string[]> {
    const analysis = await this.analyzeFile(filePath);
    return analysis.suggestions;
  }

  // ===================== 辅助方法 =====================

  /**
   * 根据文件扩展名获取语言类型
   */
  private getLanguageFromExtension(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
    };
    return langMap[ext] ?? 'unknown';
  }

  /**
   * 计算符号统计
   */
  private calculateSymbolStats(symbols: SymbolDefinition[]): {
    total: number;
    functions: number;
    classes: number;
    interfaces: number;
    variables: number;
    constants: number;
    imports: number;
    exports: number;
  } {
    return {
      total: symbols.length,
      functions: symbols.filter(s => s.kind === 'function' || s.kind === 'method').length,
      classes: symbols.filter(s => s.kind === 'class').length,
      interfaces: symbols.filter(s => s.kind === 'interface').length,
      variables: symbols.filter(s => s.kind === 'variable').length,
      constants: symbols.filter(s => s.kind === 'constant').length,
      imports: symbols.filter(s => s.kind === 'import').length,
      exports: symbols.filter(s => s.kind === 'export').length,
    };
  }

  /**
   * 计算复杂度评分
   */
  private calculateComplexity(lines: string[], symbols: SymbolDefinition[]): number {
    let score = 0;

    // 基础复杂度：行数
    score += Math.min(lines.length / 10, 30);

    // 符号复杂度：函数数量
    const functions = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
    score += Math.min(functions.length * 2, 20);

    // 嵌套复杂度：检测嵌套层级
    let maxNesting = 0;
    let currentNesting = 0;
    for (const line of lines) {
      if (line.includes('{') || line.includes('(') || line.includes('if') || line.includes('for') || line.includes('while')) {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      }
      if (line.includes('}') || line.includes(')')) {
        currentNesting--;
      }
    }
    score += Math.min(maxNesting * 5, 30);

    // 控制流复杂度
    const controlFlowKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'try', 'catch'];
    for (const line of lines) {
      for (const keyword of controlFlowKeywords) {
        if (line.includes(keyword)) {
          score += 1;
        }
      }
    }

    return Math.min(score, 100);
  }

  /**
   * 计算可读性评分
   */
  private calculateReadability(lines: string[], symbols: SymbolDefinition[]): number {
    let score = 100;

    // 减分项：过长行
    const longLines = lines.filter(l => l.length > 120).length;
    score -= Math.min(longLines * 2, 20);

    // 减分项：过少注释
    const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length;
    const commentRatio = commentLines / lines.length;
    if (commentRatio < 0.05) {
      score -= 15;
    }

    // 减分项：符号命名不规范
    const badNames = symbols.filter(s =>
      s.name.length < 2 || s.name.includes('_') && s.language === 'typescript' || s.name.match(/^\d/)
    );
    score -= Math.min(badNames.length * 3, 15);

    // 减分项：过多参数
    for (const line of lines) {
      const paramMatch = line.match(/\(([^)]+)\)/);
      if (paramMatch && paramMatch[1].split(',').length > 5) {
        score -= 5;
      }
    }

    return Math.max(score, 0);
  }

  /**
   * 检测代码问题
   */
  private detectIssues(content: string, lines: string[], symbols: SymbolDefinition[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检测过长函数
    const functions = symbols.filter(s => s.kind === 'function');
    for (const func of functions) {
      const funcLength = this.estimateFunctionLength(lines, func.line);
      if (funcLength > 50) {
        issues.push({
          type: 'warning',
          message: `函数 ${func.name} 过长 (${funcLength} 行)，建议拆分`,
          line: func.line,
          severity: 2,
          fix: '将函数拆分为多个较小的函数',
        });
      }
    }

    // 检测 TODO/FIXME
    lines.forEach((line, idx) => {
      if (line.includes('TODO') || line.includes('FIXME')) {
        issues.push({
          type: 'info',
          message: line.trim(),
          line: idx + 1,
          severity: 3,
        });
      }
    });

    // 检测未使用的导入（简化检测）
    const importLines = lines.filter(l => l.includes('import') || l.includes('require'));
    for (const importLine of importLines) {
      const match = importLine.match(/import\s+(?:\{[^}]+\}|\w+)\s+from\s+['"]([^'"]+)['"]/);
      if (match) {
        const moduleName = match[1];
        // 简化检测：检查是否在其他地方被引用
        const usageCount = content.split(moduleName).length - 1;
        if (usageCount <= 1) {
          issues.push({
            type: 'warning',
            message: `可能未使用的导入: ${moduleName}`,
            severity: 2,
          });
        }
      }
    }

    // 检测重复代码（简化检测）
    const duplicateLines = this.findDuplicateLines(lines);
    if (duplicateLines.length > 0) {
      issues.push({
        type: 'warning',
        message: `检测到 ${duplicateLines.length} 处可能的重复代码`,
        severity: 2,
        fix: '考虑提取公共函数或组件',
      });
    }

    return issues;
  }

  /**
   * 估计函数长度
   */
  private estimateFunctionLength(lines: string[], startLine: number): number {
    let length = 0;
    let braceCount = 0;
    let started = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('{')) {
        started = true;
        braceCount += (line.match(/{/g) ?? []).length;
      }
      if (started) {
        length++;
      }
      if (line.includes('}')) {
        braceCount -= (line.match(/}/g) ?? []).length;
        if (braceCount <= 0 && started) {
          break;
        }
      }
    }

    return length;
  }

  /**
   * 查找重复行
   */
  private findDuplicateLines(lines: string[]): number[] {
    const duplicates: number[] = [];
    const seen = new Map<string, number>();

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.length > 10 && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
        if (seen.has(trimmed)) {
          duplicates.push(idx + 1);
        } else {
          seen.set(trimmed, idx);
        }
      }
    });

    return duplicates;
  }

  /**
   * 生成建议
   */
  private generateSuggestions(
    issues: CodeIssue[],
    symbolStats: { functions: number; classes: number; interfaces: number },
    complexityScore: number,
    readabilityScore: number,
  ): string[] {
    const suggestions: string[] = [];

    if (complexityScore > 70) {
      suggestions.push('文件复杂度较高，建议拆分功能到多个模块');
    }

    if (readabilityScore < 60) {
      suggestions.push('可读性较差，建议添加更多注释和文档');
    }

    if (symbolStats.functions > 20) {
      suggestions.push('函数数量较多，建议按功能分组到不同文件');
    }

    if (symbolStats.classes > 10) {
      suggestions.push('类数量较多，建议按职责分组');
    }

    for (const issue of issues.filter(i => i.type === 'warning')) {
      if (issue.fix) {
        suggestions.push(issue.fix);
      }
    }

    return suggestions.slice(0, 10);
  }

  /**
   * 分析依赖
   */
  private analyzeDependencies(content: string, language: string): {
    imports: string[];
    exports: string[];
    external: string[];
  } {
    const imports: string[] = [];
    const exports: string[] = [];
    const external: string[] = [];

    const lines = content.split('\n');

    for (const line of lines) {
      // 检测导入
      if (language === 'typescript' || language === 'javascript') {
        const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          const module = importMatch[1];
          imports.push(module);
          if (!module.startsWith('.') && !module.startsWith('/')) {
            external.push(module);
          }
        }

        // 检测导出
        const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/);
        if (exportMatch) {
          exports.push(exportMatch[1]);
        }
      }
    }

    return { imports, exports, external };
  }

  /**
   * 计算文档覆盖率
   */
  private calculateDocumentationCoverage(lines: string[], symbols: SymbolDefinition[]): number {
    if (symbols.length === 0) return 100;

    const documentedSymbols = symbols.filter(s => {
      // 检查符号上方是否有注释
      const lineIdx = s.line - 1;
      if (lineIdx > 0) {
        const prevLine = lines[lineIdx - 1].trim();
        if (prevLine.startsWith('//') || prevLine.startsWith('*') || prevLine.startsWith('#')) {
          return true;
        }
      }
      return false;
    });

    return (documentedSymbols.length / symbols.length) * 100;
  }

  /**
   * 构建依赖图
   */
  private buildDependencyGraph(analyses: FileAnalysisResult[]): {
    nodes: string[];
    edges: Array<{ from: string; to: string }>;
  } {
    const nodes: string[] = analyses.map(a => a.filePath);
    const edges: Array<{ from: string; to: string }> = [];

    for (const analysis of analyses) {
      for (const importPath of analysis.dependencies.imports) {
        // 简化处理：只处理相对路径导入
        if (importPath.startsWith('.')) {
          edges.push({
            from: analysis.filePath,
            to: importPath,
          });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 推测技术栈
   */
  private detectTechStack(files: { filePath: string; language: string }[]): string[] {
    const techStack: string[] = [];
    const languages = files.map(f => f.language);

    if (languages.includes('typescript') || languages.includes('javascript')) {
      techStack.push('Node.js');
    }
    if (languages.includes('typescript')) {
      techStack.push('TypeScript');
    }
    if (languages.includes('python')) {
      techStack.push('Python');
    }
    if (languages.includes('go')) {
      techStack.push('Go');
    }
    if (languages.includes('rust')) {
      techStack.push('Rust');
    }
    if (languages.includes('java')) {
      techStack.push('Java');
    }

    // 检测框架（基于文件名）
    const filePaths = files.map(f => f.filePath);
    if (filePaths.some(p => p.includes('react') || p.includes('React'))) {
      techStack.push('React');
    }
    if (filePaths.some(p => p.includes('vue') || p.includes('Vue'))) {
      techStack.push('Vue');
    }
    if (filePaths.some(p => p.includes('express'))) {
      techStack.push('Express');
    }
    if (filePaths.some(p => p.includes('next') || p.includes('Next'))) {
      techStack.push('Next.js');
    }

    return techStack;
  }

  /**
   * 生成项目建议
   */
  private generateProjectSuggestions(
    stats: { totalFiles: number; totalSymbols: number },
    avgComplexity: number,
    avgReadability: number,
    techStack: string[],
  ): string[] {
    const suggestions: string[] = [];

    if (avgComplexity > 50) {
      suggestions.push('项目整体复杂度较高，建议重构核心模块');
    }

    if (avgReadability < 70) {
      suggestions.push('项目整体可读性有待提升，建议增加文档和注释');
    }

    if (stats.totalFiles > 100) {
      suggestions.push('项目文件较多，建议优化目录结构');
    }

    if (techStack.length > 5) {
      suggestions.push('技术栈较多，建议统一技术选型');
    }

    return suggestions;
  }

  /**
   * 查找相关符号
   */
  private findRelatedSymbols(content: string, target: SymbolDefinition, allSymbols: SymbolDefinition[]): string[] {
    const related: string[] = [];

    // 查找同文件中同类型的符号
    const sameFileSameKind = allSymbols.filter(s =>
      s.filePath === target.filePath && s.kind === target.kind && s.name !== target.name
    );
    related.push(...sameFileSameKind.slice(0, 5).map(s => s.name));

    // 查找被引用的符号
    const references = content.split(target.name).length - 1;
    if (references > 1) {
      // 查找引用位置的符号
      for (const symbol of allSymbols) {
        if (content.includes(symbol.name) && symbol.name !== target.name) {
          related.push(symbol.name);
        }
      }
    }

    return related.slice(0, 10);
  }

  /**
   * 提取示例用法
   */
  private extractExample(content: string, symbol: SymbolDefinition): string | undefined {
    const lines = content.split('\n');

    // 查找符号定义附近的代码
    const startLine = Math.max(0, symbol.line - 2);
    const endLine = Math.min(lines.length, symbol.line + 10);

    const exampleLines = lines.slice(startLine, endLine);
    return exampleLines.join('\n').trim();
  }

  /**
   * 推断符号用途
   */
  private inferPurpose(symbol: SymbolDefinition, content: string): string {
    const purposes: Record<SymbolKind, string> = {
      function: '执行特定任务的代码块',
      method: '类或对象的行为',
      class: '封装数据和行为的模板',
      interface: '定义契约或规范',
      variable: '存储数据值',
      constant: '存储不变的值',
      enum: '定义一组命名常量',
      type_alias: '为类型定义别名',
      namespace: '组织代码的命名空间',
      module: '独立的代码单元',
      import: '引入外部依赖',
      export: '暴露内部功能',
      parameter: '函数的输入参数',
      property: '对象或类的属性',
      enum_member: '枚举的成员',
      unknown: '未定义的符号',
    };

    return purposes[symbol.kind] ?? '代码符号';
  }

  /**
   * 推断使用场景
   */
  private inferUsageScenarios(symbol: SymbolDefinition, content: string): string[] {
    const scenarios: string[] = [];

    // 基于符号类型推断
    if (symbol.kind === 'function') {
      scenarios.push('被其他函数调用');
      scenarios.push('作为事件处理器');
    }

    if (symbol.kind === 'class') {
      scenarios.push('创建实例对象');
      scenarios.push('继承或扩展');
    }

    if (symbol.kind === 'interface') {
      scenarios.push('类型约束');
      scenarios.push('实现契约');
    }

    // 基于命名推断
    if (symbol.name.includes('Handler')) {
      scenarios.push('处理特定事件或请求');
    }
    if (symbol.name.includes('Service')) {
      scenarios.push('提供业务逻辑服务');
    }
    if (symbol.name.includes('Controller')) {
      scenarios.push('控制流程和协调');
    }
    if (symbol.name.includes('Model')) {
      scenarios.push('表示数据结构');
    }
    if (symbol.name.includes('Util') || symbol.name.includes('Helper')) {
      scenarios.push('提供辅助功能');
    }

    return scenarios;
  }

  /**
   * 生成最佳实践建议
   */
  private generateBestPractices(symbol: SymbolDefinition): string[] {
    const practices: string[] = [];

    if (symbol.kind === 'function') {
      practices.push('保持函数单一职责');
      practices.push('添加清晰的参数和返回类型');
      practices.push('为复杂函数添加文档注释');
    }

    if (symbol.kind === 'class') {
      practices.push('遵循 SOLID 原则');
      practices.push('合理设计属性和方法');
      practices.push('添加构造函数文档');
    }

    if (symbol.kind === 'interface') {
      practices.push('明确定义契约');
      practices.push('保持接口简洁');
      practices.push('添加属性注释');
    }

    if (symbol.kind === 'variable' || symbol.kind === 'constant') {
      practices.push('使用有意义的命名');
      practices.push('添加类型声明');
      practices.push('添加初始化注释');
    }

    return practices;
  }
}

// ===================== 单例实例 =====================

let CODE_UNDERSTANDING_INSTANCE: CodeUnderstandingService | null = null;

/**
 * 获取代码理解服务实例
 */
export function getCodeUnderstandingService(): CodeUnderstandingService {
  if (!CODE_UNDERSTANDING_INSTANCE) {
    CODE_UNDERSTANDING_INSTANCE = new CodeUnderstandingService();
  }
  return CODE_UNDERSTANDING_INSTANCE;
}

/**
 * 重置代码理解服务（用于测试）
 */
export function resetCodeUnderstandingService(): void {
  CODE_UNDERSTANDING_INSTANCE = null;
}