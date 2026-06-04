import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import mobileAds from 'react-native-google-mobile-ads';

// Database & Firebase
import { setupDatabase } from '../database/db';
import '../services/firebase_config';

// Theme Context
import { ThemeProvider, useTheme } from '../theme/theme_context';

// Global Font Loading
import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Initialize Google Mobile Ads SDK here
  useEffect(() => {
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        console.log('Google Mobile Ads SDK has initialized successfully!');
      });
  }, []);

  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

function RootLayoutContent() {
  const [dbReady, setDbReady] = useState(false);
  const { theme } = useTheme(); 
  const backgroundColor = theme?.background || '#121212'; 

  // Load fonts once at the very root of the app
  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        setupDatabase();
        console.log('Local SQLite Database: Ready');
        console.log('Firebase Cloud Services: Ready');
      } catch (e) {
        console.warn('Database initialization error:', e);
      } finally {
        setDbReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    // Only hide splash screen when BOTH fonts and database are fully ready
    if (dbReady && fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [dbReady, fontsLoaded]);

  if (!dbReady || !fontsLoaded) {
    return null; 
  }

  return (
    <View style={{ flex: 1, backgroundColor }} onLayout={onLayoutRootView}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor },
          headerShown: false, // Hides headers globally for all screens by default!
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </View>
  );
}