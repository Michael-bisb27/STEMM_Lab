import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ImageBackground,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { getAuth } from 'firebase/auth';
import {
    addDoc,
    collection,
    doc,
    GeoPoint,
    getDoc,
    getDocs,
    query,
    Timestamp,
    where
} from 'firebase/firestore';
import { db_cloud } from '../services/firebase_config';

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');
const ACTIVITY_ID = "KXCsIyy3aDNUJWtcmbgy";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HumanPerformanceReadyScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- STATES ---
    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [teamMemberCount, setTeamMemberCount] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    
    // Checklist Verification States
    const [isSensorReading, setIsSensorReading] = useState(false);
    const [isGripSecure, setIsGripSecure] = useState(false);
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false);

    const [vibrationForce, setVibrationForce] = useState("0.00");
    const subscription = useRef<any>(null);

    // --- 1. SENSOR & DATA INITIALIZATION ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                const actRef = doc(db_cloud, "MS_Activity", ACTIVITY_ID);
                const actSnap = await getDoc(actRef);
                if (actSnap.exists()) setActivity(actSnap.data());

                const auth = getAuth();
                const user = auth.currentUser;
                if (user) {
                    const studentDocRef = doc(db_cloud, "MS_Student", user.uid);
                    const studentSnap = await getDoc(studentDocRef);

                    if (studentSnap.exists()) {
                        const studentData = studentSnap.data();
                        const tId = studentData.teamID;
                        setTeamId(tId);

                        if (tId) {
                            const studentsQuery = query(
                                collection(db_cloud, "MS_Student"),
                                where("teamID", "==", tId)
                            );
                            const querySnapshot = await getDocs(studentsQuery);
                            setTeamMemberCount(querySnapshot.size);
                        }
                    }
                }
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        const subscribeSensors = () => {
            Accelerometer.setUpdateInterval(100);
            subscription.current = Accelerometer.addListener(data => {
                const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
                setVibrationForce(magnitude.toFixed(2));
                
                if (!isSensorReading && magnitude > 0) {
                    setIsSensorReading(true);
                }
            });
        };

        fetchData();
        subscribeSensors();
        return () => {
            subscription.current?.remove();
        };
    }, [isSensorReading]);

    // --- 2. START ACTION HANDLING ---
    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No Team Session found.");
        
        setIsStarting(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "GPS access is required to check school perimeter zones.");
                setIsStarting(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const isWithinZone = latitude >= -6.23 && latitude <= -6.19 && longitude >= 106.79 && longitude <= 106.82;

            if (!isWithinZone) {
                Alert.alert("Outside Zone", "This activity must be performed within the Senayan/Sudirman school area.");
                setIsStarting(false);
                return;
            }

            const attemptRef = collection(db_cloud, "FC_Attempt");
            const q = query(attemptRef, where("TeamID", "==", teamId), where("ActivityID", "==", ACTIVITY_ID));
            const querySnapshot = await getDocs(q);
            const nextTrialNumber = querySnapshot.size + 1;

            await addDoc(attemptRef, {
                ActivityID: ACTIVITY_ID,
                GPS_Coordinates: new GeoPoint(latitude, longitude),
                TeamID: teamId,
                VideoURL: "",
                attemptAt: Timestamp.now(),
                trialNumber: nextTrialNumber
            });

            router.push('/human_activity');
            
        } catch (error) {
            console.error("Firestore Error:", error);
            Alert.alert("Error", "Could not submit validation request.");
        } finally {
            setIsStarting(false);
        }
    };

    const allRequirementsMet = isSensorReading && isGripSecure && isUserPrepared && isSafeSpace;
    const completedTasks = [isSensorReading, isGripSecure, isUserPrepared, isSafeSpace].filter(Boolean).length;
    const progressPercent = (completedTasks / 4) * 100;

    useEffect(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }, [completedTasks]);

    if (!fontsLoaded || loading) {
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#141414' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        /* Dynamic Theme Background Image Swap */
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>

                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>
                                {progressPercent === 100 ? "Ready!" : `Readiness: ${Math.round(progressPercent)}%`}
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/history')}>
                            <Ionicons name="timer-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    {/* Title Section (Dynamic colors applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Readiness Phase:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Human Performance Lab"}</Text>
                    </View>

                    {/* Overview layout stays white summary card block */}
                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.bold}>Instructions:</Text>
                            <Text style={styles.overviewText}>
                                • Hold the phone firmly in one hand.{"\n"}
                                • Activate the App vibration sensor.{"\n"}
                                • Perform guided movement slowly as shown in the app.{"\n"}
                                • Record the vibration.{"\n"}
                                • Repeat the activity with vibration feedback enabled.{"\n"}
                                • Review speed, smoothness, and range-of-motion data.{"\n"}
                                • Upload results and reflect as a group.
                            </Text>
                        </View>
                    </View>

                    {/* Movement Guide labels (Dynamic text colors applied) */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Movement Guide:</Text>
                    <View style={styles.diagramContainer}>
                        <View style={styles.diagramItem}>
                            <Image source={require('../assets/images/human_snippet.png')} style={styles.diagramImg} />
                            <Text style={[styles.diagramLabel, { color: currentTheme.textColor }]}>Movement 1</Text>
                        </View>
                        <View style={styles.diagramItem}>
                            <Image source={require('../assets/images/human_snippet2.png')} style={styles.diagramImg} />
                            <Text style={[styles.diagramLabel, { color: currentTheme.textColor }]}>Movement 2</Text>
                        </View>
                        <View style={styles.diagramItem}>
                            <Image source={require('../assets/images/human_snippet3.png')} style={styles.diagramImg} />
                            <Text style={[styles.diagramLabel, { color: currentTheme.textColor }]}>Movement 3</Text>
                        </View>
                    </View>

                    {/* Dynamic checklist header applied */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Readiness Checklist:</Text>

                    {/* Check 1: Live Hardware Vibration Sensor Check */}
                    <View style={styles.checkItem}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isSensorReading ? "checkbox" : "square-outline"} 
                                size={24} color={isSensorReading ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Vibration Sensor Connected</Text>
                        </View>
                        <View style={styles.sensorStatus}>
                            <Text style={[styles.statusText, !isSensorReading && styles.warningText]}>
                                {isSensorReading ? `Live Feed: ${vibrationForce} G` : "Connecting to accelerometer hardware..."}
                            </Text>
                        </View>
                    </View>

                    {/* Check 2: Manual Device Grip Security Check */}
                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsGripSecure(!isGripSecure)}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isGripSecure ? "checkbox" : "square-outline"} 
                                size={24} color={isGripSecure ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Device Grip Confirmed</Text>
                        </View>
                        <View style={styles.sensorStatus}>
                            <Text style={[styles.statusText, !isGripSecure && styles.warningText]}>
                                {isGripSecure ? "Grip is verified secure" : "Make sure your phone grip is not loose"}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Check 3: User Prepared */}
                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsUserPrepared(!isUserPrepared)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isUserPrepared ? "checkbox" : "square-outline"} size={24} color={isUserPrepared ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}>{` User prepared (${teamMemberCount} members)`}</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Check 4: Safe Space */}
                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsSafeSpace(!isSafeSpace)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isSafeSpace ? "checkbox" : "square-outline"} size={24} color={isSafeSpace ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Safe and clear movement space</Text>
                        </View>
                    </TouchableOpacity>

                    {allRequirementsMet && (
                        <TouchableOpacity 
                            style={[styles.startChallengeBtn, isStarting && { opacity: 0.7 }]}
                            onPress={handleStartChallenge}
                            disabled={isStarting}
                        >
                            {isStarting ? <ActivityIndicator color="#000" /> : <Text style={styles.startChallengeText}>Start Activity</Text>}
                        </TouchableOpacity>
                    )}

                </ScrollView>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color="#000" />
                        <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    mainScroll: { paddingTop: 110, paddingBottom: 110, paddingHorizontal: 20 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    titleSection: { marginTop: 15, marginBottom: 20 },
    phaseTag: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    activityName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, padding: 15, backgroundColor: 'white', marginBottom: 20 },
    overviewTextContainer: { flex: 1 },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 20 },
    bold: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginBottom: 5 },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, textDecorationLine: 'underline', marginBottom: 15, marginTop: 10 },
    diagramContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
    diagramItem: { alignItems: 'center', flex: 1 },
    diagramImg: { width: width * 0.25, height: 80, resizeMode: 'contain', marginBottom: 5 },
    diagramLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12 },
    checkItem: { marginBottom: 15 },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18 },
    sensorStatus: { paddingLeft: 30, marginTop: 4 },
    statusText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#4CAF50' },
    warningText: { color: '#F44336' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 10, marginBottom: 20, borderWidth: 1.5, borderColor: '#000' },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});