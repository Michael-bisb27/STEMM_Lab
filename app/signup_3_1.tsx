import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// Firebase Imports
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db_cloud } from '../services/firebase_config';

import {
  BalsamiqSans_400Regular,
  BalsamiqSans_700Bold,
  useFonts
} from '@expo-google-fonts/balsamiq-sans';

export default function SignupThreeOneScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userGrade, setUserGrade] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  // Fetch the user's grade level saved from the previous screen
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const userRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserGrade(userSnap.data().gradeLevel);
        }
      }
    };
    fetchUserData();
  }, []);

  if (!fontsLoaded) return null;

  // Rule: Profanity Filter
  const hasInappropriateWords = (name: string) => {
    const forbidden = ['badword1', 'badword2', 'toxic']; // Add your list here
    return forbidden.some(word => name.toLowerCase().includes(word));
  };

  const handleCreateGroup = async () => {
    const trimmedName = groupName.trim();

    // 1. Basic Validation
    if (trimmedName.length < 3) {
      Alert.alert("Invalid Name", "Group name must be at least 3 characters.");
      return;
    }

    if (hasInappropriateWords(trimmedName)) {
      Alert.alert("Inappropriate Content", "Please choose a more friendly group name.");
      return;
    }

    setIsLoading(true);

    try {
      // 2. Rule: Unique Name Check
      const teamsRef = collection(db_cloud, "MS_Team");
      const q = query(teamsRef, where("teamName", "==", trimmedName));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        Alert.alert("Name Taken", "This group name already exists. Try another!");
        setIsLoading(false);
        return;
      }

      // 3. Rule: Grade Logic (Categorization)
      let teamCategory = "Primary";
      const gradeNum = parseInt(userGrade || "0");
      if (gradeNum === 7 || gradeNum === 8) {
        teamCategory = "Junior High";
      }

      // 4. Generate Discriminator (4-digit random)
      const discriminator = Math.floor(1000 + Math.random() * 9000).toString();

      // 5. Create the MS_Team Document
      const newTeamRef = await addDoc(collection(db_cloud, "MS_Team"), {
        teamName: trimmedName,
        teamDiscriminator: discriminator,
        category: teamCategory,
        createdBy: auth.currentUser?.uid,
        createdAt: new Date().toISOString(),
        teamScore: 0,
      });

      // 6. Update the MS_Student document with the new Team ID
      if (auth.currentUser) {
        const studentRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
        await updateDoc(studentRef, {
          teamID: newTeamRef.id // Links student to the team UID
        });
      }

      Alert.alert("Success", `Group "${trimmedName} #${discriminator}" created!`);
      router.push('/home');

    } catch (err) {
      const error = err as { message?: string };
      Alert.alert("Error", error.message || "Failed to create group.");
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
          
          <View style={styles.logoSection}>
            <Image 
              source={require('../assets/images/Logo.png')} 
              style={styles.logo} 
              resizeMode="contain" 
            />
          </View>

          <View style={styles.middleSection}>
            <View style={styles.whiteCard}>
              
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => router.back()}
              >
                <Ionicons name="chevron-back" size={24} color="#000" />
              </TouchableOpacity>

              <Text style={styles.title}>Create Group</Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Group Name</Text>
                <TextInput
                  style={styles.inputText}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Enter Group Name"
                  placeholderTextColor="#A0A0A0"
                  autoCorrect={false}
                />
                <View style={styles.underline} />
                <Text style={styles.hintText}>
                  Your team will be assigned to: {parseInt(userGrade || "0") >= 7 ? "Junior High" : "Primary"}
                </Text>
              </View>

            </View>
          </View>

          <View style={styles.fixedButtonWrapper}>
            <TouchableOpacity 
              style={[styles.continueButton, isLoading && styles.buttonDisabled]} 
              onPress={handleCreateGroup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.continueButtonText}>Create Group</Text>
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
  logoSection: { marginTop: 100, alignItems: 'center' },
  logo: { width: 100, height: 100 },
  middleSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '85%', 
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 60,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    position: 'relative', 
  },
  backButton: { position: 'absolute', top: 38, left: 15, padding: 5, zIndex: 10 },
  title: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 28,
    color: '#000000', 
    marginBottom: 40, 
    textAlign: 'center',
  },
  inputContainer: { width: '100%' },
  label: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 14,
    color: '#9E9E9E', 
    marginBottom: 8,
  },
  inputText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 18,
    color: '#000000', 
    paddingVertical: 8,
  },
  underline: { height: 1, backgroundColor: '#D6D6D6', width: '100%' },
  hintText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 12,
    color: '#00E5FF',
    marginTop: 10,
  },
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
  continueButtonText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 18,
    color: '#000000',
  }
});