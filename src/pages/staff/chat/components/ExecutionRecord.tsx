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
import { Box } from '@mui/material';
import { cn } from '../../../../components/staff/lib/utils.js';

import { chatTokens } from '../chatTokens.js';
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
    <Box component="span" sx={chatTokens.traceIcon} aria-hidden="true">
      <Icon />
    </Box>
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
    <Box sx={chatTokens.traceWrap}>
      <Box
        component="button"
        type="button"
        sx={[
          chatTokens.traceSummary,
          ...(summary.state === 'running' ? [chatTokens.traceSummaryRunning] : []),
          ...(summary.state === 'failed' ? [chatTokens.traceSummaryFailed] : []),
        ]}
        onClick={() => onToggle(traceTurnId, expanded)}
      >
        <CotTraceIcon name={traceSummaryIconName(summary)} />
        <Box
          component="span"
          sx={[...(summary.state === 'running' ? [chatTokens.traceFlowText] : [])]}
        >
          {summary.text}
        </Box>
        {details.length > 0 && (
          <Box sx={[chatTokens.traceChevron, ...(expanded ? [chatTokens.traceChevronExpanded] : [])]}>
            <StaffdeckIcon name="arrow" size={14} />
          </Box>
        )}
      </Box>
      {expanded && details.length > 0 && (
        <Box sx={chatTokens.traceDetails}>
          {details.map((line) => (
            <Box key={line.id} sx={chatTokens.traceLine}>
              <CotTraceIcon name={traceLineIconName(line)} />
              <Box component="span" sx={chatTokens.traceLineContent}>
                <Box
                  component="span"
                  sx={[
                    chatTokens.traceLineText,
                    ...(line.state === 'running' ? [chatTokens.traceFlowText] : []),
                    ...(line.state === 'failed' ? [chatTokens.traceLineTextFailed] : []),
                  ]}
                >
                  {line.text}
                </Box>
                {line.detail && <Box component="span" sx={chatTokens.traceLineDetail}>{line.detail}</Box>}
                {line.code && (
                  <Box component="details" open sx={chatTokens.traceCodeDetails}>
                    <Box component="summary" sx={chatTokens.traceCodeSummary}>查看代码</Box>
                    <Box sx={chatTokens.traceCodeBlock}>
                      <CodeBlock code={line.code} language={line.language || 'python'} />
                    </Box>
                  </Box>
                )}
                {line.output && (
                  <Box component="details" open sx={chatTokens.traceCodeDetails}>
                    <Box component="summary" sx={chatTokens.traceCodeSummary}>{line.outputTitle || '查看输出'}</Box>
                    <Box sx={chatTokens.traceCodeBlock}>
                      <CodeBlock code={line.output} language={line.outputLanguage || 'text'} />
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
