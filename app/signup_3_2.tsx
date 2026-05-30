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

export default function SignupThreeTwoScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userGrade, setUserGrade] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
  });

  // 1. SESSION SYNC: Get the student's grade level on load
  useEffect(() => {
    const fetchStudentData = async () => {
      if (auth.currentUser) {
        try {
          const userRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setUserGrade(userSnap.data().gradeLevel);
          }
        } catch (error) {
          console.error("Error fetching grade:", error);
        }
      }
    };
    fetchStudentData();
  }, []);

  if (!fontsLoaded) return null;

  const handleJoinGroup = async () => {
    const trimmedName = groupName.trim();

    if (!trimmedName) {
      Alert.alert("Input Required", "Please enter the group name.");
      return;
    }

    setIsLoading(true);

    try {
      // 2. FIND THE TEAM: Search for the team by name
      const teamsRef = collection(db_cloud, "MS_Team");
      const q = query(teamsRef, where("teamName", "==", trimmedName));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert("Group Not Found", "We couldn't find a group with that name. Please check for typos.");
        setIsLoading(false);
        return;
      }

      // Get the first matching team document
      const teamDoc = querySnapshot.docs[0];
      const teamData = teamDoc.data();
      const teamId = teamDoc.id;

      // 3. RULE: Category Check (Primary vs Junior High)
      // Determine the student's category based on their grade (e.g., "7A" -> 7)
      const studentGradeNum = parseInt(userGrade || "0");
      const studentCategory = (studentGradeNum === 7 || studentGradeNum === 8) ? "Junior High" : "Primary";

      if (teamData.category !== studentCategory) {
        Alert.alert(
          "Category Mismatch", 
          `This group is for ${teamData.category} students. Since you are in Grade ${userGrade}, you must join a ${studentCategory} group.`
        );
        setIsLoading(false);
        return;
      }

      // 4. LINKING: Update the student's teamID to the found team
      if (auth.currentUser) {
        const studentRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
        await updateDoc(studentRef, {
          teamID: teamId
        });
      }

      Alert.alert("Success!", `You have joined ${teamData.teamName} #${teamData.teamDiscriminator}`);
      router.push('/home');

    } catch (err) {
      const error = err as { message?: string };
      Alert.alert("Error", error.message || "Something went wrong while joining.");
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

              <Text style={styles.title}>Join Group</Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Group Name</Text>
                <TextInput
                  style={styles.inputText}
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="Enter Group Name"
                  placeholderTextColor="#A0A0A0"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <View style={styles.underline} />
                <Text style={styles.hintText}>
                  Make sure to join a group in the {parseInt(userGrade || "0") >= 7 ? "Junior High" : "Primary"} category.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.fixedButtonWrapper}>
            <TouchableOpacity 
              style={[styles.continueButton, isLoading && styles.buttonDisabled]} 
              onPress={handleJoinGroup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.continueButtonText}>Join Group</Text>
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