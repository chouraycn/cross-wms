import { Command } from 'commander';
import { extensionLoader } from '../../../../extensions/index.js';

export const extensionCommand = new Command('extension')
  .description('Manage extensions')
  .version('1.0.0');

extensionCommand
  .command('list')
  .description('List all extensions')
  .action(async () => {
    const extensions = extensionLoader.list();
    
    console.log('Extensions:');
    for (const ext of extensions) {
      console.log(`  ${ext.id} - ${ext.manifest.name} (${ext.enabled ? 'enabled' : 'disabled'})`);
    }
  });

extensionCommand
  .command('load')
  .description('Load all extensions')
  .action(async () => {
    const count = await extensionLoader.loadAll();
    console.log(`Loaded ${count} extensions`);
  });

extensionCommand
  .command('enable <extensionId>')
  .description('Enable an extension')
  .action(async (extensionId) => {
    const result = await extensionLoader.enable(extensionId);
    
    if (result) {
      console.log(`Extension ${extensionId} enabled`);
    } else {
      console.log(`Failed to enable extension ${extensionId}`);
    }
  });

extensionCommand
  .command('disable <extensionId>')
  .description('Disable an extension')
  .action(async (extensionId) => {
    const result = await extensionLoader.disable(extensionId);
    
    if (result) {
      console.log(`Extension ${extensionId} disabled`);
    } else {
      console.log(`Failed to disable extension ${extensionId}`);
    }
  });

extensionCommand
  .command('discover')
  .description('Discover available extensions')
  .action(async () => {
    const manifests = await extensionLoader.discover();
    
    console.log('Discovered extensions:');
    for (const manifest of manifests) {
      console.log(`  ${manifest.id} - ${manifest.name}`);
    }
  });

extensionCommand
  .command('info <extensionId>')
  .description('Get extension info')
  .action(async (extensionId) => {
    const ext = extensionLoader.get(extensionId);
    
    if (ext) {
      console.log(JSON.stringify(ext, null, 2));
    } else {
      console.log(`Extension ${extensionId} not found`);
    }
  });