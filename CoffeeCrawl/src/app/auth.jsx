import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
  }

  async function handleSignUp() {
    if (!email || !password || !username) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      Alert.alert('Sign up failed', error.message);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase
        .from('users')
        .insert({ id: data.user.id, username, display_name: username });
      if (profileError) {
        setLoading(false);
        Alert.alert('Profile error', profileError.message);
        return;
      }
    }
    setLoading(false);
    Alert.alert('Welcome!', 'Account created. Please check your email to confirm.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Coffee Crawl</Text>
        <Text style={styles.tagline}>Discover. Rate. Share.</Text>

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor="#C4B09A"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#C4B09A"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#C4B09A"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={mode === 'login' ? handleLogin : handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF8F9" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#A89880' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: '700', color: '#FFF8F9', textAlign: 'center', marginBottom: 8 },
  tagline: { fontSize: 16, color: '#F0E8E0', textAlign: 'center', marginBottom: 40 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#9A8870',
    borderRadius: 12,
    marginBottom: 24,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#FFF0F2' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#F0E8E0' },
  tabTextActive: { color: '#A89880' },
  input: {
    backgroundColor: '#FFF0F2',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#3D2B1F',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3D2B1F',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFF8F9' },
});