import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';

const RUST = '#8C3235';
const RUST_DARK = '#672427';
const TAN = '#DCCAB4';
const ESPRESSO = '#A36054';
const TEXT_LIGHT = '#E8DCC6';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  async function resolveEmail(input) {
    // If it looks like an email, use it directly.
    if (input.includes('@')) return input.trim();
    // Otherwise treat it as a username and look up the email.
    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('username', input.trim().toLowerCase())
      .maybeSingle();
    if (error || !data?.email) return null;
    return data.email;
  }

  async function handleLogin() {
    if (!identifier || !password) {
      Alert.alert('Missing fields', 'Please enter your email or username and password.');
      return;
    }
    setLoading(true);
    const resolvedEmail = await resolveEmail(identifier);
    if (!resolvedEmail) {
      setLoading(false);
      Alert.alert('Login failed', 'No account found with that username or email.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });
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

    const cleanUsername = username.trim().toLowerCase();

    // Check the username isn't taken before we create the auth user.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      setLoading(false);
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }

    // The database trigger creates the users row automatically using this metadata.
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: cleanUsername } },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }

    Alert.alert('Welcome!', 'Account created. Please check your email to confirm.');
  }

  async function handleResetPassword() {
    const input = mode === 'login' ? identifier : email;
    if (!input) {
      Alert.alert('Email required', 'Please enter your email address first.');
      return;
    }
    setLoading(true);
    const resolvedEmail = await resolveEmail(input);
    if (!resolvedEmail) {
      setLoading(false);
      Alert.alert('Error', 'No account found with that username or email.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(resolvedEmail);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Check your email', 'We sent you a password reset link.');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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

          {mode === 'login' ? (
            <TextInput
              style={styles.input}
              placeholder="Email or username"
              placeholderTextColor={ESPRESSO}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              autoComplete="username"
            />
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={ESPRESSO}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="nickname"
                autoComplete="username-new"
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={ESPRESSO}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={ESPRESSO}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            passwordRules="minlength: 6;"
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
    </>
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