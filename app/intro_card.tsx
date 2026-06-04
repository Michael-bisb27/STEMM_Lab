import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions
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
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    // calc active slide index from scroll offset
    const index = Math.round(offsetX / width);
    if (index !== currentIndex && index >= 0 && index < INTRO_DATA.length) {
      setCurrentIndex(index);
    }
  };

  const handleDotPress = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.mainScroll}
      >
        {INTRO_DATA.map((item, index) => {
          const isLast = index === INTRO_DATA.length - 1;

          return (
            <ImageBackground 
              key={index} 
              source={item.background} 
              style={[styles.background, { width }]} 
              resizeMode="cover"
            >
              <View style={styles.overlay} pointerEvents="none" />

              <SafeAreaView style={styles.container}>
                {/* placeholder to match fixed logo layout */}
                <View style={styles.topSectionPlaceholder} />

                <View style={styles.bottomSection}>
                  <Image source={item.icon} style={styles.pathIcon} resizeMode="contain" />

                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.subtitle}>{item.subtitle}</Text>

                  <View style={styles.paginationPlaceholder} />

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
                </View>
              </SafeAreaView>
            </ImageBackground>
          );
        })}
      </ScrollView>

      {/* box-none lets touches pass straight through overlay to scrollview */}
      <SafeAreaView style={styles.fixedOverlay} pointerEvents="box-none">
        <View style={styles.topSection} pointerEvents="none">
          <Image
            source={require('../assets/images/Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.fixedBottomSection} pointerEvents="box-none">
          <View style={styles.paginationContainer}>
            {INTRO_DATA.map((_, i) =>
              i === currentIndex ? (
                <View key={i} style={[styles.dot, styles.activeDot]} />
              ) : (
                <TouchableOpacity
                  key={i}
                  testID={`intro-dot-${i}`}
                  onPress={() => handleDotPress(i)}
                >
                  <View style={styles.dot} />
                </TouchableOpacity>
              )
            )}
          </View>
          <View style={styles.fixedUnderDotsSpacer} pointerEvents="none" />
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainScroll: {
    flex: 1,
  },
  background: {
    flex: 1,
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  fixedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  topSection: {
    alignItems: 'center',
    marginTop: 140, 
    marginBottom: 20,
  },
  topSectionPlaceholder: {
    marginTop: 140,
    marginBottom: 20,
    height: 100,
  },
  logo: {
    width: 100,
    height: 100,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  fixedBottomSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
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
  paginationPlaceholder: {
    height: 12,
    marginBottom: 30,
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
    height: 40,
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
  fixedUnderDotsSpacer: {
    height: 50,
    width: '100%',
  },
});