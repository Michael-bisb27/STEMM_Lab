import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      // use replace so user can't back-navigate to splash
      router.replace({ pathname: '/intro_card', params: { index: 1 } } as any); 
    }, 5000);

    return () => clearTimeout(timer);
  }, []); 

  return (
    <View style={styles.container}>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    fontFamily: 'BalsamiqSans_700Bold', 
    fontSize: 42,
    color: '#FFFFFF', 
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  }
});