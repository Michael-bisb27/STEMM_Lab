import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// Firebase Imports
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db_cloud } from '../services/firebase_config';

// Font Imports
import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

export default function SigninScreen() {
  const router = useRouter();

  // State Management
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load Fonts
  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  if (!fontsLoaded) return null;

  // 1. VALIDATION
  const validateForm = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Input Required", "Please enter both your email and password.");
      return false;
    }
    return true;
  };

  // 2. SIGN IN LOGIC
  const handleSignIn = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // Step A: Firebase Auth Sign In
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      
      const user = userCredential.user;

      // Step B: Connect the dots — Verify they exist in MS_Student
      const userDocRef = doc(db_cloud, "MS_Student", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        // If profile exists, send them home
        router.push('/home');
      } else {
        // This handles cases where auth exists but Firestore document was never created
        Alert.alert("Profile Not Found", "Your account exists but your student profile is missing. Please contact support.");
        // Optional: Send to signup if the profile is truly missing
      }

    } catch (err) {
      // THE CLEAN WAY: Cast 'err' to access properties safely
      const error = err as { code?: string; message?: string };
      console.error("Signin Error Log:", error);

      // Handle common Firebase Auth errors
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        Alert.alert("Login Failed", "Invalid email or password. Please try again.");
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert("Account Locked", "Too many failed attempts. Please try again later.");
      } else {
        Alert.alert("Error", error.message || "An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/images/SplashBG.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* LOGO SECTION */}
            <View style={styles.logoSection}>
              <Image
                source={require('../assets/images/Logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* WHITE CARD */}
            <View style={styles.whiteCard}>
              {/* 🌟 ADDED testID HERE TO ACT AS OUR 'OUTSIDE' TAP TARGET */}
              <Text testID="signinTitle" style={styles.title}>Sign In</Text> 

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>School Email</Text>
                <TextInput
                  testID="emailInput" //detox
                  style={styles.inputText}
                  placeholder="name@school.edu"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  testID="passwordInput" // 🌟 ADDED FOR DETOX
                  style={styles.inputText}
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={true}
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              {/* Link to Sign Up */}
              <View style={styles.noAccountContainer}>
                <Text style={styles.noAccountText}>*Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/signup_1')}>
                  <Text style={styles.signUpLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* FIXED BOTTOM BUTTON */}
          <View style={styles.fixedButtonWrapper}>
            <TouchableOpacity
              testID="signInSubmitButton" // 🌟 ADDED FOR DETOX
              style={[styles.continueButton, isLoading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.continueButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  logoSection: { marginTop: 100, marginBottom: 40, alignItems: 'center' },
  logo: { width: 100, height: 100 },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginHorizontal: 24,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 28,
    color: '#000000',
    marginBottom: 40,
    textAlign: 'center',
  },
  inputContainer: { width: '100%', marginBottom: 30 },
  label: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 14,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  inputText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 16,
    color: '#000000',
    paddingVertical: 8,
  },
  underline: { height: 1, backgroundColor: '#D6D6D6', width: '100%' },
  noAccountContainer: { flexDirection: 'row', marginTop: 10 },
  noAccountText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#000000' },
  signUpLink: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#00E5FF' },
  fixedButtonWrapper: { alignItems: 'center', paddingVertical: 30, width: '100%' },
  continueButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 100,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  buttonDisabled: { opacity: 0.6 },
  continueButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000000' },
});