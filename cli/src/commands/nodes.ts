import { Command } from 'commander';

/** 模拟节点列表 */
function getMockNodes() {
  return [
    {
      nodeId: 'node-1',
      name: '本地主节点',
      platform: 'macos',
      status: 'connected',
      capabilities: ['chat', 'tools', 'file_access'],
      lastSeenAt: Date.now(),
    },
    {
      nodeId: 'node-2',
      name: '远程工作节点',
      platform: 'linux',
      status: 'busy',
      capabilities: ['chat', 'tools'],
      lastSeenAt: Date.now() - 60 * 1000,
    },
  ];
}

export const nodesCommand = new Command('nodes')
  .description('管理节点')
  .version('1.0.0');

// list 子命令
nodesCommand
  .command('list')
  .description('列出所有节点')
  .action(async () => {
    const nodes = getMockNodes();

    console.log('节点列表:');
    console.log('');
    for (const node of nodes) {
      console.log(`  ${node.nodeId}: ${node.name}`);
      console.log(`    平台: ${node.platform}`);
      console.log(`    状态: ${node.status}`);
      console.log(`    能力: ${node.capabilities.join(', ')}`);
      console.log(`    最后活跃: ${new Date(node.lastSeenAt).toLocaleString()}`);
      console.log('');
    }
    console.log(`共 ${nodes.length} 个节点`);
  });

// status 子命令
nodesCommand
  .command('status')
  .description('显示节点状态')
  .action(async () => {
    const nodes = getMockNodes();

    const connected = nodes.filter((n) => n.status === 'connected').length;
    const busy = nodes.filter((n) => n.status === 'busy').length;
    const disconnected = nodes.filter((n) => n.status === 'disconnected').length;

    console.log('节点状态汇总:');
    console.log(`  总计: ${nodes.length}`);
    console.log(`  已连接: ${connected}`);
    console.log(`  忙碌中: ${busy}`);
    console.log(`  已断开: ${disconnected}`);
    console.log('');

    for (const node of nodes) {
      const icon = node.status === 'connected' ? '●' : node.status === 'busy' ? '◐' : '○';
      console.log(`  ${icon} ${node.nodeId} (${node.status})`);
    }
  });
