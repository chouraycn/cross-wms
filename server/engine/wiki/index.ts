/**
 * Wiki 模块 - Wiki 知识库管理
 */

export { parseMarkdown, batchIndex, extractKeywords } from '../wikiIndexer.js';
export type { MarkdownParseResult, IndexStats } from '../wikiIndexer.js';

export {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  vectorSearch,
  hybridSearch,
  getWikiStats,
} from '../wikiStore.js';

export {
  importMarkdownFile,
  importMarkdownDirectory,
  startSync,
  stopSync,
  exportToMarkdown,
} from '../wikiProvider.js';