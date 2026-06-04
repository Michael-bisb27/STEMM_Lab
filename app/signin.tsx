import { useRouter } from 'expo-router';
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

import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db_cloud } from '../services/firebase_config';

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function SigninScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Input Required", "Please enter both your email and password.");
      return false;
    }
    return true;
  };

  const handleSignIn = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      
      const user = userCredential.user;

      // verify student profile document exists in firestore
      const userDocRef = doc(db_cloud, "MS_Student", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        router.push('/home');
      } else {
        Alert.alert("Profile Not Found", "Your account exists but your student profile is missing. Please contact support.");
      }

    } catch (err) {
      const error = err as { code?: string; message?: string };
      console.error("Signin Error Log:", error);

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.logoSection}>
              <Image
                source={require('../assets/images/Logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.whiteCard}>
              <Text testID="signinTitle" style={styles.title}>Sign In</Text> 

              <View style={styles.inputContainer}>
                <Text style={styles.label}>School Email</Text>
                <TextInput
                  testID="emailInput"
                  style={styles.inputText}
                  placeholder="name@school.edu"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  testID="passwordInput"
                  style={styles.inputText}
                  placeholder="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={true}
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              <View style={styles.noAccountContainer}>
                <Text style={styles.noAccountText}>*Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/signup_1')}>
                  <Text style={styles.signUpLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <View style={styles.fixedButtonWrapper}>
            <TouchableOpacity
              testID="signInSubmitButton"
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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