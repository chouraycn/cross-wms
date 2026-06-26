/**
 * 轻量版模型选择器 — 纯 CSS + React，无 MUI 依赖
 * 对齐旧版 ChatToolbar ModelSelector 样式
 */
import React, { useRef, useEffect } from 'react';

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
  capabilities?: string[];
  isDefault?: boolean;
  enabled?: boolean;
}

interface Props {
  anchorEl: HTMLElement | null;
  selectedModel: string;
  modelOptions: ModelOption[];
  onSelect: (modelId: string) => void;
  onClose: () => void;
  onOpenSettings?: () => void;
  modelsLoading?: boolean;
}

// Provider SVG icons (aligned with old version)
const ProviderIcons: Record<string, React.ReactNode> = {
  openai: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
    </svg>
  ),
  anthropic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L8.928 3.541zm-.264 10.656l2.088-5.496 2.088 5.496z"/>
    </svg>
  ),
  deepseek: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12.69 12.69 0 0 0-2.278-1.455c-.422-.204-.852-.39-1.293-.548-.313-.11-.632-.191-.953-.261-.266-.058-.533-.1-.8-.143-.2-.032-.4-.065-.6-.065-.2 0-.4.033-.6.065-.267.043-.534.085-.8.143-.321.07-.64.151-.953.261-.441.158-.871.344-1.293.548a12.69 12.69 0 0 0-2.278 1.455c-.966.717-1.74 1.632-2.597 2.46a5.5 5.5 0 0 1-1.737 1.179c-.191.078-.273.039-.328-.14-.086-.28-.184-.553-.266-.833-.043-.136-.008-.229.129-.323 1.205-.813 1.811-1.957 1.838-3.393.012-.638-.109-1.268-.422-1.84-.078-.14-.156-.307-.356-.276-.183.027-.238.19-.293.35-.086.265-.133.534-.305.774-.247.339-.603.495-.955.65-.672.3-1.114.766-1.247 1.548-.626-.634-1.334-.894-2.163-.848-.567.031-1.001-.229-1.373-.626-.043-.047-.086-.097-.137-.137-.148-.12-.258-.357-.512-.233-.254.124-.18.379-.129.55.051.171.137.323.219.475.137.266.289.526.441.786.266.453.555.894.859 1.323.422.604.875 1.184 1.359 1.739.266.302.547.59.844.864.297.274.609.534.938.768.297.219.609.421.938.604.297.171.609.325.938.465.297.133.609.249.938.356.297.102.609.187.938.261.297.071.609.124.938.171.297.047.609.078.938.109.297.031.609.047.938.062.297.016.609.016.938.016.297 0 .609 0 .938-.016.297-.015.609-.031.938-.062.297-.031.609-.062.938-.109.297-.047.609-.1.938-.171.297-.074.609-.159.938-.261.297-.107.609-.223.938-.356.297-.14.609-.294.938-.465.297-.183.609-.385.938-.604.297-.234.609-.494.938-.768.297-.274.578-.562.844-.864.484-.555.937-1.135 1.359-1.739.304-.429.593-.87.859-1.323.152-.26.304-.52.441-.786.082-.152.168-.304.219-.475.051-.171.125-.426-.129-.55z"/>
    </svg>
  ),
  kimi: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="5" fill="#1E1B4B"/>
      <path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.133a.158.158 0 01-.023-.205z" fill="white"/>
    </svg>
  ),
  ollama: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  ),
};

const ACCENT = '#F97316';

export const ModelSelectorLite: React.FC<Props> = ({
  anchorEl,
  selectedModel,
  modelOptions,
  onSelect,
  onClose,
  onOpenSettings,
  modelsLoading = false,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const autoOption = modelOptions.find(o => o.provider === 'auto');
  const otherOptions = modelOptions.filter(o => o.provider !== 'auto');

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (anchorEl && !anchorEl.contains(e.target as Node) && listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const anchorRect = anchorEl.getBoundingClientRect();
  const popupWidth = 320;
  const popupLeft = Math.max(8, anchorRect.right - popupWidth);

  const isAutoSelected = selectedModel === 'Auto' || selectedModel === 'auto' || selectedModel === (autoOption?.id || 'auto');

  const addIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );

  return (
    <div
      ref={listRef}
      className="cdf-model-selector"
      style={{
        position: 'fixed',
        bottom: `calc(100vh - ${anchorRect.top}px + 8px)`,
        left: popupLeft,
        width: popupWidth,
        maxHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1400,
      }}
    >
      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {/* CDF Auto Model — aligned with old version */}
        {autoOption && (
          <div
            className={`cdf-model-selector__item ${isAutoSelected ? 'cdf-model-selector__item--selected' : ''}`}
            style={{ padding: '10px 16px', margin: '0 4px', borderRadius: '10px' }}
            onClick={() => { onSelect(autoOption.id); onClose(); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
              {/* Auto icon — same gear icon as "添加模型" */}
              <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: ACCENT }}>
                {addIcon}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>CDF Auto Model</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: ACCENT, background: '#FFF7ED', padding: '1px 8px', borderRadius: '6px' }}>智能</span>
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.4 }}>根据任务自动选择最合适的模型</div>
              </div>
              {/* Check */}
              {isAutoSelected && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill={ACCENT}>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="cdf-model-selector__divider" />

        {/* Section title */}
        <div className="cdf-model-selector__section-title">可用模型</div>

        {/* Model list */}
        {otherOptions.length === 0 ? (
          <div className="cdf-model-selector__empty">
            {modelsLoading ? '加载中...' : '尚未启用任何模型'}
          </div>
        ) : (
          otherOptions.map(option => {
            const isSelected = selectedModel === option.id;
            const providerIcon = ProviderIcons[option.provider.toLowerCase()];
            return (
              <div
                key={option.id}
                className={`cdf-model-selector__item ${isSelected ? 'cdf-model-selector__item--selected' : ''}`}
                style={{ padding: '8px 16px', margin: '0 4px', borderRadius: '10px' }}
                onClick={() => { onSelect(option.id); onClose(); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                  {/* Provider icon */}
                  <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#111827' }}>
                    {providerIcon || (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>{option.name}</span>
                      {option.isDefault && (
                        <span style={{ fontSize: '9px', fontWeight: 600, color: '#D97706', background: '#FEF3C7', padding: '0 8px', borderRadius: '4px' }}>默认</span>
                      )}
                      {option.capabilities?.map(cap => (
                        <span key={cap} style={{ fontSize: '9px', fontWeight: 600, color: '#6B7280', background: 'rgba(107,114,128,0.08)', padding: '0 8px', borderRadius: '6px' }}>
                          {cap === 'chat' ? '通用' : cap === 'code' ? '代码' : cap === 'vision' ? '多模态' : cap === 'long-context' ? '长上下文' : cap === 'reasoning' ? '推理' : cap}
                        </span>
                      ))}
                    </div>
                    {option.description && (
                      <div style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.description}</div>
                    )}
                  </div>
                  {/* Check */}
                  {isSelected && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={ACCENT}>
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Add model — fixed at bottom */}
      {onOpenSettings && (
        <>
          <div className="cdf-model-selector__divider" />
          <div
            className="cdf-model-selector__manage"
            style={{ padding: '8px 16px', margin: '0 4px', borderRadius: '10px', flexShrink: 0 }}
            onClick={() => { onOpenSettings(); onClose(); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
              <div style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6B7280' }}>
                {addIcon}
              </div>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>添加模型</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
