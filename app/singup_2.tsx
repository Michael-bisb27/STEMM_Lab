import { Stack, useRouter } from 'expo-router';
import {
  Image,
  ImageBackground,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// Import custom fonts
import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

export default function SignupTwoScreen() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ImageBackground
      source={require('../assets/images/SplashBG.png')} 
      style={styles.background}
      resizeMode="cover"
    >
      <Stack.Screen options={{ headerShown: false }} />
      
      <SafeAreaView style={styles.container}>
        
        {/* LOGO SECTION */}
        <View style={styles.logoSection}>
          <Image 
            source={require('../assets/images/Logo.png')} 
            style={styles.logo} 
            resizeMode="contain" 
          />
        </View>

        {/* MIDDLE SECTION - Centered Card */}
        <View style={styles.middleSection}>
          <View style={styles.whiteCard}>
            
            {/* New Group Button - Now Redirecting */}
            <TouchableOpacity 
              style={styles.groupButton}
              onPress={() => router.push('/signup_3_1')}
            >
              <Text style={styles.buttonText}>New Group</Text>
            </TouchableOpacity>

            {/* "Or" Text */}
            <Text style={styles.orText}>Or</Text>

            {/* Join Group Button */}
            <TouchableOpacity 
              style={styles.groupButton}
              onPress={() => router.push('/signup_3_2')}
            >
              <Text style={styles.buttonText}>Join Group</Text>
            </TouchableOpacity>

          </View>
        </View>

        {/* Footer spacer */}
        <View style={styles.footerSpacer} />

      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
  },
  logoSection: {
    marginTop: 100, 
    alignItems: 'center',
  },
  logo: {
    width: 100, 
    height: 100,
  },
  middleSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '85%',
    paddingHorizontal: 20,
    paddingVertical: 50,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5, 
  },
  groupButton: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 22,
    color: '#000000',
  },
  orText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 22,
    color: '#000000',
    marginVertical: 30,
  },
  footerSpacer: {
    height: 100,
  }
});