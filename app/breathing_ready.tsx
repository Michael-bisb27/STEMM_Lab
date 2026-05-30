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
const ACTIVITY_ID = "U2gkCfB3uS6Z8jjmo3Kp"; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BreathingReadyScreen() {
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
    
    const [isSensorActive, setIsSensorActive] = useState(false);
    const [isCalibrated, setIsCalibrated] = useState(false);
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false); 
    const [isCalibrating, setIsCalibrating] = useState(false);

    const [accelData, setAccelData] = useState({ x: 0, y: 0, z: 0 });
    const subscription = useRef<any>(null);

    // --- 1. INITIAL DATA FETCH & SENSOR SUBSCRIPTION ---
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
                setAccelData({
                    x: parseFloat(data.x.toFixed(3)),
                    y: parseFloat(data.y.toFixed(3)),
                    z: parseFloat(data.z.toFixed(3)),
                });
                if (!isSensorActive && (data.x !== 0 || data.y !== 0)) {
                    setIsSensorActive(true);
                }
            });
        };

        fetchData();
        subscribeSensors();
        return () => {
            subscription.current?.remove();
        };
    }, []);

    // --- 2. SENSOR CALIBRATION SIMULATION ---
    const handleCalibration = () => {
        setIsCalibrating(true);
        setTimeout(() => {
            setIsCalibrating(false);
            setIsCalibrated(true);
        }, 2000);
    };

    // --- 3. START CHALLENGE ---
    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No Team Session found.");
        
        setIsStarting(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "GPS is required to verify school zone.");
                setIsStarting(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const isWithinZone = 
                latitude >= -6.23 && latitude <= -6.19 && 
                longitude >= 106.79 && longitude <= 106.82;

            if (!isWithinZone) {
                Alert.alert("Outside Zone", "This activity must be performed within the Senayan/Sudirman school area.");
                setIsStarting(false);
                return;
            }

            const attemptRef = collection(db_cloud, "FC_Attempt");
            const q = query(
                attemptRef, 
                where("TeamID", "==", teamId), 
                where("ActivityID", "==", ACTIVITY_ID)
            );
            
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

            router.push('/breathing_activity');
            
        } catch (error) {
            console.error("Firestore Write Error:", error);
            Alert.alert("Error", "Could not record attempt. Check your internet connection.");
        } finally {
            setIsStarting(false);
        }
    };

    const completedTasks = [isSensorActive, isCalibrated, isUserPrepared, isSafeSpace].filter(Boolean).length;
    const progressPercent = (completedTasks / 4) * 100;
    const allRequirementsMet = progressPercent === 100;

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
            
            {/* --- TOP BAR --- */}
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
                    
                    {/* Title Section (Dynamic text color applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Readiness Phase:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Breathing Pace Trainer"}</Text>
                    </View>

                    {/* Instruction Box remains clean layout block */}
                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>Instructions:</Text>{"\n"}
                                • Place the phone gently on the chest.{"\n"}
                                • Record breathing at rest.{"\n"}
                                • Perform light exercise:{"\n"}
                                {"  "}- Jog one minute on the spot{"\n"}
                                {"  "}- 100 star jumps{"\n"}
                                • Record breathing again and compare results.{"\n\n"}
                                <Text style={styles.italicSubtext}>* Rotate for each team member</Text>
                            </Text>
                        </View>
                    </View>

                    {/* Dynamic section header applied */}
                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Team Readiness Checklist:</Text>

                    {/* Check 1: Accelerometer Active Data Streams */}
                    <View style={styles.checkItem}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isSensorActive ? "checkbox" : "square-outline"} 
                                size={24} color={isSensorActive ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Motion Sensor Connected</Text>
                        </View>
                        <View style={styles.sensorStreamContainer}>
                            <Text style={styles.streamText}>X: {accelData.x}</Text>
                            <Text style={styles.streamText}>Y: {accelData.y}</Text>
                            <Text style={styles.streamText}>Z: {accelData.z}</Text>
                        </View>
                    </View>

                    {/* Check 2: Respiratory Sensor Baseline Calibration */}
                    <View style={styles.checkItem}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isCalibrated ? "checkbox" : "square-outline"} 
                                size={24} color={isCalibrated ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Chest Placement Calibration</Text>
                        </View>
                        <View style={styles.calibrationContainer}>
                            <Text style={[styles.statusDescriptionText, isDarkMode && { color: currentTheme.textColor }]}>
                                {isCalibrated ? "Baseline calibration set!" : "Keep device still to capture resting depth"}
                            </Text>
                            <TouchableOpacity 
                                style={[styles.miniBtn, isCalibrated && styles.completedBtn]} 
                                onPress={handleCalibration}
                                disabled={isCalibrating}
                            >
                                {isCalibrating ? (
                                    <ActivityIndicator size="small" color="#000" />
                                ) : (
                                    <Text style={styles.miniBtnText}>{isCalibrated ? "RE-CALIBRATE" : "CALIBRATE"}</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Check 3: User Prepared */}
                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsUserPrepared(!isUserPrepared)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isUserPrepared ? "checkbox" : "square-outline"} size={24} color={isUserPrepared ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}>{` User prepared (${teamMemberCount} members)`}</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Check 4: Safe and Clear Space */}
                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsSafeSpace(!isSafeSpace)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isSafeSpace ? "checkbox" : "square-outline"} size={24} color={isSafeSpace ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> You are in a safe and clear space</Text>
                        </View>
                    </TouchableOpacity>

                    {allRequirementsMet && (
                        <TouchableOpacity 
                            style={[styles.startChallengeBtn, isStarting && { opacity: 0.7 }]}
                            onPress={handleStartChallenge}
                            disabled={isStarting}
                        >
                            {isStarting ? <ActivityIndicator color="#000" /> : <Text style={styles.startChallengeText}>Start Challenge</Text>}
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
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, lineHeight: 20, color: '#222' },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    italicSubtext: { fontFamily: 'BalsamiqSans_400Regular', fontStyle: 'italic', fontSize: 12, color: '#555' },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginBottom: 15 },
    checkItem: { marginBottom: 20 },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18 },
    sensorStreamContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingLeft: 30, paddingRight: 10 },
    streamText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#00E5FF', backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    calibrationContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingLeft: 30 },
    statusDescriptionText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#666', flex: 1, marginRight: 10 },
    miniBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    completedBtn: { backgroundColor: '#E0F7FA', borderColor: '#00E5FF' },
    miniBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11 },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 15, marginBottom: 20 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});