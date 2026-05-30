import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// ─── Per-screen content ───────────────────────────────────────────────────────
const INTRO_DATA = [
  {
    background: require('../assets/images/SplashBG.png'),
    icon:       require('../assets/images/Path.png'),
    title:      'Guide your study',
    subtitle:   'Tailor made to accompany you conducting activities',
  },
  {
    background: require('../assets/images/intro_2.png'),
    icon:       require('../assets/images/Experiment.png'),
    title:      'Fun Experiments',
    subtitle:   'Includes all the experiments, discover how your gadget can help !',
  },
  {
    background: require('../assets/images/intro_3.png'),
    icon:       require('../assets/images/Book.png'),
    title:      'Be your path',
    subtitle:   'Not just a map to show the road, we show its safety',
  },
];

export default function IntroScreen() {
  const router = useRouter();
  const { index } = useLocalSearchParams<{ index: string }>();

  // Convert route param "1" / "2" / "3" → 0-based array index
  const currentIndex = Math.max(0, Math.min(parseInt(index ?? '1', 10) - 1, INTRO_DATA.length - 1));

  const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });
  if (!fontsLoaded) return null;

  const { background, icon, title, subtitle } = INTRO_DATA[currentIndex];
  const isLast = currentIndex === INTRO_DATA.length - 1;

  return (
    <ImageBackground source={background} style={styles.background} resizeMode="cover">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Overlay as absolute sibling — pointerEvents="none" keeps it invisible to Detox
          while still rendering the dark tint visually */}
      <View style={styles.overlay} pointerEvents="none" />

      <SafeAreaView style={styles.container}>

        {/* TOP SECTION: Logo */}
        <View style={styles.topSection}>
          <Image
            source={require('../assets/images/Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* BOTTOM SECTION */}
        <View style={styles.bottomSection}>
          <ScrollView
            testID="bottomScrollView"
            contentContainerStyle={styles.bottomScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Icon */}
            <Image source={icon} style={styles.pathIcon} resizeMode="contain" />

            {/* Typography */}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {/* Pagination Dots */}
            <View style={styles.paginationContainer}>
              {INTRO_DATA.map((_, i) =>
                i === currentIndex ? (
                  <View key={i} style={[styles.dot, styles.activeDot]} />
                ) : (
                  <TouchableOpacity
                    key={i}
                    testID={`intro-dot-${i}`}
                    onPress={() => router.push({ pathname: '/intro_card', params: { index: i + 1 } } as any)}
                  >
                    <View style={styles.dot} />
                  </TouchableOpacity>
                )
              )}
            </View>

            {/* Last screen shows Continue button; others show a spacer */}
            {isLast ? (
              <TouchableOpacity
                testID="continueButton"
                style={styles.continueButton}
                onPress={() => router.push('/signup_1')}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.spacer} />
            )}
          </ScrollView>
        </View>

      </SafeAreaView>
    </ImageBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  container: {
    flex: 1,
    // Removed justifyContent: 'space-between' so flex rules handle positioning properly
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  topSection: {
    alignItems: 'center',
    // Reduced slightly from 160 so the logo doesn't clash with the content on smaller screens
    marginTop: 60, 
    marginBottom: 20,
  },
  logo: {
    width: 100,
    height: 100,
  },
  bottomSection: {
    flex: 1, // Keeps the ScrollView wrapper constrained to the visible screen limits
    width: '100%',
  },
  bottomScrollContent: {
    flexGrow: 1, // Crucial: allows content to fill the ScrollView height
    justifyContent: 'flex-end', // Pushes all your text, dots, and buttons back down to the bottom
    alignItems: 'center',
    paddingBottom: 10,
  },
  pathIcon: {
    width: 50,
    height: 50,
    marginBottom: 15,
  },
  title: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 16,
    color: '#E0E0E0',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    gap: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  activeDot: {
    backgroundColor: '#FFFFFF',
  },
  continueButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  continueButtonText: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 16,
    color: '#000000',
  },
  spacer: {
    height: 50,
    width: '100%',
  },
});