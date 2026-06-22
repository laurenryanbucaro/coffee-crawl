import { useEffect, useState } from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useFonts, Modak_400Regular } from '@expo-google-fonts/modak';
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold, Lexend_700Bold } from '@expo-google-fonts/lexend';

export default function RootLayout() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const [fontsLoaded] = useFonts({
    Modak_400Regular,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
    Lexend_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuthScreen = segments[0] === 'auth';
    if (!session && !inAuthScreen) {
      router.replace('/auth');
    } else if (session && inAuthScreen) {
      router.replace('/');
    }
  }, [session, loading, segments]);

  if (loading || !fontsLoaded) return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#8C3235',
        tabBarInactiveTintColor: '#A36054',
        tabBarStyle: { backgroundColor: '#DCCAB4', borderTopColor: '#A36054' },
        headerStyle: { backgroundColor: '#8C3235' },
        headerTintColor: '#E8DCC6',
        headerTitleStyle: { fontFamily: 'Modak_400Regular', fontSize: 20 },
      }}
    >
      <Tabs.Screen
        name="(tabs)/map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(tabs)/feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(tabs)/friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(tabs)/profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="auth"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="shop/[id]"
        options={{ href: null, title: 'Shop' }}
      />
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="post"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="user/[id]"
        options={{ href: null }}
      />
    </Tabs>
  );
}