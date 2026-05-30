import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
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
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db_cloud } from '../services/firebase_config';

// Font Imports
import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

export default function SignupOneScreen() {
  const router = useRouter();

  // State Management
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [grade, setGrade] = useState(''); 
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingTeacher, setIsVerifyingTeacher] = useState(false);

  // Teacher Portal States
  const [isTeacherModalVisible, setIsTeacherModalVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');

  // Load Fonts
  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  if (!fontsLoaded) return null;

  // TEACHER LOGIN VERIFICATION (UPDATED FOR FIREBASE)
  const handleTeacherVerify = async () => {
    if (!enteredPin.trim()) {
      Alert.alert("Required", "Please enter a PIN.");
      return;
    }

    setIsVerifyingTeacher(true);

    try {
      // Create a query to search the MS_Teacher collection for a matching teacherPin
      const teacherQuery = query(
        collection(db_cloud, 'MS_Teacher'),
        where('teacherPin', '==', enteredPin.trim())
      );

      const querySnapshot = await getDocs(teacherQuery);

      if (!querySnapshot.empty) {
        // Successfully found a matching teacher document
        setIsTeacherModalVisible(false);
        setEnteredPin('');
        router.push('/(teacher)/home');
      } else {
        Alert.alert("Access Denied", "Invalid Teacher PIN code. Please try again.");
      }
    } catch (error) {
      console.error("Firebase Firestore lookup failure:", error);
      Alert.alert("Error", "Could not verify credentials against cloud storage.");
    } finally {
      setIsVerifyingTeacher(false);
    }
  };

  // 1. SIGNUP RULES & VALIDATION
  const validateForm = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const gradeRegex = /^\d[a-zA-Z]$/;
    
    if (!name.trim()) {
      Alert.alert("Input Required", "Please enter your full name.");
      return false;
    }
    
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid school email address.");
      return false;
    }

    if (!gradeRegex.test(grade.trim())) {
      Alert.alert(
        "Invalid Grade Format", 
        "Please enter your grade as one number and one letter (e.g., 5a or 8b)."
      );
      return false;
    }

    if (password.length < 8) {
      Alert.alert("Security Rule", "Password must be at least 8 characters.");
      return false;
    }
    return true;
  };

  // 2. MAIN SIGN UP LOGIC
  const handleSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        email.trim(), 
        password
      );
      
      const user = userCredential.user;

      // 3. FIRESTORE ENTRY (MS_Student Collection)
      await setDoc(doc(db_cloud, "MS_Student", user.uid), {
        studentName: name.trim(),
        schoolEmail: email.toLowerCase().trim(),
        gradeLevel: grade.toUpperCase().trim(), 
        teamID: "WAITING_FOR_ASSIGNMENT", 
        createdAt: new Date().toISOString(),
      });

      router.push('/singup_2');

    } catch (err) {
      const error = err as { code?: string; message?: string };
      console.error("Signup Error Log:", error);
      
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert("Account Conflict", "This email is already registered.");
      } else {
        Alert.alert("Signup Failed", error.message || "An unexpected error occurred.");
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
          
          {/* Discreet Teacher Trigger Button */}
          <TouchableOpacity 
            style={styles.teacherTrigger} 
            onPress={() => setIsTeacherModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.teacherTriggerText}>🏫 Teacher Portal</Text>
          </TouchableOpacity>

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
              <Text style={styles.title}>Sign Up</Text>

              {/* Student Name */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.inputText}
                  placeholder="Enter your name"
                  value={name}
                  onChangeText={setName}
                />
                <View style={styles.underline} />
              </View>

              {/* Grade Level Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Grade (e.g., 5a, 7b)</Text>
                <TextInput
                  style={styles.inputText}
                  placeholder="Enter Grade"
                  value={grade}
                  onChangeText={setGrade}
                  maxLength={2}
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              {/* School Email */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>School Email</Text>
                <TextInput
                  style={styles.inputText}
                  placeholder="name@school.edu"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              {/* Password */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.inputText}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={true}
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
              </View>

              <View style={styles.haveAccountContainer}>
                <Text style={styles.haveAccountText}>*Have an account? </Text>
                <TouchableOpacity testID="goToSignInButton" onPress={() => router.push('/signin')}>
                  <Text style={styles.signInLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <View style={styles.fixedButtonWrapper}>
            <TouchableOpacity
              style={[styles.continueButton, isLoading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.continueButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Cross-Platform Safe Teacher PIN Popup */}
      <Modal
        visible={isTeacherModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsTeacherModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Teacher Verification</Text>
            <Text style={styles.modalSubtitle}>Enter your security PIN to open the workspace portal.</Text>
            
            <TextInput
              style={styles.pinInput}
              placeholder="••••"
              placeholderTextColor="#9E9E9E"
              value={enteredPin}
              onChangeText={setEnteredPin}
              keyboardType="default"
              autoCapitalize="none"
              secureTextEntry={true}
              maxLength={6}
              editable={!isVerifyingTeacher}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => {
                  setIsTeacherModalVisible(false);
                  setEnteredPin('');
                }}
                disabled={isVerifyingTeacher}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalButton, styles.verifyButton, isVerifyingTeacher && styles.buttonDisabled]} 
                onPress={handleTeacherVerify}
                disabled={isVerifyingTeacher}
              >
                {isVerifyingTeacher ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: '100%', height: '100%' },
  container: { flex: 1 },
  teacherTrigger: {
    alignSelf: 'flex-end',
    marginRight: 24,
    marginTop: Platform.OS === 'ios' ? 10 : 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  teacherTriggerText: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  scrollContent: { paddingBottom: 20 },
  logoSection: { marginTop: 30, marginBottom: 40, alignItems: 'center' },
  logo: { width: 100, height: 100 },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginHorizontal: 24,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 30,
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
    marginBottom: 30,
    textAlign: 'center',
  },
  inputContainer: { width: '100%', marginBottom: 24 },
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
  haveAccountContainer: { flexDirection: 'row', marginTop: 10 },
  haveAccountText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#000000' },
  signInLink: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#00E5FF' },
  fixedButtonWrapper: { alignItems: 'center', paddingVertical: 30, width: '100%' },
  continueButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 80,
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
  
  // Modal Styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    width: '85%',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
  },
  modalTitle: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 22,
    color: '#000000',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  pinInput: {
    width: '60%',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: 'BalsamiqSans_700Bold',
    letterSpacing: 8,
    color: '#000000',
    marginBottom: 24,
  },
  modalButtonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 0.47,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  cancelButtonText: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 16,
    color: '#757575',
  },
  verifyButton: {
    backgroundColor: '#000000',
  },
  verifyButtonText: {
    fontFamily: 'BalsamiqSans_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});