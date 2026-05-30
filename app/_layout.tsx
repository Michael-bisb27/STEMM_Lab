import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// Import local and cloud initializations
import { setupDatabase } from '../database/db';
import '../services/firebase_config';

// --- IMPORT YOUR THEME PROVIDER ---
// Double check this path matches where you created your ThemeContext file
import { ThemeProvider } from '../theme/theme_context';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    async function prepare() {
      try {
        // Initialize SQLite Tables
        setupDatabase();
        console.log('Local SQLite Database: Ready');
        console.log('Firebase Cloud Services: Ready');
        
      } catch (e) {
        console.warn('Database initialization error:', e);
      } finally {
        // Hide the splash screen once everything is set up
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  return (
    <ThemeProvider>
      <Stack>
        {/* (tabs) is the folder containing your main navigation */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}