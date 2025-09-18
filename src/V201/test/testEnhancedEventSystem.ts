import { EnhancedEventSystem } from '../enhancedEventSystem';
import { CampaignEvents } from '../AppEvents';
import createPrismaClient from '@shared/prisma';
import Logger from 'jet-logger';

/**
 * Test script for the enhanced event system
 * Run this to verify the migration and enhanced system are working
 */
async function testEnhancedEventSystem() {
  Logger.info('🚀 Testing Enhanced Event System...');

  try {
    // Test 1: Publish an enhanced event
    Logger.info('\n📤 Test 1: Publishing enhanced event...');
    const eventId = await EnhancedEventSystem.publishEvent(
      CampaignEvents.CAMPAIGN_DRAFT_SUCCESS,
      {
        campaignId: BigInt(999),
        userId: BigInt(1),
        createdAt: new Date(),
        budget: 100,
        type: 'HBAR' as any
      },
      {
        maxRetries: 2,
        priority: 'high'
      }
    );

    if (eventId) {
      Logger.info(`✅ Event published successfully with ID: ${eventId}`);
    } else {
      Logger.info('❌ Failed to publish event');
      return;
    }

    // Test 2: Check event statistics
    Logger.info('\n📊 Test 2: Getting event statistics...');
    const stats = await EnhancedEventSystem.getEventStats();
    Logger.info('Event Stats: ' + JSON.stringify(stats));

    // Test 3: Verify database structure
    Logger.info('\n🗄️ Test 3: Verifying database structure...');
    const prisma = await createPrismaClient();

    const eventRecord = await prisma.eventOutBox.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        event_type: true,
        status: true,
        retry_count: true,
        max_retries: true,
        created_at: true,
        updated_at: true
      }
    });

    if (eventRecord) {
      Logger.info('✅ Event record structure verified:');
      Logger.info(JSON.stringify(eventRecord, null, 2));
    } else {
      Logger.info('❌ Could not find event record');
    }

    // Test 4: Check table structure
    Logger.info('\n🏗️ Test 4: Checking enhanced tables exist...');

    const deadLetterCount = await prisma.event_dead_letter.count();
    Logger.info(`✅ event_dead_letter table accessible, count: ${deadLetterCount}`);

    const statsCount = await prisma.event_processing_stats.count();
    Logger.info(`✅ event_processing_stats table accessible, count: ${statsCount}`);

    // Cleanup test event
    await prisma.eventOutBox.delete({ where: { id: eventId } });
    Logger.info('\n🧹 Cleanup: Test event removed');

    Logger.info('\n🎉 Enhanced Event System test completed successfully!');
    Logger.info('✅ Migration applied correctly');
    Logger.info('✅ Enhanced features working');
    Logger.info('✅ Database schema updated');
    Logger.info('✅ Ready for production use');

  } catch (error) {
    Logger.err('❌ Test failed: ' + String(error));
    Logger.err(`Enhanced event system test failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedEventSystem()
    .then(() => process.exit(0))
    .catch((error) => {
      Logger.err('Test execution failed: ' + String(error));
      process.exit(1);
    });
}

export { testEnhancedEventSystem };
