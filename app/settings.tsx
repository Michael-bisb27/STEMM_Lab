import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');

const stemmSensors = [
    { id: 's1', name: 'Microphone (Sonic Timer)' },
    { id: 's2', name: 'Accelerometer (G-Force)' },
    { id: 's3', name: 'Gyroscope' },
    { id: 's4', name: 'Magnetometer' },
    { id: 's5', name: 'Barometer' },
    { id: 's6', name: 'Light Sensor' },
    { id: 's7', name: 'Proximity Sensor' },
];

// ─── Per-screen content ───────────────────────────────────────────────────────

export default function SettingsScreen() {
    const router = useRouter();
    const { isDarkMode, setIsDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [userData, setUserData] = useState<any>(null);
    const [isCalibrating, setUserCalibrating] = useState(false); 

    useEffect(() => {
        const fetchFullProfile = async () => {
            try {
                const auth = getAuth();
                const user = auth.currentUser;

                if (user) {
                    const studentDocRef = doc(db_cloud, "MS_Student", user.uid);
                    const studentSnap = await getDoc(studentDocRef);

                    if (studentSnap.exists()) {
                        const sData = studentSnap.data();
                        let teamName = "No Team";
                        let discriminator = "0000";

                        // cascade fetch to resolve linked team info dynamically
                        if (sData.teamID && sData.teamID !== "WAITING_FOR_ASSIGNMENT") {
                            const teamDocRef = doc(db_cloud, "MS_Team", sData.teamID);
                            const teamSnap = await getDoc(teamDocRef);
                            
                            if (teamSnap.exists()) {
                                const tData = teamSnap.data();
                                teamName = tData.teamName;
                                discriminator = tData.teamDiscriminator || "0000";
                            }
                        }

                        setUserData({
                            uid: user.uid,
                            name: sData.studentName || "Student",
                            teamId: sData.teamID || null,
                            teamName: teamName,
                            grade: sData.gradeLevel || "--",
                            teamDiscriminator: discriminator,
                            studentIdNumber: sData.studentID || "####"
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching settings data:", error);
            }
        };

        fetchFullProfile();
    }, []);

    const handleEditPress = () => {
        Alert.alert("Information", "Please contact a teacher to change your information");
    };

    const handleCalibrate = (sensorName: string) => {
        setUserCalibrating(true);
        
        // mock async sensor calibration delay
        setTimeout(() => {
            setUserCalibrating(false);
            setTimeout(() => {
                Alert.alert("Success", `${sensorName} working great!`);
            }, 100);
        }, 2000);
    };

    return (
        <ImageBackground 
            source={currentTheme.backgroundImage} 
            style={styles.background}
        >
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={[styles.iconCircle, styles.activeSettings]}>
                            <Ionicons name="settings-outline" size={24} color="#00E5FF" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={() => {
                                Alert.alert(
                                    "Sign Out",
                                    "Are you sure you want to lock out STEMM_Lab App?",
                                    [
                                        { text: "Cancel", style: "cancel" },
                                        { text: "Sign Out", onPress: () => router.replace('/signup_1') }
                                    ]
                                );
                            }}
                        >
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>

                    <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.headerUnderlined, { color: currentTheme.textColor }]}>Settings</Text>
                        <View style={styles.profileHeaderGroup}>
                            <Text style={[styles.headerUnderlined, { color: currentTheme.textColor }]}>Profile</Text>
                            <TouchableOpacity onPress={handleEditPress}>
                                <Text style={[styles.editBtn, { color: currentTheme.textColor }]}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.profileCard}>
                        <Image source={require('../assets/images/User.png')} style={styles.avatar} />
                        <View style={styles.profileInfo}>
                            <Text style={styles.labelItalic}>Your Profile</Text>
                            <Text style={styles.profileMainText}>{userData?.name || "Loading..."}</Text>
                            <Text style={styles.profileSubText}>Grade {userData?.grade || "--"}</Text>
                            
                            <Text style={[styles.labelItalic, { marginTop: 10 }]}>Team</Text>
                            <Text style={styles.profileMainText}>{userData?.teamName || "Un"}</Text>
                        </View>
                    </View>

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

                    <Text style={[styles.rightHeaderUnderlined, { color: currentTheme.textColor }]}>Sensor Lab</Text>
                    {stemmSensors.map((sensor) => (
                        <View key={sensor.id} style={styles.sensorRow}>
                            <Text style={[styles.preferenceText, { color: currentTheme.textColor }]}>{sensor.name}</Text>
                            <TouchableOpacity 
                                style={styles.calibrateBtn}
                                onPress={() => handleCalibrate(sensor.name)}
                            >
                                <Text style={styles.calibrateText}>Calibrate</Text>
                            </TouchableOpacity>
                        </View>
                    ))}

                    <Text style={[styles.rightHeaderUnderlined, { color: currentTheme.textColor }]}>Credits</Text>
                    <View style={styles.creditsBox}>
                        <Text style={[styles.creditText, { color: currentTheme.textColor }]}>STEMM Lab Ver 1.0.0</Text>
                        <Text style={[styles.creditSubText, { color: currentTheme.textColor }]}>Developed with Michael and Lemuel from Binus International</Text>
                    </View>

                </ScrollView>

                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/home')}>
                        <Image source={require('../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/leaderboard')}>
                        <Image source={require('../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/members')}>
                        <Image source={require('../assets/images/Members.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Members</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <Modal transparent visible={isCalibrating} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color="#00E5FF" />
                        <Text style={styles.loadingText}>Checking your phone's sensor</Text>
                    </View>
                </View>
            </Modal>
        </ImageBackground>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    profileCard: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, marginHorizontal: 20, padding: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white' },
    avatar: { width: 80, height: 80, marginRight: 20 },
    profileInfo: { flex: 1 },
    labelItalic: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, fontStyle: 'italic' },
    profileMainText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    profileSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#333' },
    preferenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
    preferenceText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, fontStyle: 'italic' },
    sensorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
    calibrateBtn: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 5, backgroundColor: 'white' },
    calibrateText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14 },
    creditsBox: { paddingHorizontal: 20, marginTop: 10, marginBottom: 40 },
    creditText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    creditSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#444' },
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    loadingBox: { backgroundColor: 'white', padding: 30, borderRadius: 20, alignItems: 'center', borderWidth: 2, borderColor: '#000' },
    loadingText: { marginTop: 15, fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, textAlign: 'center' },
});