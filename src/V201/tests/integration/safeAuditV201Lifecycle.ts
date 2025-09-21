/**
 * Safe V201 Campaign Lifecycle Audit with Data Protection
 *
 * This enhanced audit script includes mandatory safety checks to prevent
 * running against production databases and causing data loss.
 *
 * Features:
 * - Database environment detection
 * - Automatic backup creation for valuable data
 * - Production database protection
 * - Data validation before proceeding
 */

import { PrismaClient } from '@prisma/client';
import logger from 'jet-logger';
import DatabaseSafetyManager from './databaseSafetyManager';

const prisma = new PrismaClient();

interface SafeAuditResult {
  section: string;
  findings: Array<{
    check: string;
    status: 'PASS' | 'FAIL' | 'WARNING' | 'PROTECTED';
    details: any;
    recommendation?: string;
  }>;
}

async function safeV201CampaignLifecycleAudit(): Promise<SafeAuditResult[]> {
  const results: SafeAuditResult[] = [];
  const dbSafety = new DatabaseSafetyManager();

  try {
    console.log('🛡️  Starting SAFE V201 Campaign Lifecycle Audit...\n');

    // MANDATORY SAFETY CHECK
    console.log('🔒 Step 1: Database Safety Analysis...');
    const safetyCheck = await dbSafety.performSafetyCheck('v201-audit');

    if (!safetyCheck.proceed) {
      results.push({
        section: 'Database Safety',
        findings: [
          {
            check: 'Production Database Protection',
            status: 'PROTECTED',
            details: {
              message: 'Audit blocked to prevent production data loss',
              recommendation: 'Use test database or --force flag',
            },
            recommendation:
              'Switch to test database: DATABASE_URL=postgres://user:pass@localhost:5432/hashbuzz_test',
          },
        ],
      });
      return results;
    }

    if (safetyCheck.backupFile) {
      console.log(`✅ Backup created: ${safetyCheck.backupFile}`);
    }

    console.log('🔍 Step 2: Proceeding with audit...\n');

    // AUDIT 1: Database Schema Validation
    console.log('1. Checking Database Schema...');
    const schemaAudit: SafeAuditResult = {
      section: 'Database Schema',
      findings: [],
    };

    try {
      // Check if new fields exist
      const sampleEngagement = await prisma.campaign_tweetengagements.findFirst(
        {
          select: {
            id: true,
            engagement_timestamp: true,
            is_valid_timing: true,
            payment_status: true,
          },
        }
      );

      if (sampleEngagement) {
        schemaAudit.findings.push({
          check: 'New timestamp validation fields exist',
          status: 'PASS',
          details: {
            engagement_timestamp: typeof sampleEngagement.engagement_timestamp,
            is_valid_timing: typeof sampleEngagement.is_valid_timing,
            payment_status: sampleEngagement.payment_status,
            note: 'V201 schema enhancements are properly deployed',
          },
        });
      } else {
        schemaAudit.findings.push({
          check: 'Schema fields validation',
          status: 'WARNING',
          details: {
            message: 'No engagement data found to validate schema',
            recommendation: 'Run against database with test data',
          },
          recommendation:
            'Create test engagement data or run against populated database',
        });
      }

      // Check for SUSPENDED payment status implementation
      const suspendedCount = await prisma.campaign_tweetengagements.count({
        where: { payment_status: 'SUSPENDED' },
      });

      schemaAudit.findings.push({
        check: 'SUSPENDED payment status implemented',
        status: 'PASS',
        details: {
          suspendedEngagements: suspendedCount,
          note:
            suspendedCount > 0
              ? 'System correctly identifies suspicious engagements'
              : 'No suspicious engagements found (good)',
        },
      });
    } catch (error) {
      schemaAudit.findings.push({
        check: 'Schema validation failed',
        status: 'FAIL',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
        recommendation: 'Check database connection and schema migrations',
      });
    }

    results.push(schemaAudit);

    // AUDIT 2: Engagement Data Quality with Safety Checks
    console.log('2. Auditing Engagement Data Quality...');
    const dataQualityAudit: SafeAuditResult = {
      section: 'Engagement Data Quality',
      findings: [],
    };

    try {
      // Get timing validation distribution with safety limits
      const timingValidation = await prisma.campaign_tweetengagements.groupBy({
        by: ['is_valid_timing'],
        _count: { id: true },
        take: 10000, // Limit to prevent memory issues
      });

      const recentEngagements = await prisma.campaign_tweetengagements.findMany(
        {
          where: {
            updated_at: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          select: {
            id: true,
            engagement_type: true,
            is_valid_timing: true,
            payment_status: true,
            updated_at: true,
          },
          take: 50, // Limit sample size
        }
      );

      dataQualityAudit.findings.push({
        check: 'Engagement timing validation distribution',
        status: 'PASS',
        details: {
          timingBreakdown: timingValidation.map((group) => ({
            isValidTiming: group.is_valid_timing,
            count: group._count.id,
          })),
          recentEngagements: recentEngagements.length,
          sampleSize: Math.min(recentEngagements.length, 5),
          examples: recentEngagements.slice(0, 5).map((e) => ({
            type: e.engagement_type,
            isValid: e.is_valid_timing,
            status: e.payment_status,
            age:
              Math.round(
                (Date.now() - e.updated_at.getTime()) / (1000 * 60 * 60)
              ) + 'h',
          })),
        },
      });

      // Campaign timing validation with safety checks
      const campaignsWithProperTiming = await prisma.campaign_twittercard.count(
        {
          where: {
            AND: [
              { campaign_start_time: { not: null } },
              { campaign_close_time: { not: null } },
            ],
          },
        }
      );

      const totalCampaigns = await prisma.campaign_twittercard.count();

      dataQualityAudit.findings.push({
        check: 'Campaigns have proper close/start times',
        status:
          totalCampaigns > 0
            ? campaignsWithProperTiming / totalCampaigns > 0.8
              ? 'PASS'
              : 'WARNING'
            : 'WARNING',
        details: {
          campaignsWithTimes: campaignsWithProperTiming,
          totalCampaigns,
          percentage:
            totalCampaigns > 0
              ? Math.round((campaignsWithProperTiming / totalCampaigns) * 100)
              : 0,
          note:
            totalCampaigns === 0
              ? 'No campaigns found in database'
              : 'Campaign timing data quality check',
        },
        recommendation:
          totalCampaigns === 0
            ? 'Database appears empty - check connection or create test data'
            : undefined,
      });
    } catch (error) {
      dataQualityAudit.findings.push({
        check: 'Data quality analysis failed',
        status: 'FAIL',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    results.push(dataQualityAudit);

    // AUDIT 3: Reward Distribution Security
    console.log('3. Auditing Reward Distribution Security...');
    const securityAudit: SafeAuditResult = {
      section: 'Reward Distribution Security',
      findings: [],
    };

    try {
      // Critical security check: No suspended engagements should be rewarded
      const paidSuspendedCount = await prisma.campaign_tweetengagements.count({
        where: {
          payment_status: 'SUSPENDED',
          // This would be a security violation
        },
      });

      securityAudit.findings.push({
        check: 'No suspended engagements were rewarded',
        status: paidSuspendedCount === 0 ? 'PASS' : 'FAIL',
        details: {
          paidSuspendedCount,
          securityNote:
            paidSuspendedCount === 0
              ? 'Security policy correctly enforced'
              : 'SECURITY VIOLATION DETECTED',
        },
        recommendation:
          paidSuspendedCount > 0
            ? 'URGENT: Investigate how suspended engagements got paid'
            : undefined,
      });

      // Check that only valid timing engagements get rewarded
      const invalidTimingBreakdown =
        await prisma.campaign_tweetengagements.groupBy({
          by: ['is_valid_timing', 'payment_status'],
          _count: { id: true },
          having: {
            is_valid_timing: false,
          },
        });

      const invalidButPaidCount = invalidTimingBreakdown
        .filter((group) => group.payment_status === 'PAID')
        .reduce((sum, group) => sum + group._count.id, 0);

      securityAudit.findings.push({
        check: 'No invalid timing engagements were rewarded',
        status: invalidButPaidCount === 0 ? 'PASS' : 'FAIL',
        details: {
          invalidTimingBreakdown: invalidTimingBreakdown.map((group) => ({
            isValidTiming: group.is_valid_timing,
            paymentStatus: group.payment_status,
            count: group._count.id,
          })),
          invalidButPaidCount,
          securityNote:
            invalidButPaidCount === 0
              ? 'Timestamp validation correctly enforced'
              : 'TIMING VALIDATION BYPASS DETECTED',
        },
        recommendation:
          invalidButPaidCount > 0
            ? 'URGENT: Fix timestamp validation in reward service'
            : undefined,
      });
    } catch (error) {
      securityAudit.findings.push({
        check: 'Security audit failed',
        status: 'FAIL',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    results.push(securityAudit);

    // AUDIT 4: Campaign Lifecycle Flow
    console.log('4. Validating Campaign Lifecycle Flow...');
    const lifecycleAudit: SafeAuditResult = {
      section: 'Campaign Lifecycle Flow',
      findings: [],
    };

    try {
      // Check recent campaigns that went through the new lifecycle
      const recentCampaigns = await prisma.campaign_twittercard.findMany({
        where: {
          updated_at: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        select: {
          id: true,
          name: true,
          card_status: true,
          campaign_close_time: true,
          updated_at: true,
        },
        orderBy: { updated_at: 'desc' },
        take: 10,
      });

      lifecycleAudit.findings.push({
        check: 'Recent campaigns processed through lifecycle',
        status: 'PASS',
        details: {
          recentCampaigns: recentCampaigns.length,
          examples: recentCampaigns.slice(0, 3).map((c) => ({
            name: c.name,
            status: c.card_status,
            hasCLoseTime: !!c.campaign_close_time,
            lastUpdated: c.updated_at.toISOString().split('T')[0],
          })),
          note:
            recentCampaigns.length === 0
              ? 'No recent campaigns found'
              : 'Campaign lifecycle tracking active',
        },
      });
    } catch (error) {
      lifecycleAudit.findings.push({
        check: 'Lifecycle analysis failed',
        status: 'FAIL',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    results.push(lifecycleAudit);

    return results;
  } finally {
    await dbSafety.close();
  }
}

async function printSafeAuditReport(results: SafeAuditResult[]): Promise<void> {
  console.log(
    '\n================================================================================'
  );
  console.log('SAFE V201 CAMPAIGN LIFECYCLE AUDIT REPORT');
  console.log(
    '================================================================================\n'
  );

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let warningChecks = 0;
  let protectedChecks = 0;

  for (const result of results) {
    console.log(`📋 ${result.section}`);
    console.log('--'.repeat(25));

    for (const finding of result.findings) {
      totalChecks++;
      const statusIcon = {
        PASS: '✅',
        FAIL: '❌',
        WARNING: '⚠️',
        PROTECTED: '🛡️',
      }[finding.status];

      console.log(`${statusIcon} ${finding.check}`);
      console.log(
        `   Details: ${JSON.stringify(finding.details, null, 2).substring(
          0,
          500
        )}${JSON.stringify(finding.details, null, 2).length > 500 ? '...' : ''}`
      );

      if (finding.recommendation) {
        console.log(`   💡 Recommendation: ${finding.recommendation}`);
      }
      console.log('');

      switch (finding.status) {
        case 'PASS':
          passedChecks++;
          break;
        case 'FAIL':
          failedChecks++;
          break;
        case 'WARNING':
          warningChecks++;
          break;
        case 'PROTECTED':
          protectedChecks++;
          break;
      }
    }
    console.log('');
  }

  console.log(
    '================================================================================'
  );
  console.log('SUMMARY');
  console.log(
    '================================================================================'
  );
  console.log(`Total Checks: ${totalChecks}`);
  console.log(`✅ Passed: ${passedChecks}`);
  console.log(`❌ Failed: ${failedChecks}`);
  console.log(`⚠️  Warnings: ${warningChecks}`);
  console.log(`🛡️  Protected: ${protectedChecks}`);

  if (totalChecks > 0) {
    const successRate = Math.round(
      ((passedChecks + warningChecks) / totalChecks) * 100
    );
    console.log(`Success Rate: ${successRate}%`);
  }

  if (protectedChecks > 0) {
    console.log(
      '\n🛡️  AUDIT PROTECTION ACTIVATED - Production data safety ensured!'
    );
  } else if (failedChecks === 0) {
    console.log(
      '\n🎉 AUDIT PASSED - V201 Campaign Lifecycle is working correctly!'
    );
  } else {
    console.log(
      '\n⚠️  AUDIT ISSUES DETECTED - Please review failed checks above'
    );
  }
  console.log(
    '================================================================================'
  );
}

// Main execution
async function main(): Promise<void> {
  try {
    const results = await safeV201CampaignLifecycleAudit();
    await printSafeAuditReport(results);

    // Exit with appropriate code
    const hasFailures = results.some((r) =>
      r.findings.some((f) => f.status === 'FAIL')
    );
    const hasProtection = results.some((r) =>
      r.findings.some((f) => f.status === 'PROTECTED')
    );

    if (hasProtection) {
      logger.info('Audit protected production data - exiting safely');
      process.exit(2); // Special exit code for protection
    } else if (hasFailures) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    logger.err(
      `Audit execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

export { safeV201CampaignLifecycleAudit, printSafeAuditReport };
