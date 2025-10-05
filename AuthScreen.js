import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from './supabaseClient';

export default function AuthScreen({ onAuthStateChange }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (!supabase) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>⚠️ Cloud Sync Unavailable</Text>
          <Text style={styles.errorText}>
            Supabase is not configured. The app will work in offline mode only.
            {'\n\n'}
            Please configure SUPABASE_URL and SUPABASE_ANON_KEY to enable cloud sync features.
          </Text>
        </View>
      </View>
    );
  }

  useEffect(() => {
    const handleDeepLink = async (event) => {
      try {
        const url = event.url;
        console.log('Deep link received:', url);
        
        if (!url) return;
        
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search || urlObj.hash.replace('#', '?'));
        
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const error_description = params.get('error_description');
        
        if (error_description) {
          Alert.alert('Sign In Error', decodeURIComponent(error_description));
          return;
        }
        
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          
          if (error) {
            Alert.alert('Sign In Error', error.message);
          } else {
            console.log('Session set successfully via magic link');
          }
        }
      } catch (error) {
        console.error('Deep link parsing error:', error);
      }
    };

    try {
      const subscription = Linking.addEventListener('url', handleDeepLink);
      
      Linking.getInitialURL().then((url) => {
        if (url) {
          handleDeepLink({ url });
        }
      }).catch((error) => {
        console.error('Error getting initial URL:', error);
      });

      return () => {
        if (subscription && subscription.remove) {
          subscription.remove();
        }
      };
    } catch (error) {
      console.error('Error setting up deep link listener:', error);
    }
  }, []);

  const handleMagicLinkSignIn = async () => {
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    const redirectUrl = Linking.createURL('/');
    
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign In Error', error.message);
    } else {
      Alert.alert(
        'Check Your Email! 📧',
        `We sent a magic link to ${email}. Click the link in your email to sign in.`,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>🔐 Sign In to Polar Sensor</Text>
        <Text style={styles.subtitle}>
          Sign in to sync your sensor data to the cloud
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleMagicLinkSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send Magic Link</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.infoText}>
          No password needed! We'll email you a secure link to sign in.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});
