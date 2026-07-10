#!/usr/bin/env node

import { Command } from 'commander';
import { logger } from '../server/logger.js';
import { getDb } from '../server/db-core.js';
import { initMarketplaceTables } from '../server/db-marketplace.js';
import { logAudit } from '../server/services/security/audit.js';
import { searchMarketplace, installSkill, getInstalledSkills } from '../server/services/marketplace/api.js';

const program = new Command();

program
  .name('cross-wms')
  .description('Cross-WMS CLI Tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize database tables')
  .action(async () => {
    try {
      initMarketplaceTables(getDb());
      logger.info('Database tables initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Audit commands')
  .addCommand(
    new Command('log')
      .description('Log an audit event')
      .argument('<userId>', 'User ID')
      .argument('<action>', 'Action type')
      .argument('<resource>', 'Resource type')
      .argument('<resourceId>', 'Resource ID')
      .option('-d, --details <json>', 'Additional details as JSON')
      .option('-i, --ip <address>', 'IP address')
      .option('-u, --useragent <agent>', 'User agent')
      .option('--failed', 'Mark as failed')
      .action(async (userId, action, resource, resourceId, options) => {
        try {
          const details = options.details ? JSON.parse(options.details) : {};
          logAudit(
            userId,
            action as any,
            resource as any,
            resourceId,
            details,
            options.ip || '',
            options.useragent || '',
            !options.failed,
          );
          logger.info('Audit log recorded successfully');
        } catch (error) {
          logger.error('Failed to record audit log:', error);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('summary')
      .description('Get audit summary')
      .option('-s, --start <time>', 'Start time filter')
      .action(async (options) => {
        try {
          const { getAuditSummary } = await import('../server/services/security/audit.js');
          const summary = getAuditSummary(options.start);
          console.log(JSON.stringify(summary, null, 2));
        } catch (error) {
          logger.error('Failed to get audit summary:', error);
          process.exit(1);
        }
      }),
  );

program
  .command('marketplace')
  .description('Marketplace commands')
  .addCommand(
    new Command('search')
      .description('Search skills')
      .option('-q, --query <text>', 'Search query')
      .option('-c, --category <name>', 'Filter by category')
      .option('-p, --page <num>', 'Page number', '1')
      .option('-s, --pagesize <num>', 'Page size', '20')
      .action(async (options) => {
        try {
          const result = await searchMarketplace({
            search: options.query,
            category: options.category,
            page: parseInt(options.page),
            pageSize: parseInt(options.pagesize),
          });
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          logger.error('Failed to search marketplace:', error);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('install')
      .description('Install a skill')
      .argument('<skillId>', 'Skill ID')
      .argument('<remoteId>', 'Remote ID')
      .argument('<version>', 'Version')
      .action(async (skillId, remoteId, version) => {
        try {
          const result = await installSkill(skillId, remoteId, version);
          console.log(`Skill installed: ${result.id}`);
        } catch (error) {
          logger.error('Failed to install skill:', error);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('list')
      .description('List installed skills')
      .action(async () => {
        try {
          const skills = await getInstalledSkills();
          console.log(JSON.stringify(skills, null, 2));
        } catch (error) {
          logger.error('Failed to list installed skills:', error);
          process.exit(1);
        }
      }),
  );

program
  .command('db')
  .description('Database commands')
  .addCommand(
    new Command('info')
      .description('Show database info')
      .action(() => {
        try {
          const tables = getDb().prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
          ).all() as Array<{ name: string }>;
          console.log('Tables:', tables.map(t => t.name).join(', '));
        } catch (error) {
          logger.error('Failed to get database info:', error);
          process.exit(1);
        }
      }),
  )
  .addCommand(
    new Command('vacuum')
      .description('Run VACUUM to optimize database')
      .action(() => {
        try {
          getDb().exec('VACUUM');
          logger.info('Database vacuum completed');
        } catch (error) {
          logger.error('Failed to vacuum database:', error);
          process.exit(1);
        }
      }),
  );

program
  .command('health')
  .description('Check system health')
  .action(() => {
    try {
      const result = getDb().prepare("SELECT datetime('now') as now").get() as { now: string };
      console.log(`Status: OK\nTimestamp: ${result.now}`);
    } catch (error) {
      console.log(`Status: ERROR\nError: ${error}`);
      process.exit(1);
    }
  });

program.parse();
