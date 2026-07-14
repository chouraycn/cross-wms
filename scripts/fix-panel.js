import fs from 'fs';

const filePath = '/Users/chouray/WorkBuddy/2026-05-25-10-01-22/cross-wms/src/components/CDFChat/TaskMonitorPanel.tsx';
const content = fs.readFileSync(filePath, 'utf-8');

const lines = content.split('\n');
const badLine = lines[904];
console.log('Bad line:', badLine);

const replacement = `              <ToggleButton value="code" sx={{ fontSize: '0.55rem', px: 1 }}>代码</ToggleButton>
              <ToggleButton value="other" sx={{ fontSize: '0.55rem', px: 1 }}>其他</ToggleButton>
            </ToggleButtonGroup>
            <VirtualList
              items={filteredArtifacts}
              itemContent={(artifact, index) => (
                <ArtifactItem
                  key={artifact.id}
                  artifact={artifact}
                  selectedArtifactIds={selectedArtifactIds}
                  selectMode={artifactSelectMode}
                  deletingArtifactIds={deletingArtifactIds}
                  gs={gs}
                  onToggleSelect={handleToggleArtifactSelect}
                  onPreview={handlePreviewArtifact}
                  onCopyPath={handleCopyPath}
                  onDelete={handleDeleteArtifact}
                />
              )}
              itemSize={44}
              overscan={5}
              maxHeight={200}
            />
            {artifactsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#22c55e' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expandedSections.has('toolCalls')}
          onChange={() => handleToggleSection('toolCalls')}
          sx={{
            bgcolor: gs.bgPanel,
            border: \`1px solid \${gs.border}\`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <BuildIcon sx={{ fontSize: 16, mr: 1, color: '#f59e0b' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>技能与MCP</Typography>
            <Chip
              size="small"
              label={toolCalls.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              <TextField
                placeholder="搜索工具..."
                value={toolSearchQuery}
                onChange={(e) => setToolSearchQuery(e.target.value)}
                size="small"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-root': {
                    fontSize: '0.65rem',
                    borderRadius: 0.5,
                    bgcolor: gs.bgHover,
                  },
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ fontSize: 12, mr: 0.5, color: gs.textMuted }} />,
                }}
              />
            </Box>
            <ToggleButtonGroup
              size="small"
              value={toolFilterStatus}
              onChange={(_, newVal) => newVal && setToolFilterStatus(newVal)}
              sx={{ mb: 1, gap: 0.25 }}
            >
              <ToggleButton value="all" sx={{ fontSize: '0.55rem', px: 1 }}>全部</ToggleButton>
              <ToggleButton value="success" sx={{ fontSize: '0.55rem', px: 1 }}>成功</ToggleButton>
              <ToggleButton value="error" sx={{ fontSize: '0.55rem', px: 1 }}>失败</ToggleButton>
              <ToggleButton value="running" sx={{ fontSize: '0.55rem', px: 1 }}>运行中</ToggleButton>
            </ToggleButtonGroup>
            <VirtualList
              items={filteredToolCalls}
              itemContent={(toolCall, index) => (
                <ToolCallItem
                  key={toolCall.id}
                  toolCall={toolCall}
                  gs={gs}
                  onViewDetail={() => setToolCallDetail(toolCall)}
                />
              )}
              itemSize={56}
              overscan={5}
              maxHeight={250}
            />
            {toolCallsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#f59e0b' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion
          expanded={expandedSections.has('trajectory')}
          onChange={() => handleToggleSection('trajectory')}
          sx={{
            bgcolor: gs.bgPanel,
            border: \`1px solid \${gs.border}\`,
            borderRadius: 1,
            mb: 1.5,
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary sx={{ p: 1 }}>
            <TimelineIcon sx={{ fontSize: 16, mr: 1, color: '#8b5cf6' }} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: gs.textPrimary }}>轨迹追踪</Typography>
            <Chip
              size="small"
              label={trajectoryEvents.length}
              sx={{ ml: 'auto', height: 18, fontSize: '0.5rem', bgcolor: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0, mt: -1 }}>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              {trajectoryEvents.slice(0, displayedEventCount).map((event) => (
                <TrajectoryEventItem
                  key={event.id}
                  event={event}
                  expanded={expandedEventIds.has(event.id)}
                  gs={gs}
                  onToggle={() => setExpandedEventIds(prev => {
                    const next = new Set(prev);
                    if (next.has(event.id)) next.delete(event.id);
                    else next.add(event.id);
                    return next;
                  })}
                  onCopyData={() => {
                    navigator.clipboard.writeText(JSON.stringify(event.data, null, 2));
                    setTrajectoryCopiedField(event.id);
                    setTimeout(() => setTrajectoryCopiedField(null), 2000);
                  }}
                  copiedField={trajectoryCopiedField}
                />
              ))}
            </Box>
            {trajectoryEvents.length > displayedEventCount && (
              <Button size="small" onClick={handleLoadMoreEvents} sx={{ mt: 1, fontSize: '0.65rem' }}>
                {loadingMoreEvents ? '加载中...' : '加载更多'}
              </Button>
            )}
            {trajectoryLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={20} sx={{ color: '#8b5cf6' }} />
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}`;

const fixed = lines.slice(0, 904).join('\n') + '\n' + replacement;
fs.writeFileSync(filePath, fixed, 'utf-8');
console.log('Fixed file successfully!');