import { supabase } from './supabaseClient';
import * as SQLite from 'expo-sqlite';

export class SyncService {
  constructor() {
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.lastSyncError = null;
  }

  async syncToCloud(db, deviceName, sessionMode, ppiEnabled, onProgress) {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    this.lastSyncError = null;
    let session = null;
    const syncedIdsThisAttempt = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const totalRecords = await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM sensor_readings WHERE synced = 0'
      );
      const total = totalRecords.count;

      if (total === 0) {
        throw new Error('No unsynced sensor data to upload');
      }

      const firstReading = await db.getFirstAsync(
        'SELECT timestamp FROM sensor_readings WHERE synced = 0 ORDER BY id ASC LIMIT 1'
      );
      const lastReading = await db.getFirstAsync(
        'SELECT timestamp FROM sensor_readings WHERE synced = 0 ORDER BY id DESC LIMIT 1'
      );

      const batchSize = 500;
      let synced = 0;

      onProgress && onProgress({ phase: 'preparing', progress: 0, total });

      while (synced < total) {
        const readings = await db.getAllAsync(
          'SELECT * FROM sensor_readings WHERE synced = 0 ORDER BY id ASC LIMIT ?',
          [batchSize]
        );

        if (readings.length === 0) break;

        if (!session) {
          const { data: newSession, error: sessionError } = await supabase
            .from('sessions')
            .insert({
              user_id: user.id,
              device_name: deviceName || 'Unknown Device',
              session_mode: sessionMode,
              ppi_enabled: ppiEnabled,
              start_time: firstReading.timestamp,
              end_time: lastReading.timestamp,
              total_records: total,
            })
            .select()
            .single();

          if (sessionError) {
            throw new Error(`Failed to create session: ${sessionError.message}`);
          }

          session = newSession;
          onProgress && onProgress({ phase: 'session_created', progress: 0, total });
        }

        const recordsToInsert = readings.map(reading => ({
          user_id: user.id,
          session_id: session.id,
          timestamp: reading.timestamp,
          ppg: reading.ppg,
          acc_x: reading.acc_x,
          acc_y: reading.acc_y,
          acc_z: reading.acc_z,
          gyro_x: reading.gyro_x,
          gyro_y: reading.gyro_y,
          gyro_z: reading.gyro_z,
        }));

        const { error: insertError } = await supabase
          .from('sensor_readings')
          .insert(recordsToInsert);

        if (insertError) {
          throw new Error(`Failed to upload batch: ${insertError.message}`);
        }

        const batchIds = readings.map(r => r.id);
        const placeholders = batchIds.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE sensor_readings SET synced = 1 WHERE id IN (${placeholders})`,
          batchIds
        );

        syncedIdsThisAttempt.push(...batchIds);

        synced += readings.length;

        onProgress && onProgress({
          phase: 'uploading',
          progress: synced,
          total,
          percentage: Math.round((synced / total) * 100),
        });
      }

      if (!session) {
        throw new Error('No session created - no data was uploaded');
      }

      this.lastSyncTime = new Date().toISOString();

      return {
        success: true,
        sessionId: session.id,
        recordsSynced: total,
        syncTime: this.lastSyncTime,
      };

    } catch (error) {
      this.lastSyncError = error.message;
      
      await this.rollbackFailedSync(db, session, syncedIdsThisAttempt);
      
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  async rollbackFailedSync(db, session, syncedIdsThisAttempt) {
    console.log('Rolling back failed sync...');

    try {
      if (session && session.id) {
        console.log(`Deleting cloud sensor readings for session: ${session.id}`);
        await supabase
          .from('sensor_readings')
          .delete()
          .eq('session_id', session.id);

        console.log(`Deleting partial session: ${session.id}`);
        await supabase
          .from('sessions')
          .delete()
          .eq('id', session.id);
      }
    } catch (cloudError) {
      console.error('Cloud cleanup failed (non-critical):', cloudError.message);
    } finally {
      try {
        if (syncedIdsThisAttempt.length > 0) {
          console.log(`Resetting ${syncedIdsThisAttempt.length} synced flags from this attempt`);
          
          const chunkSize = 999;
          for (let i = 0; i < syncedIdsThisAttempt.length; i += chunkSize) {
            const chunk = syncedIdsThisAttempt.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            await db.runAsync(
              `UPDATE sensor_readings SET synced = 0 WHERE id IN (${placeholders})`,
              chunk
            );
          }
          
          console.log('Rollback complete - ready for retry');
        } else {
          console.log('No local flags to reset (sync failed before any uploads)');
        }
      } catch (dbError) {
        console.error('CRITICAL: Failed to reset local synced flags:', dbError.message);
        throw new Error('Rollback failed - database may be corrupted. Please restart the app.');
      }
    }
  }

  async getCloudSessions() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('start_time', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    return data;
  }

  async getSessionReadings(sessionId, limit = 1000) {
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch readings: ${error.message}`);
    }

    return data;
  }

  async deleteCloudSession(sessionId) {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to delete session: ${error.message}`);
    }
  }
}

export const syncService = new SyncService();
