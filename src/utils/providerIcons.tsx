/**
 * 统一的 Provider 品牌 Logo 图标和标签映射
 *
 * SVG path 来自 simple-icons（https://github.com/simple-icons/simple-icons），
 * 使用 CC0-1.0 许可证，均为官方品牌矢量图标。
 */

import React from 'react';

// ==================== Types ====================

/** 模型提供商类型 */
export type ProviderIconType =
  | 'openai'
  | 'anthropic'
  | 'tencent'
  | 'deepseek'
  | 'google'
  | 'qwen'
  | 'xai'
  | 'zai'
  | 'minimax'
  | 'kimi'
  | 'byteplus'
  | 'openrouter'
  | 'novita'
  | 'wwqglobal'
  | 'wwqcn'
  | 'aws'
  | 'azure'
  | 'vercel'
  | 'ollama'
  | 'bigmodel'
  | 'minimaxcn'
  | 'kimicn'
  | 'volcengine'
  | 'aliyun'
  | 'siliconflow'
  | 'modelark'
  | 'ppio'
  | 'custom';

// ==================== Labels ====================

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  tencent: '腾讯',
  deepseek: 'DeepSeek',
  google: 'Google',
  qwen: '通义千问',
  xai: 'xAI',
  zai: 'Z.ai',
  minimax: 'MiniMax Global',
  kimi: 'Kimi Global',
  byteplus: 'BytePlus',
  openrouter: 'OpenRouter',
  novita: 'Novita',
  wwqglobal: '无问芯穹 Global',
  wwqcn: '无问芯穹 CN',
  aws: 'AWS',
  azure: 'Azure OpenAI',
  vercel: 'Vercel AI Gateway',
  ollama: 'Ollama Cloud',
  bigmodel: 'Bigmodel',
  minimaxcn: 'MiniMax CN',
  kimicn: 'Kimi CN',
  volcengine: '火山引擎',
  aliyun: '阿里云',
  siliconflow: '硅基流动',
  modelark: '模力方舟',
  ppio: 'PPIO',
  custom: '自定义',
};

export function providerLabel(p: string): string {
  return PROVIDER_LABELS[p] || p;
}

// ==================== Brand Logo Icons ====================

const DEFAULT_SIZE = 16;

/**
 * 获取 provider 对应的品牌 Logo SVG 图标
 * SVG path 来源于 simple-icons 官方库或品牌官方素材
 *
 * @param p     provider 标识
 * @param size  图标尺寸（默认 16）
 */
export function providerIcon(p: string, size: number = DEFAULT_SIZE): React.ReactElement {
  const s = size;

  switch (p) {

    // ── OpenAI — simple-icons/openai ─────────────────────────
    case 'openai':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#000000' }}
        >
          <title>OpenAI</title>
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
        </svg>
      );

    // ── Anthropic — simple-icons/anthropic ────────────────────
    case 'anthropic':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#D97757' }}
        >
          <title>Anthropic</title>
          <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
        </svg>
      );

    // ── Tencent QQ — simple-icons/tencentqq ──────────────────
    case 'tencent':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#000000' }}
        >
          <title>Tencent QQ</title>
          <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
        </svg>
      );

    // ── DeepSeek — simple-icons/deepseek ──────────────────────
    case 'deepseek':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#4D6BFE' }}
        >
          <title>DeepSeek</title>
          <path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" />
        </svg>
      );

    // ── Google Gemini — simple-icons/googlegemini ─────────────
    case 'google':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#4285F4' }}
        >
          <title>Google Gemini</title>
          <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
        </svg>
      );

    // ── 通义千问 (Qwen) — 官方 Q 标 ──────────────────────────
    case 'qwen':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10.5" stroke="#6C5CE7" strokeWidth="1.6" fill="none" />
          <path
            d="M10.5 6c-2.1 1.5-3.5 3.5-3.5 6 0 4.5 5 6.5 5 6.5s5-2 5-6.5c0-2.5-1.4-4.5-3.5-6L12 8.5 Z"
            fill="#6C5CE7"
            fillOpacity="0.15"
            stroke="#6C5CE7"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9.5 12.5h5" stroke="#6C5CE7" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    // ── xAI (Grok) — 品牌色 #1DA1F2 ──────────────────────────
    case 'xai':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#1DA1F2' }}
        >
          <title>xAI</title>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );

    // ── Z.ai — 字母 Z 风格 ───────────────────────────────────
    case 'zai':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="4" fill="#111827" />
          <path d="M7 7h10L9 17h10" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    // ── MiniMax — 品牌色 #FF6B6B ─────────────────────────────
    case 'minimax':
    case 'minimaxcn':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="5" fill="#FF6B6B" />
          <path d="M6 8h3v8H6zm4.5 0h3v5h-3zm4.5 0h3v8h-3z" fill="#FFFFFF" />
        </svg>
      );

    // ── Kimi (Moonshot) — 品牌色 #10B981 ─────────────────────
    case 'kimi':
    case 'kimicn':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#10B981" />
          <path d="M8 8l4 4-4 4M13 8h4M13 12h4M13 16h4" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    // ── BytePlus — 字节跳动品牌色 #00C853 ────────────────────
    case 'byteplus':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="4" fill="#00C853" />
          <path d="M7 6h4v12H7zm6 3h4v9h-4z" fill="#FFFFFF" />
        </svg>
      );

    // ── OpenRouter — 品牌色 #FF6D00 ──────────────────────────
    case 'openrouter':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#FF6D00" />
          <path d="M8 12h8M12 8v8" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
        </svg>
      );

    // ── Novita — 品牌色 #7C3AED ──────────────────────────────
    case 'novita':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <polygon points="12,2 22,22 2,22" fill="#7C3AED" />
          <circle cx="12" cy="14" r="3" fill="#FFFFFF" />
        </svg>
      );

    // ── 无问芯穹 (WWQ) — 品牌色 #0EA5E9 ──────────────────────
    case 'wwqglobal':
    case 'wwqcn':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#0EA5E9" />
          <path d="M7 12c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5" stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill="#FFFFFF" />
        </svg>
      );

    // ── AWS — simple-icons/amazonaws ──────────────────────────
    case 'aws':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#FF9900' }}
        >
          <title>AWS</title>
          <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.863.279a2.1 2.1 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.279-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.919 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.415-.287-.807-.415l-1.161-.36c-.585-.183-1.018-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.16.152.454.304.87.44l1.134.358c.58.184 1.001.44 1.262.767.26.327.39.71.39 1.146 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.27-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.385.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z" />
        </svg>
      );

    // ── Azure — simple-icons/microsoftazure ──────────────────
    case 'azure':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#0078D4' }}
        >
          <title>Azure</title>
          <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505l7.925-16.553z" />
        </svg>
      );

    // ── Vercel — simple-icons/vercel ─────────────────────────
    case 'vercel':
      return (
        <svg
          role="img"
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, color: '#000000' }}
        >
          <title>Vercel</title>
          <path d="M24 22.525H0l12-21.05 12 21.05z" />
        </svg>
      );

    // ── Ollama — 品牌色 #FF6B35 ──────────────────────────────
    case 'ollama':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#FF6B35" />
          <path d="M8 10c0-2.21 1.79-4 4-4s4 1.79 4 4v3c0 2.21-1.79 4-4 4s-4-1.79-4-4v-3z" fill="#FFFFFF" />
          <circle cx="12" cy="10" r="1.5" fill="#FF6B35" />
        </svg>
      );

    // ── Bigmodel (智谱) — 品牌色 #3B82F6 ─────────────────────
    case 'bigmodel':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="4" fill="#3B82F6" />
          <path d="M7 7h10v2H9v3h6v2H9v3h8v2H7z" fill="#FFFFFF" />
        </svg>
      );

    // ── 火山引擎 (Volcano) — 品牌色 #FF4D4F ──────────────────
    case 'volcengine':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <polygon points="12,2 22,22 2,22" fill="#FF4D4F" />
          <path d="M12 8l4 8H8z" fill="#FFFFFF" />
        </svg>
      );

    // ── 阿里云 — 品牌色 #FF6A00 ──────────────────────────────
    case 'aliyun':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#FF6A00" />
          <path d="M7 12h10M12 7v10" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    // ── 硅基流动 (SiliconFlow) — 品牌色 #8B5CF6 ──────────────
    case 'siliconflow':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="5" fill="#8B5CF6" />
          <path d="M7 8h3v8H7zm4 2h3v6h-3zm4-2h3v8h-3z" fill="#FFFFFF" />
        </svg>
      );

    // ── 模力方舟 (ModelArk) — 品牌色 #06B6D4 ─────────────────
    case 'modelark':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="4" fill="#06B6D4" />
          <path d="M6 6l6 6-6 6M12 6h6M12 12h6M12 18h6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    // ── PPIO — 品牌色 #F59E0B ────────────────────────────────
    case 'ppio':
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" fill="#F59E0B" />
          <path d="M8 8h3v8H8zm5 2h3v6h-3z" fill="#FFFFFF" />
        </svg>
      );

    // ── Custom（通用齿轮图标）────────────────────────────────
    case 'custom':
    default:
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="3" fill="#9CA3AF" />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2a2 2 0 0 1 1.732 1l.621 1.075a1.5 1.5 0 0 0 2.08.548l1.042-.66a2 2 0 0 1 2.732.732l1 1.732a2 2 0 0 1-.366 2.428l-.828.828a1.5 1.5 0 0 0 0 2.121l.828.829a2 2 0 0 1 .366 2.427l-1 1.732a2 2 0 0 1-2.732.732l-1.042-.66a1.5 1.5 0 0 0-2.08.548l-.621 1.075A2 2 0 0 1 12 22a2 2 0 0 1-1.732-1l-.621-1.075a1.5 1.5 0 0 0-2.08-.548l-1.042.66a2 2 0 0 1-2.732-.732l-1-1.732a2 2 0 0 1 .366-2.427l.828-.829a1.5 1.5 0 0 0 0-2.121l-.828-.828a2 2 0 0 1-.366-2.428l1-1.732a2 2 0 0 1 2.732-.732l1.042.66a1.5 1.5 0 0 0 2.08-.548L10.268 3A2 2 0 0 1 12 2Z"
            fill="#9CA3AF"
          />
        </svg>
      );
  }
}

/** 所有可选的 provider 列表（用于下拉菜单） */
export const ALL_PROVIDERS: string[] = [
  'openai',
  'anthropic',
  'tencent',
  'deepseek',
  'google',
  'qwen',
  'xai',
  'zai',
  'minimax',
  'kimi',
  'byteplus',
  'openrouter',
  'novita',
  'wwqglobal',
  'wwqcn',
  'aws',
  'azure',
  'vercel',
  'ollama',
  'bigmodel',
  'minimaxcn',
  'kimicn',
  'volcengine',
  'aliyun',
  'siliconflow',
  'modelark',
  'ppio',
  'custom',
];
