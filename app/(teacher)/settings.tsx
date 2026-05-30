import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

// --- THEME IMPORTS ---
import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width } = Dimensions.get('window');

export default function TeacherSettingsScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode, setIsDarkMode } = useTheme();

    // --- RESOLVE ACTIVE CONFIG FROM THEME ---
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- STATES ---
    const [teacherData, setTeacherData] = useState<any>(null);

    // --- 1. SYNC TEACHER PROFILE DATA ---
    useEffect(() => {
        const fetchTeacherProfile = async () => {
            try {
                const targetPin = "9a9t"; 

                const teacherQuery = query(
                    collection(db_cloud, "MS_Teacher"), 
                    where("teacherPin", "==", targetPin)
                );
                
                const querySnapshot = await getDocs(teacherQuery);

                if (!querySnapshot.empty) {
                    const docData = querySnapshot.docs[0].data();
                    const divisionList = docData.teacherGrade 
                        ? docData.teacherGrade.split(',') 
                        : ["Primary"];

                    setTeacherData({
                        name: docData.teacherName || "Mr. Smith",
                        divisions: divisionList,
                        pin: targetPin
                    });
                } else {
                    setTeacherData({ name: "Instructor", divisions: ["Primary"], pin: "9a9t" });
                }
            } catch (error) {
                console.error("Error fetching teacher settings profile:", error);
                setTeacherData({ name: "Instructor", divisions: ["Primary"], pin: "9a9t" });
            }
        };

        fetchTeacherProfile();
    }, []);

    // --- 2. HANDLERS ---
    const handleEditPress = () => {
        Alert.alert("System Information", "To modify your structural instruction profile credentials, please check in with the primary IT administration office.");
    };

    if (!fontsLoaded) return null;

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {/* --- TOP HEADER NAVIGATION BANNER --- */}
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={[styles.iconCircle, styles.activeSettings]}>
                            <Ionicons name="settings-outline" size={24} color="#00E5FF" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={() => {
                                Alert.alert("Sign Out", "Are you sure you want to lock the teacher portal?", [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Lock Portal", onPress: () => router.replace('/signup_1') }
                                ]);
                            }}
                        >
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    {/* --- USER INFO ROW --- */}
                    <View style={styles.userInfoRow}>
                        <View>
                            <Text style={[styles.welcomeText, { color: currentTheme.textColor }]}>Welcome,</Text>
                            <Text style={[styles.userName, { color: currentTheme.textColor }]}>
                                {teacherData ? teacherData.name : "Syncing instructor profiles..."}
                            </Text>
                        </View>
                        <View style={styles.gradeContainer}>
                            <Text style={styles.userId}>PIN Code: #{teacherData?.pin || "••••"}</Text>
                            <Text style={[styles.gradeText, { color: currentTheme.textColor }]}>Class Instructor</Text>
                        </View>
                    </View>

                    {/* --- SETTINGS & PROFILE HEADER ROW --- */}
                    <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.headerUnderlined, { color: currentTheme.textColor }]}>Settings</Text>
                        <View style={styles.profileHeaderGroup}>
                            <Text style={[styles.headerUnderlined, { color: currentTheme.textColor }]}>Profile</Text>
                            <TouchableOpacity onPress={handleEditPress}>
                                <Text style={[styles.editBtn, { color: currentTheme.textColor }]}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* --- PROFILE INFORMATION DETAIL CARD --- */}
                    <View style={styles.profileCard}>
                        <Image source={require('../../assets/images/User.png')} style={styles.avatar} />
                        <View style={styles.profileInfo}>
                            <Text style={styles.labelItalic}>Instructor Name</Text>
                            <Text style={styles.profileMainText}>{teacherData?.name || "Loading..."}</Text>
                            <Text style={styles.profileSubText}>Role: Class Instructor</Text>
                            
                            <Text style={[styles.labelItalic, { marginTop: 10 }]}>Assigned Sectors</Text>
                            <Text style={styles.profileMainText}>
                                {teacherData ? teacherData.divisions.join(', ') : "Syncing segments..."}
                            </Text>
                        </View>
                    </View>

                    {/* --- APP PREFERENCE --- */}
                    <Text style={[styles.rightHeaderUnderlined, { color: currentTheme.textColor }]}>App Preference</Text>
                    <View style={styles.preferenceRow}>
                        <Text style={[styles.preferenceText, { color: currentTheme.textColor }]}>Theme (Dark Mode)</Text>
                        <Switch 
                            value={isDarkMode} 
                            onValueChange={setIsDarkMode}
                            trackColor={{ false: "#D1D1D1", true: "#00E5FF" }}
                            thumbColor="white"
                        />
                    </View>

                    {/* --- EVALUATION RUBRIC REFERENCE BLUEPRINT --- */}
                    <Text style={[styles.rightHeaderUnderlined, { color: currentTheme.textColor }]}>Grading Matrix Rubric</Text>
                    <View style={styles.rubricContainerCard}>
                        <View style={styles.rubricSectionRow}>
                            <Ionicons name="checkbox" size={20} color="#00E5FF" />
                            <View style={styles.rubricTextContainer}>
                                <Text style={styles.rubricCategoryTitle}>Target Accuracy (0 - 50 Points)</Text>
                                <Text style={styles.rubricDescriptionText}>
                                    Evaluates scientific precision, data collection parameters calibration, and final result accuracy metrics.
                                </Text>
                            </View>
                        </View>

                        <View style={[styles.rubricSectionRow, { marginTop: 15 }]}>
                            <Ionicons name="git-network" size={20} color="#FFB74D" />
                            <View style={styles.rubricTextContainer}>
                                <Text style={styles.rubricCategoryTitle}>Execution Workflow (0 - 50 Points)</Text>
                                <Text style={styles.rubricDescriptionText}>
                                    Assesses methodological tracking, device hardware assembly structural quality, and teamwork reflections documentation logs.
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* --- CREDITS --- */}
                    <Text style={[styles.rightHeaderUnderlined, { color: currentTheme.textColor }]}>Credits</Text>
                    <View style={styles.creditsBox}>
                        <Text style={[styles.creditText, { color: currentTheme.textColor }]}>STEMM Lab Ver 1.0.0</Text>
                        <Text style={[styles.creditSubText, { color: currentTheme.textColor }]}>Developed with Michael and Lemuel from Binus International</Text>
                    </View>

                </ScrollView>

                {/* --- NAVIGATION FOOTER BOTTOM TABS --- */}
                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/leaderboard')}>
                        <Image source={require('../../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/teams')}>
                        <Image source={require('../../assets/images/Members.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Teams</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    activeSettings: { borderWidth: 2, borderColor: '#00E5FF' },
    
    userInfoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    welcomeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    userName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    gradeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    userId: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666' },
    gradeText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
    profileHeaderGroup: { flexDirection: 'row', alignItems: 'baseline' },
    headerUnderlined: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 22, textDecorationLine: 'underline' },
    editBtn: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, marginLeft: 10 },
    rightHeaderUnderlined: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 22, textDecorationLine: 'underline', textAlign: 'right', paddingHorizontal: 20, marginTop: 25, marginBottom: 10 },

    profileCard: { borderWidth: 1.5, borderColor: '#00', borderRadius: 20, marginHorizontal: 20, padding: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white' },
    avatar: { width: 80, height: 80, marginRight: 20 },
    profileInfo: { flex: 1 },
    labelItalic: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, fontStyle: 'italic' },
    profileMainText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    profileSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666' },

    preferenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
    preferenceText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, fontStyle: 'italic' },

    rubricContainerCard: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#000000',
        borderRadius: 20,
        marginHorizontal: 20,
        padding: 16,
        elevation: 2,
    },
    rubricSectionRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    rubricTextContainer: {
        flex: 1,
        gap: 2,
    },
    rubricCategoryTitle: {
        fontFamily: 'BalsamiqSans_700Bold',
        fontSize: 14,
        color: '#000000',
    },
    rubricDescriptionText: {
        fontFamily: 'BalsamiqSans_400Regular',
        fontSize: 12,
        color: '#555555',
        lineHeight: 16,
    },

    creditsBox: { paddingHorizontal: 20, marginTop: 10, marginBottom: 40 },
    creditText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    creditSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12 },

    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
});