import type { ComponentType, SVGProps } from 'react';
import {
  ChevronRight,
  Code2,
  Gavel,
  LoaderCircle,
  MousePointerClick,
  Play,
  Wrench,
} from 'lucide-react';

import CodeBlock from '../../../../components/staff/CodeBlock.js';
import StaffdeckIcon from '../../../../components/staff/StaffdeckIcon.js';
import { cn } from '../../../../components/staff/lib/utils.js';

import {
  CHAT_TRACE_CHEVRON_CLASS,
  CHAT_TRACE_CHEVRON_EXPANDED_CLASS,
  CHAT_TRACE_CODE_BLOCK_CLASS,
  CHAT_TRACE_CODE_DETAILS_CLASS,
  CHAT_TRACE_CODE_SUMMARY_CLASS,
  CHAT_TRACE_DETAILS_CLASS,
  CHAT_TRACE_FLOW_TEXT_CLASS,
  CHAT_TRACE_ICON_CLASS,
  CHAT_TRACE_LINE_CLASS,
  CHAT_TRACE_LINE_CONTENT_CLASS,
  CHAT_TRACE_LINE_DETAIL_CLASS,
  CHAT_TRACE_LINE_TEXT_CLASS,
  CHAT_TRACE_LINE_TEXT_FAILED_CLASS,
  CHAT_TRACE_SUMMARY_CLASS,
  CHAT_TRACE_SUMMARY_FAILED_CLASS,
  CHAT_TRACE_SUMMARY_RUNNING_CLASS,
  CHAT_TRACE_WRAP_CLASS,
} from '../chatPageStyles.js';
import { traceLineIconName, traceSummaryIconName } from '../chatHelpers.js';
import type { CotTraceIconName, TraceLine } from '../chatTypes.js';

const COT_ICON_MAP: Record<CotTraceIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  advance: ChevronRight,
  execute: Play,
  generated: Code2,
  judge: Gavel,
  loading: LoaderCircle,
  select: MousePointerClick,
  tool: Wrench,
};

function CotTraceIcon({ name }: { name: CotTraceIconName }) {
  const Icon = COT_ICON_MAP[name];
  return (
    <span className={CHAT_TRACE_ICON_CLASS} aria-hidden="true">
      <Icon />
    </span>
  );
}

type ExecutionRecordProps = {
  traceTurnId: string;
  summary: { text: string; state: TraceLine['state'] };
  details: TraceLine[];
  expanded: boolean;
  onToggle: (turnId: string, isExpanded: boolean) => void;
};

export default function ExecutionRecord({
  traceTurnId,
  summary,
  details,
  expanded,
  onToggle,
}: ExecutionRecordProps) {
  return (
    <div className={CHAT_TRACE_WRAP_CLASS}>
      <button
        type="button"
        className={cn(
          CHAT_TRACE_SUMMARY_CLASS,
          summary.state === 'running' && CHAT_TRACE_SUMMARY_RUNNING_CLASS,
          summary.state === 'failed' && CHAT_TRACE_SUMMARY_FAILED_CLASS,
        )}
        onClick={() => onToggle(traceTurnId, expanded)}
      >
        <CotTraceIcon name={traceSummaryIconName(summary)} />
        <span className={cn(summary.state === 'running' && CHAT_TRACE_FLOW_TEXT_CLASS)}>{summary.text}</span>
        {details.length > 0 && (
          <StaffdeckIcon
            name="arrow"
            size={14}
            className={cn(CHAT_TRACE_CHEVRON_CLASS, expanded && CHAT_TRACE_CHEVRON_EXPANDED_CLASS)}
          />
        )}
      </button>
      {expanded && details.length > 0 && (
        <div className={CHAT_TRACE_DETAILS_CLASS}>
          {details.map((line) => (
            <div key={line.id} className={CHAT_TRACE_LINE_CLASS}>
              <CotTraceIcon name={traceLineIconName(line)} />
              <span className={CHAT_TRACE_LINE_CONTENT_CLASS}>
                <span
                  className={cn(
                    CHAT_TRACE_LINE_TEXT_CLASS,
                    line.state === 'running' && CHAT_TRACE_FLOW_TEXT_CLASS,
                    line.state === 'failed' && CHAT_TRACE_LINE_TEXT_FAILED_CLASS,
                  )}
                >
                  {line.text}
                </span>
                {line.detail && <span className={CHAT_TRACE_LINE_DETAIL_CLASS}>{line.detail}</span>}
                {line.code && (
                  <details open className={CHAT_TRACE_CODE_DETAILS_CLASS}>
                    <summary className={CHAT_TRACE_CODE_SUMMARY_CLASS}>查看代码</summary>
                    <CodeBlock className={CHAT_TRACE_CODE_BLOCK_CLASS} code={line.code} language={line.language || 'python'} />
                  </details>
                )}
                {line.output && (
                  <details open className={CHAT_TRACE_CODE_DETAILS_CLASS}>
                    <summary className={CHAT_TRACE_CODE_SUMMARY_CLASS}>{line.outputTitle || '查看输出'}</summary>
                    <CodeBlock className={CHAT_TRACE_CODE_BLOCK_CLASS} code={line.output} language={line.outputLanguage || 'text'} />
                  </details>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
