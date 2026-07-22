import { logger } from '../../../../logger.js';

interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  size: number;
  tags: string[];
  source: string;
  rating: string;
}

interface GifSearchResult {
  query: string;
  results: GifItem[];
  totalCount: number;
  offset: number;
  limit: number;
}

const mockGifs: GifItem[] = [
  { id: 'gif-001', title: '开心庆祝', url: 'https://example.com/gif/celebrate.gif', previewUrl: 'https://example.com/gif/celebrate-preview.gif', width: 480, height: 270, size: 1024000, tags: ['庆祝', '开心', 'party'], source: 'giphy', rating: 'g' },
  { id: 'gif-002', title: '猫咪打滚', url: 'https://example.com/gif/cat-roll.gif', previewUrl: 'https://example.com/gif/cat-roll-preview.gif', width: 320, height: 320, size: 850000, tags: ['猫', '可爱', '动物'], source: 'tenor', rating: 'g' },
  { id: 'gif-003', title: '点头赞同', url: 'https://example.com/gif/nodding.gif', previewUrl: 'https://example.com/gif/nodding-preview.gif', width: 400, height: 300, size: 520000, tags: ['赞同', '点头', 'yes'], source: 'giphy', rating: 'g' },
  { id: 'gif-004', title: '编程抓狂', url: 'https://example.com/gif/coding-mad.gif', previewUrl: 'https://example.com/gif/coding-mad-preview.gif', width: 500, height: 280, size: 1200000, tags: ['编程', '抓狂', 'bug'], source: 'tenor', rating: 'pg' },
  { id: 'gif-005', title: '鼓掌欢呼', url: 'https://example.com/gif/applause.gif', previewUrl: 'https://example.com/gif/applause-preview.gif', width: 450, height: 250, size: 780000, tags: ['鼓掌', '欢呼', '赞'], source: 'giphy', rating: 'g' },
  { id: 'gif-006', title: '狗狗摇尾巴', url: 'https://example.com/gif/dog-tail.gif', previewUrl: 'https://example.com/gif/dog-tail-preview.gif', width: 350, height: 350, size: 920000, tags: ['狗', '可爱', '动物'], source: 'tenor', rating: 'g' },
  { id: 'gif-007', title: '咖啡提神', url: 'https://example.com/gif/coffee.gif', previewUrl: 'https://example.com/gif/coffee-preview.gif', width: 300, height: 300, size: 450000, tags: ['咖啡', '工作', '提神'], source: 'giphy', rating: 'g' },
  { id: 'gif-008', title: '思考中', url: 'https://example.com/gif/thinking.gif', previewUrl: 'https://example.com/gif/thinking-preview.gif', width: 280, height: 280, size: 380000, tags: ['思考', '疑惑', 'hmm'], source: 'tenor', rating: 'g' },
];

const categories = ['搞笑', '动物', '反应', '动漫', '电影', '体育', '音乐', '游戏', '表情', '庆祝'];

export function searchGifs(query: string, limit: number = 10, offset: number = 0): GifSearchResult {
  logger.debug('[gifgrep] searchGifs query:', query, 'limit:', limit);
  const lowerQuery = query.toLowerCase();
  const filtered = mockGifs.filter(
    (g) =>
      g.title.toLowerCase().includes(lowerQuery) ||
      g.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
  );

  return {
    query,
    results: filtered.slice(offset, offset + limit),
    totalCount: filtered.length,
    offset,
    limit,
  };
}

export function getTrendingGifs(limit: number = 10): GifSearchResult {
  logger.debug('[gifgrep] getTrendingGifs limit:', limit);
  return {
    query: 'trending',
    results: mockGifs.slice(0, limit),
    totalCount: mockGifs.length,
    offset: 0,
    limit,
  };
}

export function getRandomGif(tag?: string): GifItem {
  logger.debug('[gifgrep] getRandomGif tag:', tag);
  let pool = mockGifs;
  if (tag) {
    const lowerTag = tag.toLowerCase();
    pool = mockGifs.filter((g) => g.tags.some((t) => t.toLowerCase().includes(lowerTag)));
  }
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] || mockGifs[0];
}

export function getGifById(id: string): GifItem | null {
  logger.debug('[gifgrep] getGifById:', id);
  return mockGifs.find((g) => g.id === id) || null;
}

export function getCategories(): string[] {
  logger.debug('[gifgrep] getCategories');
  return categories;
}

export default {
  name: 'gifgrep',
  description: '搜索 GIF 动图',
  tools: [
    {
      name: 'gifgrep_search',
      description: '搜索 GIF',
      handler: (args: { query: string; limit?: number; offset?: number }) =>
        searchGifs(args.query, args.limit, args.offset),
    },
    {
      name: 'gifgrep_trending',
      description: '热门 GIF',
      handler: (args: { limit?: number }) => getTrendingGifs(args.limit),
    },
    {
      name: 'gifgrep_random',
      description: '随机 GIF',
      handler: (args: { tag?: string }) => getRandomGif(args.tag),
    },
    {
      name: 'gifgrep_getById',
      description: '按 ID 获取 GIF',
      handler: (args: { id: string }) => getGifById(args.id),
    },
    {
      name: 'gifgrep_categories',
      description: '获取分类列表',
      handler: () => getCategories(),
    },
  ],
};
