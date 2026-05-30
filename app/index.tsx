import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';

// 1. Import the font hook and the specific font weights you want
import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

export default function SplashScreen() {
  const router = useRouter();

  // 2. Load the font into the app
  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  useEffect(() => {
    // Only start the timer once the font has successfully loaded
    if (fontsLoaded) {
      const timer = setTimeout(() => {
        // Route exactly to the intro_1.tsx file
        router.push({ pathname: '/intro_card', params: { index: 1 } } as any);; 
      }, 5000); // 5000 milliseconds = 5 seconds

      return () => clearTimeout(timer);
    }
  }, [fontsLoaded]); 

  // 3. Keep the screen blank for a split second while the font loads to prevent layout shifting
  if (!fontsLoaded) {
    return null; 
  }

  return (
    <View style={styles.container}>
      {/* 4. This single line magically hides the top header! */}
      <Stack.Screen options={{ headerShown: false }} />

      <ImageBackground
        source={require('../assets/images/SplashBG.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <Text style={styles.title}>STEMM Lab</Text>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  title: {
    // 5. Apply the exact name of the imported font
    fontFamily: 'BalsamiqSans_700Bold', 
    fontSize: 42,
    // Note: You should remove standard `fontWeight: 'bold'` when using a custom bold font 
    // to avoid the system trying to "double-bold" it.
    color: '#FFFFFF', 
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  }
});