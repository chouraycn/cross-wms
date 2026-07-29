//
// staffdeck-assets.ts — 中央图片资源索引（100% 迁移自 StaffDeck-main）
//
// 关键：Vite 只打包被 import 的图片。本文件 import 全部 StaffDeck 迁移图片，
// 保证它们 100% 进入生产 bundle 且可被任意 Staff 页面引用（<img src={...} />）。
//

// ---- 内容型图片（PNG 截图/头像/能力卡/流程图）----
import capabilitylogs from './staffdeck/capabilityLogs.png';
import capabilitytasks from './staffdeck/capabilityTasks.png';
import capabilitytools from './staffdeck/capabilityTools.png';
import loginPreview from './staffdeck/login-preview.png';
import plazaKnowledge from './staffdeck/plaza-knowledge.png';
import plazaSkill from './staffdeck/plaza-skill.png';
import plazaSop from './staffdeck/plaza-sop.png';
import plazaTool from './staffdeck/plaza-tool.png';
import sd1CardLogs from './staffdeck/sd1-card-logs.png';
import sd1CardScheduled from './staffdeck/sd1-card-scheduled.png';
import sd1CardTools from './staffdeck/sd1-card-tools.png';
import sd1Node18360 from './staffdeck/sd1-node-1-8360.png';
import sd1Node18409 from './staffdeck/sd1-node-1-8409.png';
import sd1Node18506 from './staffdeck/sd1-node-1-8506.png';
import sd1Node18604 from './staffdeck/sd1-node-1-8604.png';
import sd1Node18627 from './staffdeck/sd1-node-1-8627.png';
import sd1Node18645 from './staffdeck/sd1-node-1-8645.png';
import staffdeckAvatarAfterSales from './staffdeck/staffdeck-avatar-after-sales.png';
import staffdeckAvatarCommerce from './staffdeck/staffdeck-avatar-commerce.png';
import staffdeckAvatarDefault from './staffdeck/staffdeck-avatar-default.png';
import staffdeckAvatarKnowledge from './staffdeck/staffdeck-avatar-knowledge.png';
import staffdeckAvatarOps from './staffdeck/staffdeck-avatar-ops.png';
import staffdeckAvatarOverall from './staffdeck/staffdeck-avatar-overall.png';
import staffdeckAvatarQuality from './staffdeck/staffdeck-avatar-quality.png';
import staffdeckAvatarService from './staffdeck/staffdeck-avatar-service.png';
import staffdeckLogoMark from './staffdeck/staffdeck-logo-mark.png';
import reference from './staffdeck/cot-icons/reference.png';
import onboardingGallery from './onboarding-gallery.png';
import onboardingProfile from './onboarding-profile.png';

// ---- UI 图标（SVG）----
import advance from './staffdeck/cot-icons/advance.svg';
import execute from './staffdeck/cot-icons/execute.svg';
import generated from './staffdeck/cot-icons/generated.svg';
import judge from './staffdeck/cot-icons/judge.svg';
import loading from './staffdeck/cot-icons/loading.svg';
import select from './staffdeck/cot-icons/select.svg';
import tool from './staffdeck/cot-icons/tool.svg';
import actionChat from './icons/action-chat.svg';
import actionToggle from './icons/action-toggle.svg';
import add from './icons/add.svg';
import alignJustify from './icons/align-justify.svg';
import arrowRight from './icons/arrow-right.svg';
import capBriefcase from './icons/cap-briefcase.svg';
import capClipboard from './icons/cap-clipboard.svg';
import capFolder from './icons/cap-folder.svg';
import capMagicwand from './icons/cap-magicwand.svg';
import cardArrow from './icons/card-arrow.svg';
import chat from './icons/chat.svg';
import chevronDown from './icons/chevron-down.svg';
import edit from './icons/edit.svg';
import errorFill from './icons/error-fill.svg';
import fieldClear from './icons/field-clear.svg';
import fieldEyeOn from './icons/field-eye-on.svg';
import fieldEye from './icons/field-eye.svg';
import globe from './icons/globe.svg';
import growthArrow from './icons/growth-arrow.svg';
import headerCollapse from './icons/header-collapse.svg';
import image from './icons/image.svg';
import listBulleted from './icons/list-bulleted.svg';
import logout from './icons/logout.svg';
import more from './icons/more.svg';
import navAgents from './icons/nav-agents.svg';
import navPlatform from './icons/nav-platform.svg';
import pause from './icons/pause.svg';
import play from './icons/play.svg';
import plazaKnowledgeIcon from './icons/plaza-knowledge.svg';
import plazaSkillIcon from './icons/plaza-skill.svg';
import plazaSopIcon from './icons/plaza-sop.svg';
import plazaToolIcon from './icons/plaza-tool.svg';
import plus from './icons/plus.svg';
import profileAlarm from './icons/profile-alarm.svg';
import profileCalendar from './icons/profile-calendar.svg';
import profileFile from './icons/profile-file.svg';
import profileHistory from './icons/profile-history.svg';
import refresh from './icons/refresh.svg';
import search from './icons/search.svg';
import sort from './icons/sort.svg';
import successFill from './icons/success-fill.svg';
import sysAccounts from './icons/sys-accounts.svg';
import sysModels from './icons/sys-models.svg';
import table from './icons/table.svg';
import thumbDown from './icons/thumb-down.svg';
import thumbUp from './icons/thumb-up.svg';
import trash from './icons/trash.svg';
import viewMasonry from './icons/view-masonry.svg';
import warningFill from './icons/warning-fill.svg';
import logo from './LOGO.svg';

export const staffdeckContent = {
  capabilitylogs,
  capabilitytasks,
  capabilitytools,
  loginPreview,
  plazaKnowledge,
  plazaSkill,
  plazaSop,
  plazaTool,
  sd1CardLogs,
  sd1CardScheduled,
  sd1CardTools,
  sd1Node18360,
  sd1Node18409,
  sd1Node18506,
  sd1Node18604,
  sd1Node18627,
  sd1Node18645,
  staffdeckAvatarAfterSales,
  staffdeckAvatarCommerce,
  staffdeckAvatarDefault,
  staffdeckAvatarKnowledge,
  staffdeckAvatarOps,
  staffdeckAvatarOverall,
  staffdeckAvatarQuality,
  staffdeckAvatarService,
  staffdeckLogoMark,
  reference,
  onboardingGallery,
  onboardingProfile,
} as const;

export const staffdeckIcons = {
  advance,
  execute,
  generated,
  judge,
  loading,
  select,
  tool,
  actionChat,
  actionToggle,
  add,
  alignJustify,
  arrowRight,
  capBriefcase,
  capClipboard,
  capFolder,
  capMagicwand,
  cardArrow,
  chat,
  chevronDown,
  edit,
  errorFill,
  fieldClear,
  fieldEyeOn,
  fieldEye,
  globe,
  growthArrow,
  headerCollapse,
  image,
  listBulleted,
  logout,
  more,
  navAgents,
  navPlatform,
  pause,
  play,
  plazaKnowledge: plazaKnowledgeIcon,
  plazaSkill: plazaSkillIcon,
  plazaSop: plazaSopIcon,
  plazaTool: plazaToolIcon,
  plus,
  profileAlarm,
  profileCalendar,
  profileFile,
  profileHistory,
  refresh,
  search,
  sort,
  successFill,
  sysAccounts,
  sysModels,
  table,
  thumbDown,
  thumbUp,
  trash,
  viewMasonry,
  warningFill,
  logo,
} as const;

export type StaffdeckContentKey = keyof typeof staffdeckContent;
export type StaffdeckIconKey = keyof typeof staffdeckIcons;
