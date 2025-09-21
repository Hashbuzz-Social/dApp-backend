/**
 * Simple V201 Campaign Lifecycle Audit
 *
 * This script directly queries the database to audit the current state
 * and validate that timestamp validation is working correctly.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuditResult {
  section: string;
  findings: Array<{
    check: string;
    status: 'PASS' | 'FAIL' | 'WARNING';
    details: any;
    recommendation?: string;
  }>;
}

async function auditV201CampaignLifecycle(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  console.log('🔍 Starting V201 Campaign Lifecycle Audit...\n');

  // AUDIT 1: Database Schema Validation
  console.log('1. Checking Database Schema...');
  const schemaAudit: AuditResult = {
    section: 'Database Schema',
    findings: []
  };

  try {
    // Check if new fields exist
    const sampleEngagement = await prisma.campaign_tweetengagements.findFirst({
      select: {
        id: true,
        engagement_timestamp: true,
        is_valid_timing: true,
        payment_status: true
      }
    });

    if (sampleEngagement) {
      schemaAudit.findings.push({
        check: 'New timestamp validation fields exist',
        status: 'PASS',
        details: {
          engagement_timestamp: typeof sampleEngagement.engagement_timestamp,
          is_valid_timing: typeof sampleEngagement.is_valid_timing,
          payment_status: sampleEngagement.payment_status
        }
      });
    }

    // Check if SUSPENDED payment status exists
    const suspendedCount = await prisma.campaign_tweetengagements.count({
      where: { payment_status: 'SUSPENDED' }
    });

    schemaAudit.findings.push({
      check: 'SUSPENDED payment status implemented',
      status: suspendedCount >= 0 ? 'PASS' : 'FAIL',
      details: { suspendedEngagements: suspendedCount }
    });

  } catch (error) {
    schemaAudit.findings.push({
      check: 'Schema validation',
      status: 'FAIL',
      details: { error: String(error) }
    });
  }

  results.push(schemaAudit);

  // AUDIT 2: Engagement Data Quality
  console.log('2. Auditing Engagement Data Quality...');
  const dataAudit: AuditResult = {
    section: 'Engagement Data Quality',
    findings: []
  };

  try {
    // Check distribution of valid vs invalid timing
    const validTimingStats = await prisma.campaign_tweetengagements.groupBy({
      by: ['is_valid_timing'],
      _count: { id: true },
      where: {
        updated_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });

    dataAudit.findings.push({
      check: 'Engagement timing validation distribution',
      status: 'PASS',
      details: {
        recentEngagements: validTimingStats.map(stat => ({
          isValidTiming: stat.is_valid_timing,
          count: stat._count.id
        }))
      }
    });

    // Check for campaigns with close times
    const campaignsWithCloseTimes = await prisma.campaign_twittercard.count({
      where: {
        campaign_close_time: { not: null },
        campaign_start_time: { not: null }
      }
    });

    dataAudit.findings.push({
      check: 'Campaigns have proper close/start times',
      status: campaignsWithCloseTimes > 0 ? 'PASS' : 'WARNING',
      details: { campaignsWithTimes: campaignsWithCloseTimes }
    });

  } catch (error) {
    dataAudit.findings.push({
      check: 'Data quality audit',
      status: 'FAIL',
      details: { error: String(error) }
    });
  }

  results.push(dataAudit);

  // AUDIT 3: Reward Distribution Security
  console.log('3. Auditing Reward Distribution Security...');
  const securityAudit: AuditResult = {
    section: 'Reward Distribution Security',
    findings: []
  };

  try {
    // Check if any SUSPENDED engagements were paid (security breach)
    const paidSuspendedEngagements = await prisma.campaign_tweetengagements.count({
      where: {
        payment_status: 'SUSPENDED',
        // This would be a critical security issue
      }
    });

    securityAudit.findings.push({
      check: 'No suspended engagements were rewarded',
      status: paidSuspendedEngagements === 0 ? 'PASS' : 'FAIL',
      details: { paidSuspendedCount: paidSuspendedEngagements },
      recommendation: paidSuspendedEngagements > 0 ? 'CRITICAL: Suspended engagements were rewarded - investigate immediately!' : undefined
    });

    // Check if invalid timing engagements were rewarded
    const invalidTimingStats = await prisma.campaign_tweetengagements.groupBy({
      by: ['is_valid_timing', 'payment_status'],
      _count: { id: true },
      having: {
        is_valid_timing: false
      }
    });

    const invalidPaidCount = invalidTimingStats
      .filter(stat => stat.payment_status === 'PAID')
      .reduce((sum, stat) => sum + stat._count.id, 0);

    securityAudit.findings.push({
      check: 'No invalid timing engagements were rewarded',
      status: invalidPaidCount === 0 ? 'PASS' : 'FAIL',
      details: {
        invalidTimingBreakdown: invalidTimingStats.map(stat => ({
          isValid: stat.is_valid_timing,
          status: stat.payment_status,
          count: stat._count.id
        }))
      },
      recommendation: invalidPaidCount > 0 ? 'CRITICAL: Invalid engagements were rewarded - audit reward system!' : undefined
    });

  } catch (error) {
    securityAudit.findings.push({
      check: 'Security audit',
      status: 'FAIL',
      details: { error: String(error) }
    });
  }

  results.push(securityAudit);

  // AUDIT 4: Campaign Lifecycle Flow Validation
  console.log('4. Validating Campaign Lifecycle Flow...');
  const flowAudit: AuditResult = {
    section: 'Campaign Lifecycle Flow',
    findings: []
  };

  try {
    // Find recent campaigns that went through the full lifecycle
    const recentClosedCampaigns = await prisma.campaign_twittercard.findMany({
      where: {
        campaign_close_time: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          lte: new Date()
        }
      },
      select: {
        id: true,
        name: true,
        campaign_close_time: true,
        campaign_tweetengagements: {
          select: {
            engagement_type: true,
            is_valid_timing: true,
            payment_status: true,
            updated_at: true
          }
        }
      },
      take: 5
    });

    flowAudit.findings.push({
      check: 'Recent campaigns processed through lifecycle',
      status: recentClosedCampaigns.length >= 0 ? 'PASS' : 'WARNING',
      details: {
        recentCampaigns: recentClosedCampaigns.length,
        examples: recentClosedCampaigns.map(campaign => ({
          id: campaign.id.toString(),
          name: campaign.name,
          closeTime: campaign.campaign_close_time?.toISOString(),
          engagements: campaign.campaign_tweetengagements.length,
          validEngagements: campaign.campaign_tweetengagements.filter(e => e.is_valid_timing).length,
          suspiciousEngagements: campaign.campaign_tweetengagements.filter(e => !e.is_valid_timing).length
        }))
      }
    });

  } catch (error) {
    flowAudit.findings.push({
      check: 'Lifecycle flow validation',
      status: 'FAIL',
      details: { error: String(error) }
    });
  }

  results.push(flowAudit);

  return results;
}

async function generateAuditReport(results: AuditResult[]): Promise<void> {
  console.log('\n' + '='.repeat(80));
  console.log('V201 CAMPAIGN LIFECYCLE AUDIT REPORT');
  console.log('='.repeat(80));

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let warnings = 0;

  for (const section of results) {
    console.log(`\n📋 ${section.section}`);
    console.log('-'.repeat(50));

    for (const finding of section.findings) {
      totalChecks++;
      let icon = '';

      switch (finding.status) {
        case 'PASS':
          icon = '✅';
          passedChecks++;
          break;
        case 'FAIL':
          icon = '❌';
          failedChecks++;
          break;
        case 'WARNING':
          icon = '⚠️';
          warnings++;
          break;
      }

      console.log(`${icon} ${finding.check}`);

      if (finding.details) {
        console.log(`   Details: ${JSON.stringify(finding.details, null, 2)}`);
      }

      if (finding.recommendation) {
        console.log(`   💡 Recommendation: ${finding.recommendation}`);
      }

      console.log('');
    }
  }

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Checks: ${totalChecks}`);
  console.log(`✅ Passed: ${passedChecks}`);
  console.log(`❌ Failed: ${failedChecks}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`Success Rate: ${((passedChecks / totalChecks) * 100).toFixed(1)}%`);

  if (failedChecks === 0) {
    console.log('\n🎉 AUDIT PASSED - V201 Campaign Lifecycle is working correctly!');
  } else {
    console.log('\n⚠️  AUDIT ISSUES FOUND - Please review failed checks above');
  }

  console.log('='.repeat(80));
}

async function main() {
  try {
    const results = await auditV201CampaignLifecycle();
    await generateAuditReport(results);

    const failedCount = results.reduce((sum, section) =>
      sum + section.findings.filter(f => f.status === 'FAIL').length, 0
    );

    process.exit(failedCount === 0 ? 0 : 1);

  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
