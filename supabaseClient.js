import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

let supabaseUrl, supabaseAnonKey;

try {
  const envModule = require('./env.js');
  supabaseUrl = envModule.SUPABASE_URL;
  supabaseAnonKey = envModule.SUPABASE_ANON_KEY;
} catch (error) {
  supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
}

let supabase = null;

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('⚠️ Supabase credentials missing. Cloud sync features will be disabled.');
    console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
  } else {
    // AsyncStorage adapter for Supabase auth (no size limit, unlike SecureStore's 2KB limit)
    const AsyncStorageAdapter = {
      getItem: async (key) => {
        try {
          return await AsyncStorage.getItem(key);
        } catch (error) {
          console.error('AsyncStorage getItem error:', error);
          return null;
        }
      },
      setItem: async (key, value) => {
        try {
          await AsyncStorage.setItem(key, value);
        } catch (error) {
          console.error('AsyncStorage setItem error:', error);
        }
      },
      removeItem: async (key) => {
        try {
          await AsyncStorage.removeItem(key);
        } catch (error) {
          console.error('AsyncStorage removeItem error:', error);
        }
      },
    };

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    console.log('✅ Supabase client initialized successfully');
  }
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error);
  supabase = null;
}

export { supabase };
