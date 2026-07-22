import { logger } from '../../../../logger.js';

interface Feed {
  id: string;
  name: string;
  url: string;
  unreadCount: number;
  lastUpdated: string;
  category?: string;
}

interface Article {
  id: string;
  feedId: string;
  title: string;
  author: string;
  url: string;
  publishedAt: string;
  summary: string;
  isRead: boolean;
  tags: string[];
}

const mockFeeds: Feed[] = [
  { id: 'feed-1', name: '技术博客', url: 'https://example.com/tech.xml', unreadCount: 12, lastUpdated: '2024-01-15T10:30:00Z', category: '技术' },
  { id: 'feed-2', name: 'AI资讯', url: 'https://example.com/ai.xml', unreadCount: 5, lastUpdated: '2024-01-15T09:00:00Z', category: 'AI' },
  { id: 'feed-3', name: '产品设计', url: 'https://example.com/design.xml', unreadCount: 8, lastUpdated: '2024-01-14T16:00:00Z', category: '设计' },
];

const mockArticles: Article[] = [
  { id: 'art-1', feedId: 'feed-1', title: '2024年前端技术趋势', author: '张三', url: 'https://example.com/article1', publishedAt: '2024-01-15T08:00:00Z', summary: '本文介绍了2024年前端开发的主要技术趋势...', isRead: false, tags: ['前端', 'JavaScript'] },
  { id: 'art-2', feedId: 'feed-1', title: 'TypeScript 5.0 新特性详解', author: '李四', url: 'https://example.com/article2', publishedAt: '2024-01-14T14:00:00Z', summary: 'TypeScript 5.0 带来了许多令人兴奋的新特性...', isRead: false, tags: ['TypeScript'] },
  { id: 'art-3', feedId: 'feed-2', title: 'GPT-5 发布：AI 的下一个里程碑', author: '王五', url: 'https://example.com/article3', publishedAt: '2024-01-15T06:00:00Z', summary: 'GPT-5 的发布标志着人工智能进入了新阶段...', isRead: false, tags: ['AI', 'GPT'] },
  { id: 'art-4', feedId: 'feed-3', title: '用户体验设计的十大原则', author: '赵六', url: 'https://example.com/article4', publishedAt: '2024-01-13T10:00:00Z', summary: '优秀的用户体验设计需要遵循这些基本原则...', isRead: true, tags: ['设计', 'UX'] },
];

const feeds = [...mockFeeds];
const articles = [...mockArticles];

export function addFeed(url: string, name?: string): Feed {
  logger.debug('[blogwatcher] addFeed:', url);
  const id = `feed-${Date.now()}`;
  const newFeed: Feed = {
    id,
    name: name || url,
    url,
    unreadCount: 0,
    lastUpdated: new Date().toISOString(),
  };
  feeds.push(newFeed);
  return newFeed;
}

export function removeFeed(id: string): boolean {
  logger.debug('[blogwatcher] removeFeed:', id);
  const index = feeds.findIndex((f) => f.id === id);
  if (index !== -1) {
    feeds.splice(index, 1);
    return true;
  }
  return false;
}

export function listFeeds(): Feed[] {
  logger.debug('[blogwatcher] listFeeds');
  return feeds;
}

export function getLatestArticles(feedId?: string, limit: number = 10): Article[] {
  logger.debug('[blogwatcher] getLatestArticles feedId:', feedId, 'limit:', limit);
  let result = articles;
  if (feedId) {
    result = articles.filter((a) => a.feedId === feedId);
  }
  return result
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

export function markAsRead(articleId: string): boolean {
  logger.debug('[blogwatcher] markAsRead:', articleId);
  const article = articles.find((a) => a.id === articleId);
  if (article) {
    article.isRead = true;
    const feed = feeds.find((f) => f.id === article.feedId);
    if (feed && feed.unreadCount > 0) {
      feed.unreadCount--;
    }
    return true;
  }
  return false;
}

export function searchArticles(query: string): Article[] {
  logger.debug('[blogwatcher] searchArticles query:', query);
  const lowerQuery = query.toLowerCase();
  return articles.filter(
    (a) =>
      a.title.toLowerCase().includes(lowerQuery) ||
      a.summary.toLowerCase().includes(lowerQuery) ||
      a.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
  );
}

export default {
  name: 'blogwatcher',
  description: '订阅和监控 RSS 源、博客更新',
  tools: [
    {
      name: 'blogwatcher_addFeed',
      description: '添加 RSS 订阅源',
      handler: (args: { url: string; name?: string }) => addFeed(args.url, args.name),
    },
    {
      name: 'blogwatcher_removeFeed',
      description: '删除订阅源',
      handler: (args: { id: string }) => removeFeed(args.id),
    },
    {
      name: 'blogwatcher_listFeeds',
      description: '列出所有订阅源',
      handler: () => listFeeds(),
    },
    {
      name: 'blogwatcher_getLatest',
      description: '获取最新文章',
      handler: (args: { feedId?: string; limit?: number }) => getLatestArticles(args.feedId, args.limit),
    },
    {
      name: 'blogwatcher_markRead',
      description: '标记文章为已读',
      handler: (args: { articleId: string }) => markAsRead(args.articleId),
    },
    {
      name: 'blogwatcher_search',
      description: '搜索文章',
      handler: (args: { query: string }) => searchArticles(args.query),
    },
  ],
};
