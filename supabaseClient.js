import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

let supabase = null;

try {
  const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.log('⚠️ Supabase credentials missing. Cloud sync features will be disabled.');
    console.log('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
    console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
  } else {
    const ExpoSecureStoreAdapter = {
      getItem: async (key) => {
        try {
          return await SecureStore.getItemAsync(key);
        } catch (error) {
          console.error('SecureStore getItem error:', error);
          return null;
        }
      },
      setItem: async (key, value) => {
        try {
          await SecureStore.setItemAsync(key, value);
        } catch (error) {
          console.error('SecureStore setItem error:', error);
        }
      },
      removeItem: async (key) => {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (error) {
          console.error('SecureStore removeItem error:', error);
        }
      },
    };

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
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
