/**
 * Keyword Trigger Engine — 关键字自动触发引擎
 *
 * 实现 AI 对话中的关键字自动启动能力：
 * 1. 从 SKILL.md frontmatter 的 `triggers` 字段提取触发关键词
 * 2. 在用户消息中进行关键词匹配（支持中英文）
 * 3. 根据匹配结果自动触发相关 Skill
 * 4. 支持配置触发阈值、匹配模式
 *
 * 核心流程：
 *   用户消息 → 关键词提取 → 匹配 Skill → 自动触发
 *
 * 配置项：
 *   - enabled: 是否启用关键词触发
 *   - threshold: 匹配阈值（0-1），超过阈值才触发
 *   - matchMode: 匹配模式（exact: 精确匹配, fuzzy: 模糊匹配, semantic: 语义匹配）
 *   - maxTriggersPerMessage: 单条消息最多触发多少个 Skill
 */

import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { SkillDiscovery } from './skillDiscovery.js';
import type { RegisteredSkill } from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 匹配模式 */
export type KeywordMatchMode = 'exact' | 'fuzzy' | 'semantic';

/** 触发配置 */
export interface KeywordTriggerConfig {
  enabled: boolean;
  threshold: number;
  matchMode: KeywordMatchMode;
  maxTriggersPerMessage: number;
  caseSensitive: boolean;
  ignoreStopWords: boolean;
  enableToolNameTrigger: boolean;
  enablePinyinMatch: boolean;
  enableSynonymMatch: boolean;
  enablePartialMatch: boolean;
}

/** 关键词触发规则 */
export interface KeywordTriggerRule {
  skillId: string;
  skillName: string;
  keywords: string[];
  toolNames: string[];
  synonyms: string[];
  pinyinKeywords: string[];
  weight: number;
  triggerWeight: number;
}

/** 触发匹配结果 */
export interface KeywordMatchResult {
  skillId: string;
  skillName: string;
  matchedKeywords: string[];
  matchScore: number;
  reason: string;
}

/** 触发上下文 */
export interface TriggerContext {
  sessionId: string;
  userId?: string;
  message: string;
  agentId?: string;
}

// ===================== 常量 =====================

/** 默认配置 */
const DEFAULT_CONFIG: KeywordTriggerConfig = {
  enabled: true,
  threshold: 0.3,
  matchMode: 'fuzzy',
  maxTriggersPerMessage: 3,
  caseSensitive: false,
  ignoreStopWords: true,
  enableToolNameTrigger: true,
  enablePinyinMatch: true,
  enableSynonymMatch: true,
  enablePartialMatch: true,
};

/** 中英文停用词 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'for',
  'with', 'by', 'as', 'at', 'be', 'this', 'that', 'it', 'from', 'has', 'have',
  'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'can',
  'not', 'but', 'if', 'then', 'else', 'its', 'your', 'you', 'we', 'our',
  'they', 'them', 'their', 'all', 'any', 'some', 'more', 'less', 'than', 'so',
  'no', 'yes', 'out', 'up', 'down', 'about', 'into', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'right',
  'now', 'new', 'old', 'first', 'last', 'long', 'little', 'own', 'right',
  'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young',
  'important', 'public', 'bad', 'same', 'able',
  '的', '了', '是', '在', '和', '与', '或', '及', '以', '为', '用', '给', '把', '被',
  '一', '个', '这', '那', '它', '从', '到', '有', '不', '也', '都', '很', '就', '还',
  '要', '会', '可以', '能', '应该', '可能', '必须', '一定', '已经', '正在', '曾经',
  '将', '会', '得', '过', '着', '了', '吗', '呢', '吧', '啊', '哦', '呀', '呢',
  '什么', '怎么', '为什么', '哪里', '谁', '几', '多少', '哪', '哪', '每', '各', '某',
  '所有', '任何', '一些', '很多', '很少', '没有', '无数', '许多', '若干', '全部',
]);

// ===================== 拼音映射表（常用字首字母） =====================

function buildPinyinInitials(): Record<string, string> {
  const pairs: Array<[string, string]> = [
    ['阿', 'a'], ['啊', 'a'], ['呵', 'a'],
    ['八', 'b'], ['把', 'b'], ['白', 'b'], ['百', 'b'], ['办', 'b'], ['半', 'b'], ['帮', 'b'], ['保', 'b'], ['报', 'b'], ['备', 'b'], ['背', 'b'], ['被', 'b'], ['本', 'b'], ['比', 'b'], ['笔', 'b'], ['必', 'b'], ['毕', 'b'], ['闭', 'b'], ['边', 'b'], ['编', 'b'], ['便', 'b'], ['变', 'b'], ['遍', 'b'], ['标', 'b'], ['表', 'b'], ['别', 'b'], ['宾', 'b'], ['兵', 'b'], ['冰', 'b'], ['并', 'b'], ['病', 'b'], ['播', 'b'], ['博', 'b'], ['补', 'b'], ['不', 'b'], ['部', 'b'],
    ['才', 'c'], ['菜', 'c'], ['参', 'c'], ['操', 'c'], ['草', 'c'], ['层', 'c'], ['查', 'c'], ['茶', 'c'], ['差', 'c'], ['长', 'c'], ['常', 'c'], ['场', 'c'], ['唱', 'c'], ['超', 'c'], ['朝', 'c'], ['车', 'c'], ['成', 'c'], ['城', 'c'], ['程', 'c'], ['称', 'c'], ['诚', 'c'], ['承', 'c'], ['吃', 'c'], ['持', 'c'], ['尺', 'c'], ['充', 'c'], ['冲', 'c'], ['虫', 'c'], ['抽', 'c'], ['仇', 'c'], ['出', 'c'], ['初', 'c'], ['除', 'c'], ['楚', 'c'], ['处', 'c'], ['传', 'c'], ['船', 'c'], ['窗', 'c'], ['床', 'c'], ['创', 'c'], ['春', 'c'], ['词', 'c'], ['辞', 'c'], ['此', 'c'], ['次', 'c'], ['从', 'c'], ['凑', 'c'], ['粗', 'c'], ['促', 'c'], ['催', 'c'], ['脆', 'c'], ['存', 'c'], ['寸', 'c'], ['错', 'c'],
    ['打', 'd'], ['大', 'd'], ['代', 'd'], ['带', 'd'], ['待', 'd'], ['袋', 'd'], ['戴', 'd'], ['单', 'd'], ['担', 'd'], ['胆', 'd'], ['但', 'd'], ['淡', 'd'], ['弹', 'd'], ['蛋', 'd'], ['当', 'd'], ['挡', 'd'], ['刀', 'd'], ['倒', 'd'], ['到', 'd'], ['道', 'd'], ['得', 'd'], ['的', 'd'], ['德', 'd'], ['灯', 'd'], ['登', 'd'], ['等', 'd'], ['低', 'd'], ['底', 'd'], ['地', 'd'], ['帝', 'd'], ['第', 'd'], ['典', 'd'], ['点', 'd'], ['电', 'd'], ['店', 'd'], ['定', 'd'], ['订', 'd'], ['丢', 'd'], ['东', 'd'], ['冬', 'd'], ['动', 'd'], ['冻', 'd'], ['洞', 'd'], ['都', 'd'], ['斗', 'd'], ['豆', 'd'], ['逗', 'd'], ['读', 'd'], ['独', 'd'], ['度', 'd'], ['渡', 'd'], ['短', 'd'], ['段', 'd'], ['断', 'd'], ['堆', 'd'], ['队', 'd'], ['对', 'd'], ['吨', 'd'], ['盾', 'd'], ['多', 'd'], ['夺', 'd'], ['朵', 'd'],
    ['饿', 'e'], ['恶', 'e'], ['恩', 'e'], ['儿', 'e'], ['而', 'e'], ['二', 'e'], ['耳', 'e'],
    ['发', 'f'], ['法', 'f'], ['帆', 'f'], ['番', 'f'], ['翻', 'f'], ['凡', 'f'], ['烦', 'f'], ['反', 'f'], ['返', 'f'], ['犯', 'f'], ['泛', 'f'], ['饭', 'f'], ['范', 'f'], ['贩', 'f'], ['方', 'f'], ['房', 'f'], ['防', 'f'], ['访', 'f'], ['放', 'f'], ['飞', 'f'], ['非', 'f'], ['肥', 'f'], ['费', 'f'], ['分', 'f'], ['纷', 'f'], ['芬', 'f'], ['粉', 'f'], ['份', 'f'], ['奋', 'f'], ['愤', 'f'], ['风', 'f'], ['封', 'f'], ['疯', 'f'], ['峰', 'f'], ['锋', 'f'], ['蜂', 'f'], ['逢', 'f'], ['凤', 'f'], ['奉', 'f'], ['佛', 'f'], ['否', 'f'], ['夫', 'f'], ['服', 'f'], ['浮', 'f'], ['福', 'f'], ['府', 'f'], ['腐', 'f'], ['父', 'f'], ['付', 'f'], ['妇', 'f'], ['负', 'f'], ['附', 'f'], ['复', 'f'], ['副', 'f'], ['富', 'f'],
    ['该', 'g'], ['改', 'g'], ['盖', 'g'], ['概', 'g'], ['干', 'g'], ['甘', 'g'], ['杆', 'g'], ['赶', 'g'], ['敢', 'g'], ['感', 'g'], ['刚', 'g'], ['钢', 'g'], ['港', 'g'], ['高', 'g'], ['搞', 'g'], ['告', 'g'], ['哥', 'g'], ['歌', 'g'], ['格', 'g'], ['个', 'g'], ['各', 'g'], ['给', 'g'], ['根', 'g'], ['跟', 'g'], ['更', 'g'], ['工', 'g'], ['公', 'g'], ['功', 'g'], ['攻', 'g'], ['供', 'g'], ['宫', 'g'], ['弓', 'g'], ['共', 'g'], ['够', 'g'], ['狗', 'g'], ['构', 'g'], ['购', 'g'], ['估', 'g'], ['姑', 'g'], ['孤', 'g'], ['古', 'g'], ['股', 'g'], ['故', 'g'], ['顾', 'g'], ['瓜', 'g'], ['刮', 'g'], ['挂', 'g'], ['乖', 'g'], ['拐', 'g'], ['怪', 'g'], ['关', 'g'], ['官', 'g'], ['观', 'g'], ['管', 'g'], ['馆', 'g'], ['惯', 'g'], ['灌', 'g'], ['光', 'g'], ['广', 'g'], ['归', 'g'], ['龟', 'g'], ['规', 'g'], ['轨', 'g'], ['鬼', 'g'], ['贵', 'g'], ['桂', 'g'], ['柜', 'g'], ['滚', 'g'], ['棍', 'g'], ['锅', 'g'], ['国', 'g'], ['果', 'g'], ['过', 'g'],
    ['哈', 'h'], ['海', 'h'], ['害', 'h'], ['含', 'h'], ['寒', 'h'], ['汉', 'h'], ['汗', 'h'], ['行', 'h'], ['好', 'h'], ['号', 'h'], ['浩', 'h'], ['喝', 'h'], ['河', 'h'], ['合', 'h'], ['何', 'h'], ['和', 'h'], ['贺', 'h'], ['黑', 'h'], ['很', 'h'], ['狠', 'h'], ['恨', 'h'], ['横', 'h'], ['红', 'h'], ['洪', 'h'], ['宏', 'h'], ['轰', 'h'], ['虹', 'h'], ['鸿', 'h'], ['后', 'h'], ['厚', 'h'], ['候', 'h'], ['乎', 'h'], ['呼', 'h'], ['忽', 'h'], ['胡', 'h'], ['湖', 'h'], ['壶', 'h'], ['糊', 'h'], ['虎', 'h'], ['互', 'h'], ['户', 'h'], ['护', 'h'], ['花', 'h'], ['华', 'h'], ['哗', 'h'], ['化', 'h'], ['画', 'h'], ['话', 'h'], ['桦', 'h'], ['怀', 'h'], ['淮', 'h'], ['坏', 'h'], ['欢', 'h'], ['还', 'h'], ['环', 'h'], ['缓', 'h'], ['换', 'h'], ['唤', 'h'], ['患', 'h'], ['荒', 'h'], ['皇', 'h'], ['黄', 'h'], ['煌', 'h'], ['晃', 'h'], ['灰', 'h'], ['挥', 'h'], ['辉', 'h'], ['回', 'h'], ['毁', 'h'], ['悔', 'h'], ['汇', 'h'], ['会', 'h'], ['绘', 'h'], ['婚', 'h'], ['魂', 'h'], ['浑', 'h'], ['混', 'h'], ['活', 'h'], ['火', 'h'], ['或', 'h'], ['货', 'h'], ['获', 'h'], ['祸', 'h'],
    ['击', 'j'], ['饥', 'j'], ['机', 'j'], ['鸡', 'j'], ['迹', 'j'], ['积', 'j'], ['基', 'j'], ['绩', 'j'], ['激', 'j'], ['及', 'j'], ['吉', 'j'], ['即', 'j'], ['极', 'j'], ['急', 'j'], ['疾', 'j'], ['集', 'j'], ['籍', 'j'], ['几', 'j'], ['己', 'j'], ['记', 'j'], ['纪', 'j'], ['技', 'j'], ['际', 'j'], ['济', 'j'], ['继', 'j'], ['寄', 'j'], ['加', 'j'], ['家', 'j'], ['佳', 'j'], ['假', 'j'], ['价', 'j'], ['架', 'j'], ['驾', 'j'], ['尖', 'j'], ['间', 'j'], ['肩', 'j'], ['艰', 'j'], ['兼', 'j'], ['监', 'j'], ['减', 'j'], ['简', 'j'], ['见', 'j'], ['件', 'j'], ['建', 'j'], ['健', 'j'], ['剑', 'j'], ['渐', 'j'], ['践', 'j'], ['鉴', 'j'], ['江', 'j'], ['将', 'j'], ['讲', 'j'], ['匠', 'j'], ['降', 'j'], ['交', 'j'], ['郊', 'j'], ['浇', 'j'], ['骄', 'j'], ['胶', 'j'], ['教', 'j'], ['接', 'j'], ['节', 'j'], ['杰', 'j'], ['洁', 'j'], ['结', 'j'], ['解', 'j'], ['姐', 'j'], ['借', 'j'], ['介', 'j'], ['界', 'j'], ['届', 'j'], ['今', 'j'], ['金', 'j'], ['津', 'j'], ['筋', 'j'], ['仅', 'j'], ['紧', 'j'], ['锦', 'j'], ['尽', 'j'], ['进', 'j'], ['近', 'j'], ['劲', 'j'], ['禁', 'j'], ['京', 'j'], ['经', 'j'], ['惊', 'j'], ['精', 'j'], ['井', 'j'], ['景', 'j'], ['警', 'j'], ['净', 'j'], ['境', 'j'], ['敬', 'j'], ['静', 'j'], ['究', 'j'], ['九', 'j'], ['久', 'j'], ['酒', 'j'], ['旧', 'j'], ['救', 'j'], ['就', 'j'], ['舅', 'j'], ['居', 'j'], ['局', 'j'], ['举', 'j'], ['具', 'j'], ['剧', 'j'], ['据', 'j'], ['距', 'j'], ['聚', 'j'], ['卷', 'j'], ['倦', 'j'], ['眷', 'j'], ['决', 'j'], ['绝', 'j'], ['觉', 'j'], ['掘', 'j'], ['嚼', 'j'],
    ['卡', 'k'], ['开', 'k'], ['凯', 'k'], ['慨', 'k'], ['刊', 'k'], ['看', 'k'], ['砍', 'k'], ['康', 'k'], ['糠', 'k'], ['扛', 'k'], ['抗', 'k'], ['考', 'k'], ['烤', 'k'], ['靠', 'k'], ['科', 'k'], ['棵', 'k'], ['颗', 'k'], ['壳', 'k'], ['可', 'k'], ['渴', 'k'], ['克', 'k'], ['刻', 'k'], ['课', 'k'], ['肯', 'k'], ['啃', 'k'], ['坑', 'k'], ['空', 'k'], ['孔', 'k'], ['恐', 'k'], ['控', 'k'], ['口', 'k'], ['扣', 'k'], ['寇', 'k'], ['枯', 'k'], ['哭', 'k'], ['苦', 'k'], ['库', 'k'], ['酷', 'k'], ['快', 'k'], ['块', 'k'], ['筷', 'k'], ['宽', 'k'], ['款', 'k'], ['匡', 'k'], ['狂', 'k'], ['框', 'k'], ['矿', 'k'], ['旷', 'k'], ['况', 'k'], ['亏', 'k'], ['葵', 'k'], ['愧', 'k'], ['溃', 'k'], ['昆', 'k'], ['捆', 'k'], ['困', 'k'], ['扩', 'k'], ['括', 'k'], ['阔', 'k'],
    ['拉', 'l'], ['啦', 'l'], ['喇', 'l'], ['腊', 'l'], ['辣', 'l'], ['来', 'l'], ['莱', 'l'], ['赖', 'l'], ['兰', 'l'], ['拦', 'l'], ['栏', 'l'], ['蓝', 'l'], ['篮', 'l'], ['烂', 'l'], ['滥', 'l'], ['狼', 'l'], ['郎', 'l'], ['朗', 'l'], ['浪', 'l'], ['劳', 'l'], ['牢', 'l'], ['老', 'l'], ['乐', 'l'], ['雷', 'l'], ['泪', 'l'], ['类', 'l'], ['累', 'l'], ['冷', 'l'], ['愣', 'l'], ['里', 'l'], ['理', 'l'], ['李', 'l'], ['立', 'l'], ['丽', 'l'], ['利', 'l'], ['例', 'l'], ['连', 'l'], ['帘', 'l'], ['莲', 'l'], ['联', 'l'], ['廉', 'l'], ['脸', 'l'], ['练', 'l'], ['炼', 'l'], ['恋', 'l'], ['良', 'l'], ['凉', 'l'], ['梁', 'l'], ['粮', 'l'], ['两', 'l'], ['亮', 'l'], ['量', 'l'], ['聊', 'l'], ['了', 'l'], ['料', 'l'], ['列', 'l'], ['烈', 'l'], ['裂', 'l'], ['林', 'l'], ['临', 'l'], ['邻', 'l'], ['灵', 'l'], ['零', 'l'], ['领', 'l'], ['令', 'l'], ['溜', 'l'], ['刘', 'l'], ['留', 'l'], ['流', 'l'], ['柳', 'l'], ['六', 'l'], ['龙', 'l'], ['聋', 'l'], ['笼', 'l'], ['隆', 'l'], ['垄', 'l'], ['楼', 'l'], ['搂', 'l'], ['漏', 'l'], ['陋', 'l'], ['芦', 'l'], ['卢', 'l'], ['炉', 'l'], ['鲁', 'l'], ['路', 'l'], ['录', 'l'], ['旅', 'l'], ['虑', 'l'], ['率', 'l'], ['绿', 'l'], ['乱', 'l'], ['掠', 'l'], ['略', 'l'], ['轮', 'l'], ['论', 'l'], ['罗', 'l'], ['萝', 'l'], ['螺', 'l'], ['裸', 'l'], ['落', 'l'],
    ['妈', 'm'], ['麻', 'm'], ['马', 'm'], ['码', 'm'], ['蚂', 'm'], ['骂', 'm'], ['吗', 'm'], ['嘛', 'm'], ['买', 'm'], ['卖', 'm'], ['麦', 'm'], ['埋', 'm'], ['满', 'm'], ['慢', 'm'], ['漫', 'm'], ['忙', 'm'], ['芒', 'm'], ['盲', 'm'], ['茫', 'm'], ['猫', 'm'], ['毛', 'm'], ['矛', 'm'], ['茅', 'm'], ['茂', 'm'], ['冒', 'm'], ['帽', 'm'], ['贸', 'm'], ['么', 'm'], ['没', 'm'], ['眉', 'm'], ['梅', 'm'], ['每', 'm'], ['美', 'm'], ['妹', 'm'], ['媚', 'm'], ['门', 'm'], ['闷', 'm'], ['们', 'm'], ['萌', 'm'], ['蒙', 'm'], ['猛', 'm'], ['梦', 'm'], ['迷', 'm'], ['谜', 'm'], ['米', 'm'], ['秘', 'm'], ['密', 'm'], ['蜜', 'm'], ['眠', 'm'], ['绵', 'm'], ['棉', 'm'], ['免', 'm'], ['勉', 'm'], ['面', 'm'], ['苗', 'm'], ['描', 'm'], ['秒', 'm'], ['妙', 'm'], ['庙', 'm'], ['灭', 'm'], ['民', 'm'], ['闽', 'm'], ['敏', 'm'], ['明', 'm'], ['鸣', 'm'], ['命', 'm'], ['摸', 'm'], ['磨', 'm'], ['模', 'm'], ['膜', 'm'], ['魔', 'm'], ['抹', 'm'], ['末', 'm'], ['莫', 'm'], ['墨', 'm'], ['默', 'm'], ['木', 'm'], ['目', 'm'], ['牧', 'm'], ['墓', 'm'], ['幕', 'm'], ['慕', 'm'], ['穆', 'm'],
    ['拿', 'n'], ['哪', 'n'], ['那', 'n'], ['呐', 'n'], ['纳', 'n'], ['乃', 'n'], ['奶', 'n'], ['耐', 'n'], ['男', 'n'], ['南', 'n'], ['难', 'n'], ['囊', 'n'], ['挠', 'n'], ['脑', 'n'], ['闹', 'n'], ['呢', 'n'], ['馁', 'n'], ['内', 'n'], ['嫩', 'n'], ['能', 'n'], ['你', 'n'], ['拟', 'n'], ['逆', 'n'], ['年', 'n'], ['念', 'n'], ['娘', 'n'], ['鸟', 'n'], ['尿', 'n'], ['捏', 'n'], ['涅', 'n'], ['您', 'n'], ['宁', 'n'], ['凝', 'n'], ['牛', 'n'], ['扭', 'n'], ['纽', 'n'], ['农', 'n'], ['浓', 'n'], ['弄', 'n'], ['奴', 'n'], ['努', 'n'], ['怒', 'n'], ['女', 'n'], ['暖', 'n'], ['诺', 'n'], ['懦', 'n'],
    ['哦', 'o'], ['欧', 'o'], ['偶', 'o'], ['呕', 'o'],
    ['怕', 'p'], ['拍', 'p'], ['排', 'p'], ['牌', 'p'], ['派', 'p'], ['攀', 'p'], ['潘', 'p'], ['盘', 'p'], ['判', 'p'], ['盼', 'p'], ['抛', 'p'], ['炮', 'p'], ['跑', 'p'], ['泡', 'p'], ['陪', 'p'], ['培', 'p'], ['赔', 'p'], ['配', 'p'], ['佩', 'p'], ['喷', 'p'], ['盆', 'p'], ['朋', 'p'], ['彭', 'p'], ['捧', 'p'], ['碰', 'p'], ['批', 'p'], ['皮', 'p'], ['疲', 'p'], ['脾', 'p'], ['匹', 'p'], ['僻', 'p'], ['片', 'p'], ['偏', 'p'], ['票', 'p'], ['飘', 'p'], ['漂', 'p'], ['瓢', 'p'], ['拼', 'p'], ['品', 'p'], ['贫', 'p'], ['频', 'p'], ['平', 'p'], ['评', 'p'], ['凭', 'p'], ['瓶', 'p'], ['苹', 'p'], ['屏', 'p'], ['坡', 'p'], ['泼', 'p'], ['婆', 'p'], ['破', 'p'], ['剖', 'p'], ['扑', 'p'], ['铺', 'p'], ['朴', 'p'], ['普', 'p'], ['谱', 'p'],
    ['七', 'q'], ['妻', 'q'], ['欺', 'q'], ['漆', 'q'], ['齐', 'q'], ['其', 'q'], ['奇', 'q'], ['骑', 'q'], ['棋', 'q'], ['旗', 'q'], ['企', 'q'], ['启', 'q'], ['起', 'q'], ['气', 'q'], ['汽', 'q'], ['弃', 'q'], ['泣', 'q'], ['器', 'q'], ['恰', 'q'], ['洽', 'q'], ['千', 'q'], ['迁', 'q'], ['牵', 'q'], ['铅', 'q'], ['谦', 'q'], ['钱', 'q'], ['前', 'q'], ['潜', 'q'], ['浅', 'q'], ['遣', 'q'], ['欠', 'q'], ['枪', 'q'], ['强', 'q'], ['墙', 'q'], ['抢', 'q'], ['敲', 'q'], ['桥', 'q'], ['瞧', 'q'], ['巧', 'q'], ['切', 'q'], ['茄', 'q'], ['且', 'q'], ['窃', 'q'], ['亲', 'q'], ['侵', 'q'], ['秦', 'q'], ['琴', 'q'], ['勤', 'q'], ['青', 'q'], ['轻', 'q'], ['氢', 'q'], ['清', 'q'], ['情', 'q'], ['晴', 'q'], ['顷', 'q'], ['请', 'q'], ['穷', 'q'], ['秋', 'q'], ['丘', 'q'], ['求', 'q'], ['球', 'q'], ['区', 'q'], ['曲', 'q'], ['取', 'q'], ['去', 'q'], ['趣', 'q'], ['圈', 'q'], ['全', 'q'], ['权', 'q'], ['拳', 'q'], ['犬', 'q'], ['缺', 'q'], ['却', 'q'], ['确', 'q'], ['鹊', 'q'], ['雀', 'q'], ['群', 'q'],
    ['然', 'r'], ['燃', 'r'], ['染', 'r'], ['让', 'r'], ['饶', 'r'], ['扰', 'r'], ['绕', 'r'], ['惹', 'r'], ['热', 'r'], ['人', 'r'], ['仁', 'r'], ['忍', 'r'], ['认', 'r'], ['任', 'r'], ['扔', 'r'], ['仍', 'r'], ['日', 'r'], ['荣', 'r'], ['容', 'r'], ['溶', 'r'], ['熔', 'r'], ['融', 'r'], ['柔', 'r'], ['肉', 'r'], ['如', 'r'], ['乳', 'r'], ['入', 'r'], ['软', 'r'], ['锐', 'r'], ['瑞', 'r'], ['润', 'r'], ['若', 'r'], ['弱', 'r'],
    ['撒', 's'], ['洒', 's'], ['萨', 's'], ['塞', 's'], ['赛', 's'], ['三', 's'], ['散', 's'], ['桑', 's'], ['丧', 's'], ['扫', 's'], ['色', 's'], ['涩', 's'], ['森', 's'], ['僧', 's'], ['沙', 's'], ['杀', 's'], ['傻', 's'], ['啥', 's'], ['晒', 's'], ['山', 's'], ['删', 's'], ['闪', 's'], ['善', 's'], ['伤', 's'], ['商', 's'], ['上', 's'], ['尚', 's'], ['裳', 's'], ['梢', 's'], ['烧', 's'], ['少', 's'], ['舌', 's'], ['蛇', 's'], ['舍', 's'], ['设', 's'], ['射', 's'], ['涉', 's'], ['社', 's'], ['申', 's'], ['伸', 's'], ['身', 's'], ['深', 's'], ['神', 's'], ['甚', 's'], ['肾', 's'], ['慎', 's'], ['升', 's'], ['生', 's'], ['声', 's'], ['牲', 's'], ['胜', 's'], ['盛', 's'], ['剩', 's'], ['尸', 's'], ['失', 's'], ['师', 's'], ['诗', 's'], ['施', 's'], ['湿', 's'], ['十', 's'], ['石', 's'], ['时', 's'], ['识', 's'], ['实', 's'], ['食', 's'], ['使', 's'], ['始', 's'], ['士', 's'], ['世', 's'], ['市', 's'], ['示', 's'], ['事', 's'], ['侍', 's'], ['饰', 's'], ['视', 's'], ['试', 's'], ['是', 's'], ['适', 's'], ['室', 's'], ['逝', 's'], ['势', 's'], ['收', 's'], ['手', 's'], ['守', 's'], ['首', 's'], ['寿', 's'], ['受', 's'], ['瘦', 's'], ['兽', 's'], ['书', 's'], ['叔', 's'], ['梳', 's'], ['舒', 's'], ['疏', 's'], ['输', 's'], ['蔬', 's'], ['熟', 's'], ['暑', 's'], ['署', 's'], ['鼠', 's'], ['属', 's'], ['术', 's'], ['束', 's'], ['树', 's'], ['竖', 's'], ['数', 's'], ['刷', 's'], ['耍', 's'], ['衰', 's'], ['摔', 's'], ['甩', 's'], ['帅', 's'], ['双', 's'], ['谁', 's'], ['水', 's'], ['睡', 's'], ['顺', 's'], ['瞬', 's'], ['说', 's'], ['硕', 's'], ['思', 's'], ['私', 's'], ['司', 's'], ['死', 's'], ['四', 's'], ['寺', 's'], ['似', 's'], ['饲', 's'], ['松', 's'], ['耸', 's'], ['送', 's'], ['宋', 's'], ['颂', 's'], ['诉', 's'], ['素', 's'], ['速', 's'], ['宿', 's'], ['肃', 's'], ['酸', 's'], ['算', 's'], ['虽', 's'], ['随', 's'], ['岁', 's'], ['碎', 's'], ['穗', 's'], ['孙', 's'], ['损', 's'], ['所', 's'], ['索', 's'], ['锁', 's'],
    ['他', 't'], ['她', 't'], ['它', 't'], ['塌', 't'], ['塔', 't'], ['踏', 't'], ['台', 't'], ['抬', 't'], ['太', 't'], ['态', 't'], ['泰', 't'], ['谈', 't'], ['弹', 't'], ['探', 't'], ['叹', 't'], ['汤', 't'], ['堂', 't'], ['糖', 't'], ['躺', 't'], ['趟', 't'], ['烫', 't'], ['涛', 't'], ['掏', 't'], ['逃', 't'], ['桃', 't'], ['淘', 't'], ['套', 't'], ['特', 't'], ['踢', 't'], ['提', 't'], ['题', 't'], ['体', 't'], ['替', 't'], ['天', 't'], ['添', 't'], ['田', 't'], ['甜', 't'], ['填', 't'], ['条', 't'], ['调', 't'], ['跳', 't'], ['贴', 't'], ['铁', 't'], ['听', 't'], ['厅', 't'], ['庭', 't'], ['通', 't'], ['同', 't'], ['童', 't'], ['统', 't'], ['痛', 't'], ['偷', 't'], ['头', 't'], ['投', 't'], ['透', 't'], ['凸', 't'], ['突', 't'], ['图', 't'], ['涂', 't'], ['途', 't'], ['兔', 't'], ['团', 't'], ['推', 't'], ['退', 't'], ['吞', 't'], ['屯', 't'], ['拖', 't'], ['托', 't'], ['脱', 't'], ['妥', 't'],
    ['挖', 'w'], ['哇', 'w'], ['蛙', 'w'], ['瓦', 'w'], ['袜', 'w'], ['歪', 'w'], ['外', 'w'], ['湾', 'w'], ['玩', 'w'], ['顽', 'w'], ['完', 'w'], ['碗', 'w'], ['挽', 'w'], ['晚', 'w'], ['万', 'w'], ['王', 'w'], ['网', 'w'], ['往', 'w'], ['望', 'w'], ['忘', 'w'], ['危', 'w'], ['威', 'w'], ['微', 'w'], ['为', 'w'], ['围', 'w'], ['违', 'w'], ['唯', 'w'], ['惟', 'w'], ['维', 'w'], ['伟', 'w'], ['伪', 'w'], ['尾', 'w'], ['纬', 'w'], ['位', 'w'], ['味', 'w'], ['胃', 'w'], ['卫', 'w'], ['未', 'w'], ['温', 'w'], ['文', 'w'], ['闻', 'w'], ['稳', 'w'], ['问', 'w'], ['翁', 'w'], ['我', 'w'], ['握', 'w'], ['窝', 'w'], ['卧', 'w'], ['乌', 'w'], ['污', 'w'], ['屋', 'w'], ['无', 'w'], ['吴', 'w'], ['五', 'w'], ['午', 'w'], ['武', 'w'], ['务', 'w'], ['物', 'w'], ['悟', 'w'], ['误', 'w'], ['雾', 'w'],
    ['夕', 'x'], ['西', 'x'], ['吸', 'x'], ['希', 'x'], ['息', 'x'], ['惜', 'x'], ['席', 'x'], ['习', 'x'], ['喜', 'x'], ['洗', 'x'], ['系', 'x'], ['戏', 'x'], ['细', 'x'], ['瞎', 'x'], ['虾', 'x'], ['峡', 'x'], ['下', 'x'], ['夏', 'x'], ['先', 'x'], ['仙', 'x'], ['鲜', 'x'], ['闲', 'x'], ['贤', 'x'], ['嫌', 'x'], ['显', 'x'], ['险', 'x'], ['现', 'x'], ['线', 'x'], ['限', 'x'], ['乡', 'x'], ['相', 'x'], ['香', 'x'], ['箱', 'x'], ['祥', 'x'], ['详', 'x'], ['想', 'x'], ['响', 'x'], ['享', 'x'], ['项', 'x'], ['象', 'x'], ['像', 'x'], ['削', 'x'], ['消', 'x'], ['销', 'x'], ['小', 'x'], ['晓', 'x'], ['笑', 'x'], ['效', 'x'], ['些', 'x'], ['鞋', 'x'], ['斜', 'x'], ['写', 'x'], ['谢', 'x'], ['新', 'x'], ['心', 'x'], ['信', 'x'], ['星', 'x'], ['兴', 'x'], ['刑', 'x'], ['形', 'x'], ['型', 'x'], ['行', 'x'], ['醒', 'x'], ['幸', 'x'], ['性', 'x'], ['姓', 'x'], ['凶', 'x'], ['兄', 'x'], ['胸', 'x'], ['雄', 'x'], ['熊', 'x'], ['休', 'x'], ['修', 'x'], ['羞', 'x'], ['秀', 'x'], ['袖', 'x'], ['绣', 'x'], ['须', 'x'], ['需', 'x'], ['虚', 'x'], ['许', 'x'], ['序', 'x'], ['绪', 'x'], ['续', 'x'], ['蓄', 'x'], ['宣', 'x'], ['悬', 'x'], ['选', 'x'], ['穴', 'x'], ['学', 'x'], ['雪', 'x'], ['血', 'x'], ['勋', 'x'], ['寻', 'x'], ['训', 'x'], ['讯', 'x'], ['迅', 'x'], ['压', 'y'], ['呀', 'y'], ['鸦', 'y'], ['牙', 'y'], ['芽', 'y'], ['哑', 'y'], ['雅', 'y'], ['亚', 'y'], ['烟', 'y'], ['言', 'y'], ['岩', 'y'], ['沿', 'y'], ['盐', 'y'], ['严', 'y'], ['颜', 'y'], ['眼', 'y'], ['演', 'y'], ['验', 'y'], ['厌', 'y'], ['雁', 'y'], ['燕', 'y'], ['央', 'y'], ['羊', 'y'], ['阳', 'y'], ['杨', 'y'], ['洋', 'y'], ['仰', 'y'], ['养', 'y'], ['样', 'y'], ['邀', 'y'], ['腰', 'y'], ['摇', 'y'], ['遥', 'y'], ['咬', 'y'], ['药', 'y'], ['要', 'y'], ['耀', 'y'], ['爷', 'y'], ['也', 'y'], ['野', 'y'], ['业', 'y'], ['叶', 'y'], ['夜', 'y'], ['液', 'y'], ['一', 'y'], ['衣', 'y'], ['医', 'y'], ['依', 'y'], ['仪', 'y'], ['宜', 'y'], ['姨', 'y'], ['遗', 'y'], ['移', 'y'], ['疑', 'y'], ['已', 'y'], ['以', 'y'], ['蚁', 'y'], ['椅', 'y'], ['义', 'y'], ['亿', 'y'], ['忆', 'y'], ['艺', 'y'], ['议', 'y'], ['亦', 'y'], ['异', 'y'], ['易', 'y'], ['疫', 'y'], ['益', 'y'], ['意', 'y'], ['毅', 'y'], ['因', 'y'], ['音', 'y'], ['阴', 'y'], ['银', 'y'], ['淫', 'y'], ['饮', 'y'], ['引', 'y'], ['印', 'y'], ['应', 'y'], ['英', 'y'], ['婴', 'y'], ['鹰', 'y'], ['迎', 'y'], ['赢', 'y'], ['影', 'y'], ['硬', 'y'], ['佣', 'y'], ['拥', 'y'], ['永', 'y'], ['勇', 'y'], ['用', 'y'], ['优', 'y'], ['忧', 'y'], ['悠', 'y'], ['尤', 'y'], ['由', 'y'], ['犹', 'y'], ['油', 'y'], ['游', 'y'], ['友', 'y'], ['有', 'y'], ['又', 'y'], ['右', 'y'], ['幼', 'y'], ['诱', 'y'], ['于', 'y'], ['余', 'y'], ['鱼', 'y'], ['愉', 'y'], ['渔', 'y'], ['娱', 'y'], ['与', 'y'], ['宇', 'y'], ['羽', 'y'], ['雨', 'y'], ['语', 'y'], ['玉', 'y'], ['育', 'y'], ['域', 'y'], ['欲', 'y'], ['御', 'y'], ['遇', 'y'], ['愈', 'y'], ['誉', 'y'], ['预', 'y'], ['寓', 'y'], ['裕', 'y'], ['元', 'y'], ['员', 'y'], ['圆', 'y'], ['园', 'y'], ['原', 'y'], ['源', 'y'], ['远', 'y'], ['院', 'y'], ['愿', 'y'], ['怨', 'y'], ['曰', 'y'], ['月', 'y'], ['阅', 'y'], ['跃', 'y'], ['越', 'y'], ['云', 'y'], ['匀', 'y'], ['允', 'y'], ['运', 'y'], ['韵', 'y'], ['孕', 'y'],
    ['杂', 'z'], ['灾', 'z'], ['栽', 'z'], ['载', 'z'], ['再', 'z'], ['在', 'z'], ['咱', 'z'], ['暂', 'z'], ['赞', 'z'], ['脏', 'z'], ['葬', 'z'], ['遭', 'z'], ['糟', 'z'], ['早', 'z'], ['枣', 'z'], ['澡', 'z'], ['灶', 'z'], ['造', 'z'], ['噪', 'z'], ['燥', 'z'], ['则', 'z'], ['择', 'z'], ['责', 'z'], ['贼', 'z'], ['怎', 'z'], ['增', 'z'], ['赠', 'z'], ['扎', 'z'], ['渣', 'z'], ['眨', 'z'], ['炸', 'z'], ['榨', 'z'], ['斋', 'z'], ['宅', 'z'], ['窄', 'z'], ['债', 'z'], ['沾', 'z'], ['粘', 'z'], ['展', 'z'], ['占', 'z'], ['战', 'z'], ['站', 'z'], ['张', 'z'], ['章', 'z'], ['掌', 'z'], ['丈', 'z'], ['帐', 'z'], ['账', 'z'], ['仗', 'z'], ['胀', 'z'], ['招', 'z'], ['找', 'z'], ['沼', 'z'], ['照', 'z'], ['罩', 'z'], ['遮', 'z'], ['折', 'z'], ['哲', 'z'], ['者', 'z'], ['这', 'z'], ['浙', 'z'], ['珍', 'z'], ['真', 'z'], ['针', 'z'], ['侦', 'z'], ['枕', 'z'], ['阵', 'z'], ['振', 'z'], ['镇', 'z'], ['正', 'z'], ['证', 'z'], ['政', 'z'], ['症', 'z'], ['之', 'z'], ['支', 'z'], ['知', 'z'], ['织', 'z'], ['直', 'z'], ['值', 'z'], ['职', 'z'], ['植', 'z'], ['殖', 'z'], ['止', 'z'], ['只', 'z'], ['旨', 'z'], ['址', 'z'], ['指', 'z'], ['纸', 'z'], ['志', 'z'], ['制', 'z'], ['质', 'z'], ['治', 'z'], ['致', 'z'], ['智', 'z'], ['置', 'z'], ['中', 'z'], ['忠', 'z'], ['终', 'z'], ['钟', 'z'], ['衷', 'z'], ['肿', 'z'], ['种', 'z'], ['重', 'z'], ['周', 'z'], ['洲', 'z'], ['州', 'z'], ['舟', 'z'], ['粥', 'z'], ['轴', 'z'], ['肘', 'z'], ['咒', 'z'], ['宙', 'z'], ['昼', 'z'], ['骤', 'z'], ['珠', 'z'], ['株', 'z'], ['蛛', 'z'], ['朱', 'z'], ['逐', 'z'], ['竹', 'z'], ['烛', 'z'], ['煮', 'z'], ['嘱', 'z'], ['主', 'z'], ['住', 'z'], ['助', 'z'], ['注', 'z'], ['驻', 'z'], ['祝', 'z'], ['筑', 'z'], ['铸', 'z'], ['抓', 'z'], ['专', 'z'], ['砖', 'z'], ['转', 'z'], ['赚', 'z'], ['庄', 'z'], ['装', 'z'], ['壮', 'z'], ['状', 'z'], ['撞', 'z'], ['追', 'z'], ['准', 'z'], ['捉', 'z'], ['桌', 'z'], ['着', 'z'], ['灼', 'z'], ['卓', 'z'], ['浊', 'z'], ['资', 'z'], ['姿', 'z'], ['滋', 'z'], ['淄', 'z'], ['孜', 'z'], ['紫', 'z'], ['字', 'z'], ['自', 'z'], ['宗', 'z'], ['综', 'z'], ['踪', 'z'], ['总', 'z'], ['纵', 'z'], ['走', 'z'], ['奏', 'z'], ['租', 'z'], ['足', 'z'], ['卒', 'z'], ['族', 'z'], ['阻', 'z'], ['组', 'z'], ['钻', 'z'], ['嘴', 'z'], ['最', 'z'], ['罪', 'z'], ['醉', 'z'], ['尊', 'z'], ['遵', 'z'], ['昨', 'z'], ['左', 'z'], ['佐', 'z'], ['做', 'z'], ['作', 'z'], ['坐', 'z'], ['座', 'z'],
  ];
  const result: Record<string, string> = {};
  for (const [char, initial] of pairs) {
    if (!(char in result)) {
      result[char] = initial;
    }
  }
  return result;
}

const PINYIN_INITIALS: Record<string, string> = buildPinyinInitials();

// ===================== 同义词词典 =====================

const SYNONYM_DICT: Record<string, string[]> = {
  '查询': ['查找', '搜索', '检索', '查', '找', '搜', '询'],
  '查找': ['查询', '搜索', '检索', '查', '找', '搜'],
  '搜索': ['查询', '查找', '检索', '搜', '寻'],
  '获取': ['得到', '获得', '取', '拿', '得到'],
  '添加': ['增加', '新增', '加', '创建', '新建'],
  '新增': ['添加', '增加', '创建', '新建'],
  '创建': ['添加', '新增', '新建', '生成'],
  '删除': ['移除', '去掉', '删', '清除'],
  '修改': ['编辑', '更改', '更新', '改'],
  '更新': ['修改', '编辑', '更改', '刷新'],
  '编辑': ['修改', '更新', '更改'],
  '查看': ['看', '浏览', '查阅', '查看详情'],
  '列表': ['清单', '目录', '一览表', '列表页'],
  '详情': ['详细信息', '详情页', '具体信息'],
  '统计': ['报表', '数据分析', '数据统计', '汇总'],
  '报表': ['统计', '报告', '数据分析'],
  '导出': ['下载', '输出', '导出数据'],
  '导入': ['上传', '输入', '导入数据'],
  '库存': ['存货', '库存量', '库存数量'],
  '入库': ['进货', '入库单', '入库操作'],
  '出库': ['发货', '出库单', '出库操作'],
  '订单': ['定单', '采购单', '销售单'],
  '客户': ['顾客', '买家', '客户信息'],
  '供应商': ['供货商', '供方', 'vendor'],
  '商品': ['产品', '货物', '物品', 'sku'],
  '仓库': ['库房', '仓储', 'warehouse'],
  '物流': ['运输', '配送', '货运'],
  '报关': ['清关', '海关申报', 'customs'],
  'hscode': ['海关编码', 'hs编码', '商品编码', '税号'],
  '海关编码': ['hscode', 'hs编码', '商品编码', '税号'],
  'hs编码': ['hscode', '海关编码', '商品编码', '税号'],
  '商品编码': ['hscode', '海关编码', 'hs编码', '税号'],
  '税号': ['hscode', '海关编码', 'hs编码', '商品编码'],
};

// ===================== 辅助函数 =====================

/**
 * 将中文字符串转换为拼音首字母
 */
function toPinyinInitials(text: string): string {
  let result = '';
  for (const char of text) {
    if (PINYIN_INITIALS[char]) {
      result += PINYIN_INITIALS[char];
    } else if (/[a-zA-Z0-9]/.test(char)) {
      result += char.toLowerCase();
    }
  }
  return result;
}

/**
 * 获取关键词的所有同义词扩展
 */
function getSynonyms(keyword: string): string[] {
  const synonyms = new Set<string>([keyword]);
  const direct = SYNONYM_DICT[keyword.toLowerCase()];
  if (direct) {
    for (const syn of direct) {
      synonyms.add(syn);
    }
  }
  for (const [key, values] of Object.entries(SYNONYM_DICT)) {
    if (values.some(v => v.toLowerCase() === keyword.toLowerCase())) {
      synonyms.add(key);
      for (const v of values) {
        synonyms.add(v);
      }
    }
  }
  return Array.from(synonyms);
}

/**
 * 从消息中提取工具名模式（如 skill_xxx_query, plugin_xxx_yyy）
 */
function extractToolNames(message: string): string[] {
  const patterns = [
    /skill_[\w_]+/gi,
    /plugin_[\w_]+/gi,
    /tool_[\w_]+/gi,
    /mcp_[\w_]+/gi,
  ];
  const toolNames = new Set<string>();
  for (const pattern of patterns) {
    const matches = message.match(pattern);
    if (matches) {
      for (const match of matches) {
        toolNames.add(match.toLowerCase());
      }
    }
  }
  return Array.from(toolNames);
}

/**
 * 计算字符串相似度（Levenshtein 距离的简化版本）
 */
function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const longerLength = longer.length;
  const ed = editDistance(longer, shorter);
  return (longerLength - ed) / longerLength;
}

/**
 * 计算 Levenshtein 编辑距离
 */
function editDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// ===================== 关键词触发引擎 =====================

export class KeywordTriggerEngine {
  /** 触发规则索引：关键词 → 规则列表 */
  private keywordIndex = new Map<string, KeywordTriggerRule[]>();

  /** 工具名索引：工具名 → 规则列表 */
  private toolNameIndex = new Map<string, KeywordTriggerRule[]>();

  /** 拼音索引：拼音首字母 → 规则列表 */
  private pinyinIndex = new Map<string, KeywordTriggerRule[]>();

  /** 同义词索引：同义词 → 规则列表 */
  private synonymIndex = new Map<string, KeywordTriggerRule[]>();

  /** Skill ID → 规则映射 */
  private skillRules = new Map<string, KeywordTriggerRule>();

  /** 配置 */
  private config: KeywordTriggerConfig = { ...DEFAULT_CONFIG };

  /** 是否已初始化 */
  private initialized = false;

  /** 触发统计 */
  private stats = {
    totalTriggers: 0,
    totalMatchAttempts: 0,
    matchSuccessCount: 0,
    skillTriggerCounts: new Map<string, number>(),
    keywordTriggerCounts: new Map<string, number>(),
    recentTriggers: [] as Array<{
      timestamp: number;
      message: string;
      skillId: string;
      skillName: string;
      matchedKeywords: string[];
      score: number;
    }>,
  };

  constructor(config?: Partial<KeywordTriggerConfig>) {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }

  // ===================== 1. 初始化与注册 =====================

  /**
   * 初始化引擎（从 Skill Registry 加载触发规则）
   */
  initialize(): void {
    if (this.initialized) {
      logger.debug('[KeywordTriggerEngine] Already initialized');
      return;
    }

    this.loadRulesFromRegistry();
    this.initialized = true;

    logger.info(`[KeywordTriggerEngine] Initialized with ${this.skillRules.size} skill rules`);
  }

  /**
   * 从 Skill Registry 加载触发规则
   */
  private loadRulesFromRegistry(): void {
    this.keywordIndex.clear();
    this.toolNameIndex.clear();
    this.pinyinIndex.clear();
    this.synonymIndex.clear();
    this.skillRules.clear();

    const skills = skillRegistry.getAllSkills();
    for (const skill of skills) {
      const rule = this.extractTriggerRule(skill);
      if (rule && (rule.keywords.length > 0 || rule.toolNames.length > 0)) {
        this.registerRule(rule);
      }
    }
  }

  /**
   * 从 Skill 定义中提取触发规则
   * 支持多种触发字段格式：
   * - trigger: "hscode"（单个触发词，OpenClaw 格式）
   * - triggers: ["hscode", "编码"]（多个触发词，标准格式）
   * - tags: ["wms", "海关"]（标签也作为关键词）
   * - name: "HS Code 助手"（技能名称）
   * - triggerWeight: 1.5（触发权重，在 SKILL.md frontmatter 中配置）
   * - toolNames: ["skill_hscode_query"]（工具名触发）
   * - synonyms: ["海关编码", "hs编码"]（同义词）
   */
  private extractTriggerRule(skill: RegisteredSkill): KeywordTriggerRule | null {
    const { definition } = skill;

    let keywords: string[] = [];
    let toolNames: string[] = [];
    let synonyms: string[] = [];

    if (definition.trigger && typeof definition.trigger === 'string') {
      keywords.push(definition.trigger);
    }

    if (definition.triggers && Array.isArray(definition.triggers)) {
      keywords = [...keywords, ...definition.triggers];
    }

    if (definition.tags && Array.isArray(definition.tags)) {
      keywords = [...keywords, ...definition.tags];
    }

    if (definition.name) {
      keywords.push(definition.name);
    }

    const defAny = definition as typeof definition & {
      toolNames?: unknown[];
      synonyms?: unknown[];
      weight?: number;
    };

    if (defAny.toolNames && Array.isArray(defAny.toolNames)) {
      toolNames = [...toolNames, ...defAny.toolNames.filter((t): t is string => typeof t === 'string')];
    }

    if (defAny.synonyms && Array.isArray(defAny.synonyms)) {
      synonyms = [...synonyms, ...defAny.synonyms.filter((s): s is string => typeof s === 'string')];
    }

    keywords = keywords.filter(k => k && k.trim().length >= 2);
    toolNames = toolNames.filter(t => t && t.trim().length >= 3);
    synonyms = synonyms.filter(s => s && s.trim().length >= 2);

    if (keywords.length === 0 && toolNames.length === 0) {
      return null;
    }

    const normalizedKeywords = keywords.map(k => this.config.caseSensitive ? k.trim() : k.trim().toLowerCase());
    const normalizedToolNames = toolNames.map(t => t.trim().toLowerCase());

    const pinyinKeywords: string[] = [];
    if (this.config.enablePinyinMatch) {
      for (const kw of normalizedKeywords) {
        const pinyin = toPinyinInitials(kw);
        if (pinyin.length >= 2) {
          pinyinKeywords.push(pinyin);
        }
      }
    }

    const triggerWeight = defAny.triggerWeight ?? defAny.weight ?? 1.0;

    return {
      skillId: definition.id,
      skillName: definition.name || definition.id,
      keywords: normalizedKeywords,
      toolNames: normalizedToolNames,
      synonyms,
      pinyinKeywords,
      weight: triggerWeight,
      triggerWeight,
    };
  }

  /**
   * 注册触发规则
   */
  registerRule(rule: KeywordTriggerRule): void {
    this.skillRules.set(rule.skillId, rule);

    for (const keyword of rule.keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      this.keywordIndex.get(keyword)!.push(rule);
    }

    if (this.config.enableToolNameTrigger) {
      for (const toolName of rule.toolNames) {
        if (!this.toolNameIndex.has(toolName)) {
          this.toolNameIndex.set(toolName, []);
        }
        this.toolNameIndex.get(toolName)!.push(rule);
      }
    }

    if (this.config.enablePinyinMatch) {
      for (const pinyin of rule.pinyinKeywords) {
        if (!this.pinyinIndex.has(pinyin)) {
          this.pinyinIndex.set(pinyin, []);
        }
        this.pinyinIndex.get(pinyin)!.push(rule);
      }
    }

    if (this.config.enableSynonymMatch) {
      const allSynonyms = new Set<string>();
      for (const kw of rule.keywords) {
        for (const syn of getSynonyms(kw)) {
          allSynonyms.add(syn.toLowerCase());
        }
      }
      for (const syn of rule.synonyms) {
        allSynonyms.add(syn.toLowerCase());
      }
      for (const syn of allSynonyms) {
        if (!this.synonymIndex.has(syn)) {
          this.synonymIndex.set(syn, []);
        }
        this.synonymIndex.get(syn)!.push(rule);
      }
    }

    logger.debug(`[KeywordTriggerEngine] Registered rule for skill "${rule.skillName}" with ${rule.keywords.length} keywords, ${rule.toolNames.length} toolNames`);
  }

  /**
   * 注销触发规则
   */
  unregisterRule(skillId: string): void {
    const rule = this.skillRules.get(skillId);
    if (!rule) return;

    for (const keyword of rule.keywords) {
      const rules = this.keywordIndex.get(keyword);
      if (rules) {
        this.keywordIndex.set(keyword, rules.filter(r => r.skillId !== skillId));
      }
    }

    for (const toolName of rule.toolNames) {
      const rules = this.toolNameIndex.get(toolName);
      if (rules) {
        this.toolNameIndex.set(toolName, rules.filter(r => r.skillId !== skillId));
      }
    }

    for (const pinyin of rule.pinyinKeywords) {
      const rules = this.pinyinIndex.get(pinyin);
      if (rules) {
        this.pinyinIndex.set(pinyin, rules.filter(r => r.skillId !== skillId));
      }
    }

    if (this.synonymIndex.size > 0) {
      for (const [syn, rules] of this.synonymIndex.entries()) {
        const filtered = rules.filter(r => r.skillId !== skillId);
        if (filtered.length === 0) {
          this.synonymIndex.delete(syn);
        } else {
          this.synonymIndex.set(syn, filtered);
        }
      }
    }

    this.skillRules.delete(skillId);
    logger.debug(`[KeywordTriggerEngine] Unregistered rule for skill "${skillId}"`);
  }

  /**
   * 刷新规则（重新从 Registry 加载）
   */
  refreshRules(): void {
    logger.debug('[KeywordTriggerEngine] Refreshing rules...');
    this.loadRulesFromRegistry();
  }

  // ===================== 2. 关键词匹配 =====================

  /**
   * 从消息中提取关键词
   */
  extractKeywords(message: string): string[] {
    const text = this.config.caseSensitive ? message : message.toLowerCase();
    const tokens: string[] = [];

    const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
    const englishPattern = /[a-z0-9_-]{2,}/gi;

    let match;
    while ((match = chinesePattern.exec(text)) !== null) {
      tokens.push(match[0]);
    }

    englishPattern.lastIndex = 0;
    while ((match = englishPattern.exec(text)) !== null) {
      tokens.push(match[0]);
    }

    if (this.config.ignoreStopWords) {
      return tokens.filter(t => !STOP_WORDS.has(t.toLowerCase()));
    }

    return tokens;
  }

  /**
   * 匹配消息中的关键词，返回匹配的 Skill
   * 支持多种匹配方式：关键词匹配、工具名匹配、拼音匹配、同义词匹配、部分匹配
   */
  matchMessage(message: string, context?: TriggerContext): KeywordMatchResult[] {
    if (!this.config.enabled) {
      return [];
    }

    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const keywords = this.extractKeywords(message);
    const toolNames = this.config.enableToolNameTrigger ? extractToolNames(message) : [];

    if (keywords.length === 0 && toolNames.length === 0) {
      return [];
    }

    const results: KeywordMatchResult[] = [];
    const matchedSkillIds = new Set<string>();
    const scoreMap = new Map<string, { score: number; matchedKeywords: string[]; matchTypes: string[] }>();

    const addMatch = (
      rule: KeywordTriggerRule,
      score: number,
      matchedKeyword: string,
      matchType: string
    ) => {
      if (matchedSkillIds.has(rule.skillId)) {
        const existing = scoreMap.get(rule.skillId)!;
        if (score > existing.score) {
          existing.score = score;
        }
        if (!existing.matchedKeywords.includes(matchedKeyword)) {
          existing.matchedKeywords.push(matchedKeyword);
        }
        if (!existing.matchTypes.includes(matchType)) {
          existing.matchTypes.push(matchType);
        }
        return;
      }

      matchedSkillIds.add(rule.skillId);
      scoreMap.set(rule.skillId, {
        score,
        matchedKeywords: [matchedKeyword],
        matchTypes: [matchType],
      });
    };

    // 1. 工具名精确匹配（最高优先级）
    if (this.config.enableToolNameTrigger && toolNames.length > 0) {
      for (const toolName of toolNames) {
        const rules = this.toolNameIndex.get(toolName) ?? [];
        for (const rule of rules) {
          const score = Math.min(1.0, 0.95 * rule.triggerWeight);
          addMatch(rule, score, toolName, 'tool_name');
        }
      }
    }

    // 2. 关键词精确匹配
    for (const keyword of keywords) {
      const rules = this.keywordIndex.get(keyword) ?? [];
      for (const rule of rules) {
        const score = this.computeMatchScore(keyword, rule, message);
        if (score >= this.config.threshold) {
          addMatch(rule, score, keyword, 'keyword');
        }
      }
    }

    // 3. 拼音匹配
    if (this.config.enablePinyinMatch && this.pinyinIndex.size > 0) {
      const messagePinyin = toPinyinInitials(lowerMessage);
      for (const [pinyin, rules] of this.pinyinIndex.entries()) {
        if (messagePinyin.includes(pinyin)) {
          for (const rule of rules) {
            if (matchedSkillIds.has(rule.skillId)) continue;
            const pinyinScore = (0.5 + 0.2 * (pinyin.length / 8)) * rule.triggerWeight;
            if (pinyinScore >= this.config.threshold) {
              addMatch(rule, pinyinScore, pinyin, 'pinyin');
            }
          }
        }
      }
    }

    // 4. 同义词匹配
    if (this.config.enableSynonymMatch && this.synonymIndex.size > 0) {
      for (const keyword of keywords) {
        const synonyms = getSynonyms(keyword);
        for (const syn of synonyms) {
          const rules = this.synonymIndex.get(syn.toLowerCase()) ?? [];
          for (const rule of rules) {
            if (matchedSkillIds.has(rule.skillId)) continue;
            const synScore = 0.7 * rule.triggerWeight;
            if (synScore >= this.config.threshold) {
              addMatch(rule, synScore, syn, 'synonym');
            }
          }
        }
      }
    }

    // 5. 部分匹配（字符串包含匹配）
    if (this.config.enablePartialMatch) {
      for (const keyword of keywords) {
        for (const rule of this.skillRules.values()) {
          if (matchedSkillIds.has(rule.skillId)) continue;
          for (const kw of rule.keywords) {
            const partialMatch = 
              kw.includes(keyword) || 
              keyword.includes(kw) ||
              stringSimilarity(keyword, kw) >= 0.6;
            if (partialMatch) {
              const similarity = stringSimilarity(keyword, kw);
              const partialScore = (0.4 + similarity * 0.4) * rule.triggerWeight;
              if (partialScore >= this.config.threshold) {
                addMatch(rule, partialScore, kw, 'partial');
                break;
              }
            }
          }
        }
      }
    }

    // 构建结果列表
    for (const [skillId, data] of scoreMap.entries()) {
      const rule = this.skillRules.get(skillId);
      if (!rule) continue;
      results.push({
        skillId,
        skillName: rule.skillName,
        matchedKeywords: data.matchedKeywords,
        matchScore: Math.min(1.0, data.score),
        reason: this.buildReason(rule, data.matchedKeywords, data.score, data.matchTypes),
      });
    }

    results.sort((a, b) => b.matchScore - a.matchScore);
    const finalResults = results.slice(0, this.config.maxTriggersPerMessage);

    this.stats.totalMatchAttempts++;
    if (finalResults.length > 0) {
      this.stats.matchSuccessCount++;
      for (const match of finalResults) {
        this.stats.totalTriggers++;
        this.stats.skillTriggerCounts.set(match.skillId, (this.stats.skillTriggerCounts.get(match.skillId) || 0) + 1);
        for (const kw of match.matchedKeywords) {
          this.stats.keywordTriggerCounts.set(kw, (this.stats.keywordTriggerCounts.get(kw) || 0) + 1);
        }
        this.stats.recentTriggers.unshift({
          timestamp: Date.now(),
          message: message.substring(0, 100),
          skillId: match.skillId,
          skillName: match.skillName,
          matchedKeywords: match.matchedKeywords,
          score: match.matchScore,
        });
        if (this.stats.recentTriggers.length > 50) {
          this.stats.recentTriggers.pop();
        }
      }
    }

    return finalResults;
  }

  /**
   * 检查关键词是否是完整单词（词边界检查）
   */
  private isFullWordMatch(keyword: string, message: string): boolean {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    
    const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9\u4e00-\u9fa5_-])${lowerKeyword}(?:$|\\s|[^a-zA-Z0-9\u4e00-\u9fa5_-])`, 'g');
    return regex.test(lowerMessage);
  }

  /**
   * 计算关键词在消息中的位置权重（开头权重更高）
   */
  private computePositionWeight(keyword: string, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    const index = lowerMessage.indexOf(lowerKeyword);
    
    if (index === -1) return 0;
    if (index === 0) return 0.3;
    if (index < message.length * 0.3) return 0.2;
    if (index < message.length * 0.5) return 0.1;
    return 0;
  }

  /**
   * 计算匹配分数
   */
  private computeMatchScore(keyword: string, rule: KeywordTriggerRule, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    let score = 0;

    switch (this.config.matchMode) {
      case 'exact':
        if (this.isFullWordMatch(keyword, message)) {
          score = 1.0;
        } else if (lowerMessage.includes(keyword)) {
          score = 0.7;
        }
        break;

      case 'fuzzy':
        const matchedCount = rule.keywords.filter(k => lowerMessage.includes(k)).length;
        const matchedKeywords = rule.keywords.filter(k => lowerMessage.includes(k));
        
        if (matchedCount === 0) {
          score = 0;
          break;
        }
        
        const matchRatio = matchedCount / rule.keywords.length;
        let baseScore = Math.max(0.3, matchRatio) * rule.weight;
        
        for (const mk of matchedKeywords) {
          baseScore += this.computePositionWeight(mk, message);
        }
        
        if (this.isFullWordMatch(keyword, message)) {
          baseScore += 0.2;
        } else if (lowerMessage.includes(keyword)) {
          baseScore += 0.1;
        }
        
        score = Math.min(1.0, baseScore);
        break;

      case 'semantic':
        score = this.computeSemanticScore(rule, message);
        break;
    }

    return score;
  }

  /**
   * 计算语义匹配分数（简化版）
   */
  private computeSemanticScore(rule: KeywordTriggerRule, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const matchedCount = rule.keywords.filter(k => lowerMessage.includes(k)).length;

    if (matchedCount === 0) return 0;

    const baseScore = matchedCount / rule.keywords.length;

    let contextBonus = 0;
    const skillTerms = [...rule.keywords, rule.skillName.toLowerCase()];
    for (const term of skillTerms) {
      if (term.length >= 3 && lowerMessage.includes(term)) {
        contextBonus += 0.1;
      }
    }

    return Math.min(1.0, baseScore + contextBonus) * rule.weight;
  }

  /**
   * 找出匹配的关键词列表
   */
  private findMatchingKeywords(rule: KeywordTriggerRule, message: string): string[] {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    return rule.keywords.filter(k => lowerMessage.includes(k));
  }

  /**
   * 构建匹配理由
   */
  private buildReason(rule: KeywordTriggerRule, matchedKeywords: string[], score: number, matchTypes?: string[]): string {
    const parts: string[] = [];

    if (matchedKeywords.length > 0) {
      parts.push(`匹配关键词: ${matchedKeywords.join(', ')}`);
    }

    if (matchTypes && matchTypes.length > 0) {
      const typeLabels: Record<string, string> = {
        'tool_name': '工具名',
        'keyword': '关键词',
        'pinyin': '拼音',
        'synonym': '同义词',
        'partial': '部分匹配',
      };
      const typeNames = matchTypes.map(t => typeLabels[t] || t).join(', ');
      parts.push(`匹配方式: ${typeNames}`);
    }

    parts.push(`匹配模式: ${this.config.matchMode}`);
    parts.push(`触发权重: ${rule.triggerWeight.toFixed(2)}`);
    parts.push(`匹配分数: ${score.toFixed(2)}`);
    parts.push(`阈值: ${this.config.threshold}`);

    return parts.join('; ');
  }

  // ===================== 3. 触发执行 =====================

  /**
   * 执行匹配到的 Skill（返回触发结果，由上层决定是否实际执行）
   */
  async triggerMatchedSkills(
    message: string,
    context: TriggerContext,
  ): Promise<Array<{ result: KeywordMatchResult; skill?: RegisteredSkill }>> {
    const matches = this.matchMessage(message, context);
    if (matches.length === 0) {
      return [];
    }

    const results: Array<{ result: KeywordMatchResult; skill?: RegisteredSkill }> = [];

    for (const match of matches) {
      const skill = skillRegistry.getSkill(match.skillId);

      if (skill) {
        logger.info(`[KeywordTriggerEngine] Triggering skill "${match.skillName}" for message: "${message.substring(0, 50)}..."`);
        logger.debug(`[KeywordTriggerEngine] Trigger reason: ${match.reason}`);
      }

      results.push({
        result: match,
        skill,
      });
    }

    return results;
  }

  // ===================== 4. 配置管理 =====================

  /**
   * 获取当前配置
   */
  getConfig(): KeywordTriggerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<KeywordTriggerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`[KeywordTriggerEngine] Config updated: ${JSON.stringify(this.config)}`);

    if (!this.config.caseSensitive) {
      this.refreshRules();
    }
  }

  /**
   * 启用/禁用关键词触发
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`[KeywordTriggerEngine] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalRules: number;
    totalKeywords: number;
    totalToolNames: number;
    totalPinyinKeywords: number;
    totalSynonyms: number;
    totalTriggers: number;
    totalMatchAttempts: number;
    matchSuccessCount: number;
    matchSuccessRate: number;
    skillTriggerCounts: Record<string, number>;
    keywordTriggerCounts: Record<string, number>;
    topSkills: Array<{ skillId: string; skillName: string; count: number }>;
    topKeywords: Array<{ keyword: string; count: number }>;
    recentTriggers: Array<{
      timestamp: number;
      message: string;
      skillId: string;
      skillName: string;
      matchedKeywords: string[];
      score: number;
    }>;
    config: KeywordTriggerConfig;
    skillRules: Array<{
      skillId: string;
      skillName: string;
      keywords: string[];
      toolNames: string[];
      triggerWeight: number;
    }>;
  } {
    const skillCounts = Array.from(this.stats.skillTriggerCounts.entries())
      .map(([skillId, count]) => ({
        skillId,
        skillName: this.skillRules.get(skillId)?.skillName || skillId,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const keywordCounts = Array.from(this.stats.keywordTriggerCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const rulesList = Array.from(this.skillRules.values()).map(rule => ({
      skillId: rule.skillId,
      skillName: rule.skillName,
      keywords: rule.keywords,
      toolNames: rule.toolNames,
      triggerWeight: rule.triggerWeight,
    }));

    return {
      totalRules: this.skillRules.size,
      totalKeywords: this.keywordIndex.size,
      totalToolNames: this.toolNameIndex.size,
      totalPinyinKeywords: this.pinyinIndex.size,
      totalSynonyms: this.synonymIndex.size,
      totalTriggers: this.stats.totalTriggers,
      totalMatchAttempts: this.stats.totalMatchAttempts,
      matchSuccessCount: this.stats.matchSuccessCount,
      matchSuccessRate: this.stats.totalMatchAttempts > 0
        ? this.stats.matchSuccessCount / this.stats.totalMatchAttempts
        : 0,
      skillTriggerCounts: Object.fromEntries(this.stats.skillTriggerCounts),
      keywordTriggerCounts: Object.fromEntries(this.stats.keywordTriggerCounts),
      topSkills: skillCounts,
      topKeywords: keywordCounts,
      recentTriggers: this.stats.recentTriggers,
      config: this.getConfig(),
      skillRules: rulesList,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalTriggers: 0,
      totalMatchAttempts: 0,
      matchSuccessCount: 0,
      skillTriggerCounts: new Map<string, number>(),
      keywordTriggerCounts: new Map<string, number>(),
      recentTriggers: [],
    };
    logger.info('[KeywordTriggerEngine] Stats reset');
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 检查单个关键词是否匹配
   */
  matchesKeyword(keyword: string, message: string): boolean {
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    return lowerMessage.includes(lowerKeyword);
  }

  /**
   * 获取所有已注册的关键词
   */
  getAllKeywords(): string[] {
    return Array.from(this.keywordIndex.keys());
  }

  /**
   * 获取所有已注册的工具名
   */
  getAllToolNames(): string[] {
    return Array.from(this.toolNameIndex.keys());
  }

  /**
   * 获取所有已注册的拼音关键词
   */
  getAllPinyinKeywords(): string[] {
    return Array.from(this.pinyinIndex.keys());
  }

  /**
   * 获取所有已注册的同义词
   */
  getAllSynonyms(): string[] {
    return Array.from(this.synonymIndex.keys());
  }

  /**
   * 获取指定 Skill 的触发规则
   */
  getRuleBySkillId(skillId: string): KeywordTriggerRule | undefined {
    return this.skillRules.get(skillId);
  }

  /**
   * 获取所有触发规则
   */
  getAllRules(): KeywordTriggerRule[] {
    return Array.from(this.skillRules.values());
  }

  /**
   * 手动添加同义词（运行时扩展）
   */
  addSynonym(keyword: string, synonym: string): void {
    const lowerKeyword = keyword.toLowerCase();
    const lowerSynonym = synonym.toLowerCase();

    const rules = this.keywordIndex.get(lowerKeyword) ?? [];
    for (const rule of rules) {
      if (!this.synonymIndex.has(lowerSynonym)) {
        this.synonymIndex.set(lowerSynonym, []);
      }
      if (!this.synonymIndex.get(lowerSynonym)!.includes(rule)) {
        this.synonymIndex.get(lowerSynonym)!.push(rule);
      }
    }

    logger.debug(`[KeywordTriggerEngine] Added synonym "${synonym}" for keyword "${keyword}"`);
  }
}

// ===================== 单例导出 =====================

const KEYWORD_TRIGGER_ENGINE_INSTANCE = new KeywordTriggerEngine();

export function getKeywordTriggerEngine(): KeywordTriggerEngine {
  return KEYWORD_TRIGGER_ENGINE_INSTANCE;
}

export function initKeywordTriggerEngine(config?: Partial<KeywordTriggerConfig>): void {
  if (config) {
    KEYWORD_TRIGGER_ENGINE_INSTANCE.updateConfig(config);
  }
  KEYWORD_TRIGGER_ENGINE_INSTANCE.initialize();
}

