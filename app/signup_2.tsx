import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

type ViewMode = 'CHOOSE' | 'CREATE' | 'JOIN';

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function TeamSetupScreen() {
  const router = useRouter();
  
  const [mode, setMode] = useState<ViewMode>('CHOOSE');
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUserDataLoading, setIsUserDataLoading] = useState(true);
  const [userGrade, setUserGrade] = useState<string | null>(null);

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
          console.error("Error fetching student grade:", error);
          Alert.alert("Error", "Failed to sync student account data.");
        } finally {
          setIsUserDataLoading(false);
        }
      } else {
        setIsUserDataLoading(false);
      }
    };
    fetchStudentData();
  }, []);

  const hasInappropriateWords = (name: string) => {
    const forbidden = ['badword1', 'badword2', 'toxic'];
    return forbidden.some(word => name.toLowerCase().includes(word));
  };

  const getStudentCategory = () => {
    if (!userGrade) return "Primary";
    const gradeNum = parseInt(userGrade, 10);
    return (gradeNum === 7 || gradeNum === 8) ? "Junior High" : "Primary";
  };

  const handleBackPress = () => {
    setGroupName('');
    setMode('CHOOSE');
  };

  const handleCreateGroup = async () => {
    if (!auth.currentUser) {
      Alert.alert("Session Error", "You must be signed in to perform this action.");
      return;
    }

    if (isUserDataLoading || !userGrade) {
      Alert.alert("Loading", "Still synchronizing your grade profile. Please try again in a moment.");
      return;
    }

    const trimmedName = groupName.trim();

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
      // check if team name is already taken
      const teamsRef = collection(db_cloud, "MS_Team");
      const q = query(teamsRef, where("teamName", "==", trimmedName));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        Alert.alert("Name Taken", "This group name already exists. Try another!");
        setIsLoading(false);
        return;
      }

      const teamCategory = getStudentCategory();
      const discriminator = Math.floor(1000 + Math.random() * 9000).toString();

      // create team doc with a randomized 4-digit discriminator
      const newTeamRef = await addDoc(collection(db_cloud, "MS_Team"), {
        teamName: trimmedName,
        teamDiscriminator: discriminator,
        category: teamCategory,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        teamScore: 0,
      });

      const studentRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
      await updateDoc(studentRef, { teamID: newTeamRef.id });

      Alert.alert("Success", `Group "${trimmedName} #${discriminator}" created!`);
      // use replace to lock user out of onboarding flow
      router.replace('/home');

    } catch (err) {
      const error = err as { message?: string };
      Alert.alert("Error", error.message || "Failed to create group.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGroup = async () => {
    if (!auth.currentUser) {
      Alert.alert("Session Error", "You must be signed in to perform this action.");
      return;
    }

    if (isUserDataLoading || !userGrade) {
      Alert.alert("Loading", "Still synchronizing your grade profile. Please try again in a moment.");
      return;
    }

    const trimmedName = groupName.trim();

    if (!trimmedName) {
      Alert.alert("Input Required", "Please enter the group name.");
      return;
    }

    setIsLoading(true);

    try {
      const teamsRef = collection(db_cloud, "MS_Team");
      const q = query(teamsRef, where("teamName", "==", trimmedName));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert("Group Not Found", "We couldn't find a group with that name. Please check for typos.");
        setIsLoading(false);
        return;
      }

      const teamDoc = querySnapshot.docs[0];
      const teamData = teamDoc.data();
      const teamId = teamDoc.id;

      // block user if team category doesn't match student grade
      const studentCategory = getStudentCategory();
      if (teamData.category !== studentCategory) {
        Alert.alert(
          "Category Mismatch", 
          `This group is for ${teamData.category} students. Since you are in Grade ${userGrade}, you must join a ${studentCategory} group.`
        );
        setIsLoading(false);
        return;
      }

      const studentRef = doc(db_cloud, "MS_Student", auth.currentUser.uid);
      await updateDoc(studentRef, { teamID: teamId });

      Alert.alert("Success!", `You have joined ${teamData.teamName} #${teamData.teamDiscriminator}`);
      router.replace('/home');

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
              
              {mode !== 'CHOOSE' && (
                <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
                  <Ionicons name="chevron-back" size={24} color="#000" />
                </TouchableOpacity>
              )}

              {mode === 'CHOOSE' && (
                <View style={styles.choiceWrapper}>
                  <TouchableOpacity 
                    style={[styles.groupButton, isUserDataLoading && styles.buttonDisabled]} 
                    onPress={() => setMode('CREATE')}
                    disabled={isUserDataLoading}
                  >
                    <Text style={styles.buttonText}>New Group</Text>
                  </TouchableOpacity>

                  <Text style={styles.orText}>Or</Text>

                  <TouchableOpacity 
                    style={[styles.groupButton, isUserDataLoading && styles.buttonDisabled]} 
                    onPress={() => setMode('JOIN')}
                    disabled={isUserDataLoading}
                  >
                    <Text style={styles.buttonText}>Join Group</Text>
                  </TouchableOpacity>
                  
                  {isUserDataLoading && (
                    <ActivityIndicator size="small" color="#00E5FF" style={{ marginTop: 20 }} />
                  )}
                </View>
              )}

              {mode !== 'CHOOSE' && (
                <View style={styles.inputContainer}>
                  <Text style={styles.title}>
                    {mode === 'CREATE' ? 'Create Group' : 'Join Group'}
                  </Text>
                  
                  <Text style={styles.label}>Group Name</Text>
                  <TextInput
                    style={styles.inputText}
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder="Enter Group Name"
                    placeholderTextColor="#A0A0A0"
                    autoCorrect={false}
                    autoCapitalize={mode === 'JOIN' ? 'none' : 'sentences'}
                    editable={!isLoading}
                  />
                  <View style={styles.underline} />
                  
                  <Text style={styles.hintText}>
                    {mode === 'CREATE' 
                      ? `Your team will be assigned to: ${getStudentCategory()}`
                      : `Make sure to join a group in the ${getStudentCategory()} category.`
                    }
                  </Text>
                </View>
              )}

            </View>
          </View>

          {mode !== 'CHOOSE' && (
            <View style={styles.fixedButtonWrapper}>
              <TouchableOpacity 
                style={[styles.continueButton, isLoading && styles.buttonDisabled]} 
                onPress={mode === 'CREATE' ? handleCreateGroup : handleJoinGroup}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.continueButtonText}>
                    {mode === 'CREATE' ? 'Create Group' : 'Join Group'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {mode === 'CHOOSE' && <View style={styles.footerSpacer} />}

        </SafeAreaView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    paddingTop: 50,
    paddingBottom: 50,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    position: 'relative', 
  },
  backButton: { position: 'absolute', top: 24, left: 15, padding: 5, zIndex: 10 },
  choiceWrapper: { width: '100%', alignItems: 'center', marginTop: 15 },
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
    marginVertical: 25,
  },
  inputContainer: { width: '100%', marginTop: 10 },
  title: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 28,
    color: '#000000', 
    marginBottom: 35, 
    textAlign: 'center',
  },
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
    marginTop: 12,
  },
  fixedButtonWrapper: { alignItems: 'center', paddingVertical: 30, width: '100%' },
  continueButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,     
    paddingHorizontal: 60,   
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
    minWidth: 260,
  },
  buttonDisabled: { opacity: 0.5 },
  continueButtonText: {
    fontFamily: 'BalsamiqSans_400Regular',
    fontSize: 18,
    color: '#000000',
  },
  footerSpacer: { height: 100 }
});