import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { supabase } from '../../lib/supabase';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [resetSent, setResetSent] = useState(false);
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

  async function handleResetPassword() {
    if (!email) {
      Alert.alert('Email required', 'Please enter your email address first.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setResetSent(true);
    Alert.alert('Check your email', 'We sent you a password reset link.');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Coffee Crawl</Text>
        <Text style={styles.tagline}>Discover · Rate · Share</Text>

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
            placeholderTextColor={ESPRESSO}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={ESPRESSO}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={ESPRESSO}
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
            <ActivityIndicator color={TEXT_LIGHT} />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        {mode === 'login' && (
          <TouchableOpacity style={styles.forgotLink} onPress={handleResetPassword} disabled={loading}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RUST },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontFamily: 'Modak_400Regular', fontSize: 40, color: TEXT_LIGHT, textAlign: 'center', marginBottom: 8 },
  tagline: { fontFamily: 'Lexend_500Medium', fontSize: 14, color: TAN, textAlign: 'center', marginBottom: 40 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: RUST_DARK,
    borderRadius: 12,
    marginBottom: 24,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: TAN },
  tabText: { fontFamily: 'Lexend_600SemiBold', fontSize: 14, color: TAN },
  tabTextActive: { color: RUST_DARK },
  input: {
    backgroundColor: TAN,
    borderRadius: 12,
    padding: 14,
    fontFamily: 'Lexend_400Regular',
    fontSize: 14,
    color: RUST_DARK,
    marginBottom: 12,
  },
  button: {
    backgroundColor: RUST_DARK,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { fontFamily: 'Lexend_700Bold', fontSize: 16, color: TEXT_LIGHT },
  forgotLink: { marginTop: 16, alignItems: 'center' },
  forgotText: { fontFamily: 'Lexend_500Medium', fontSize: 13, color: TAN, textDecorationLine: 'underline' },
});