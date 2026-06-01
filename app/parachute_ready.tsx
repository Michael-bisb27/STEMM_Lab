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
const ACTIVITY_ID = "Qvn4OR5l7pf9pCXB2pkq";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ParachuteReadyScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [teamMemberCount, setTeamMemberCount] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false);
    const [materialsChecked, setMaterialsChecked] = useState({
        toy: false,
        surface: false,
        canopy: false,
        string: false,
        scissors: false,
        tape: false
    });

    const [sensorCalibrated, setSensorCalibrated] = useState(false);
    const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0 });
    const subscription = useRef<any>(null);

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

        const subscribeAccelerometer = () => {
            Accelerometer.setUpdateInterval(100);
            subscription.current = Accelerometer.addListener(data => {
                setAccelerometerData({
                    x: Math.round(data.x * 100) / 100,
                    y: Math.round(data.y * 100) / 100,
                    z: Math.round(data.z * 100) / 100,
                });
            });
        };

        fetchData();
        subscribeAccelerometer();
        return () => {
            subscription.current?.remove();
        };
    }, []);

    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No Team Session found.");
        
        setIsStarting(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "GPS access is necessary to log experimental context.");
                setIsStarting(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const isWithinZone = 
                latitude >= -6.25 && latitude <= -6.18 &&  
                longitude >= 106.78 && longitude <= 106.83;

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

            router.push('/parachute_activity');
            
        } catch (error) {
            console.error("Firestore Write Error:", error);
            Alert.alert("Connection Error", "Could not submit flight profile. Verify network parameters.");
        } finally {
            setIsStarting(false);
        }
    };

    const toggleMaterial = (key: keyof typeof materialsChecked) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMaterialsChecked(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const allMaterialsSelected = Object.values(materialsChecked).every(Boolean);
    
    const completedTasks = [
        allMaterialsSelected, 
        sensorCalibrated, 
        isUserPrepared, 
        isSafeSpace
    ].filter(Boolean).length;
    
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
                                {progressPercent === 100 ? "Ready to Launch!" : `Readiness: ${Math.round(progressPercent)}%`}
                            </Text>
                        </View>

                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/history')}>
                            <Ionicons name="timer-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                {/* 🌟 ADDED testID FOR CORE SCROLL VIEW */}
                <ScrollView testID="readyScrollView" showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    {/* Title Section */}
                    <View testID="readyTitleSection" style={styles.titleSection}>
                        <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Setup Phase:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Parachute Drop Challenge"}</Text>
                    </View>

                    {/* Challenge Instructions */}
                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.instructionHeading}>Challenge Instructions</Text>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>1. </Text>Drop the toy without a parachute and record the fall (baseline test).{"\n\n"}
                                <Text style={styles.bold}>2. </Text>Build a parachute using provided materials.{"\n\n"}
                                <Text style={styles.bold}>3. </Text>Drop the toy from the same height and record the fall.{"\n\n"}
                                <Text style={styles.bold}>4. </Text>Review speed and landing accuracy results in the app.{"\n\n"}
                                <Text style={styles.bold}>5. </Text>Redesign and test up to three prototypes within 20 minutes.{"\n\n"}
                                <Text style={styles.bold}>6. </Text>Upload videos, results, and team reflections.
                            </Text>
                        </View>
                    </View>

                    {/* 🌟 ADDED testID TO THIS PLAIN TEXT COMPONENT */}
                    <Text testID="readinessHeading" style={[styles.checkpointHeadingUnderlined, { color: currentTheme.textColor }]}>Readiness Checklist</Text>

                    {/* --- CHECK 1: MATERIALS GRID --- */}
                    <View style={[styles.checkItem, styles.whiteCheckItem]}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={allMaterialsSelected ? "checkbox" : "square-outline"} 
                                size={24} color={allMaterialsSelected ? "#00E5FF" : "#000"} 
                            />
                            <Text style={styles.checkLabel}> Materials gathered</Text>
                        </View>
                        
                        <View style={styles.materialsSubGrid}>
                            {/* 🌟 ADDED INDIVIDUAL MATERIAL testIDs */}
                            <TouchableOpacity testID="mat-toy" style={styles.subCheckRow} onPress={() => toggleMaterial('toy')}>
                                <Ionicons name={materialsChecked.toy ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Small toy (e.g. army toy soldier)</Text>
                            </TouchableOpacity>

                            <TouchableOpacity testID="mat-surface" style={styles.subCheckRow} onPress={() => toggleMaterial('surface')}>
                                <Ionicons name={materialsChecked.surface ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Table or elevated surface</Text>
                            </TouchableOpacity>

                            <TouchableOpacity testID="mat-canopy" style={styles.subCheckRow} onPress={() => toggleMaterial('canopy')}>
                                <Ionicons name={materialsChecked.canopy ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Paper or plastic sheeting</Text>
                            </TouchableOpacity>

                            <TouchableOpacity testID="mat-string" style={styles.subCheckRow} onPress={() => toggleMaterial('string')}>
                                <Ionicons name={materialsChecked.string ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> String or lightweight twine</Text>
                            </TouchableOpacity>

                            <TouchableOpacity testID="mat-scissors" style={styles.subCheckRow} onPress={() => toggleMaterial('scissors')}>
                                <Ionicons name={materialsChecked.scissors ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Scissors</Text>
                            </TouchableOpacity>

                            <TouchableOpacity testID="mat-tape" style={styles.subCheckRow} onPress={() => toggleMaterial('tape')}>
                                <Ionicons name={materialsChecked.tape ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Tape</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* --- CHECK 2: SENSOR TELEMETRY --- */}
                    <View style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={sensorCalibrated ? "checkbox" : "square-outline"} 
                                size={24} color={sensorCalibrated ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Drop Telemetry Sensor Active</Text>
                        </View>
                        <View style={styles.sensorContainer}>
                            <View style={styles.telemetryWrapper}>
                                <Text style={[styles.telemetryText, isDarkMode && { color: currentTheme.textColor }]}>X-Axis: {accelerometerData.x}g</Text>
                                <Text style={[styles.telemetryText, isDarkMode && { color: currentTheme.textColor }]}>Y-Axis: {accelerometerData.y}g</Text>
                                <Text style={[styles.telemetryText, isDarkMode && { color: currentTheme.textColor }]}>Z-Axis: {accelerometerData.z}g</Text>
                            </View>
                            {/* 🌟 ADDED testID TO CALIBRATION BTN */}
                            <TouchableOpacity 
                                testID="sensorCalibrateButton"
                                style={[styles.calibrateBtn, sensorCalibrated && styles.calibratedStateBtn]} 
                                onPress={() => setSensorCalibrated(!sensorCalibrated)}
                            >
                                <Text style={styles.calibrateBtnText}>{sensorCalibrated ? "CALIBRATED" : "TEST TELEMETRY"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* --- CHECK 3: USER PREPARED --- */}
                    {/* 🌟 ADDED testID TO TEAM ROW */}
                    <TouchableOpacity testID="teamDeploymentCheck" style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]} onPress={() => setIsUserPrepared(!isUserPrepared)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isUserPrepared ? "checkbox" : "square-outline"} size={24} color={isUserPrepared ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}>{` Team deployment configured (${teamMemberCount} members)`}</Text>
                        </View>
                    </TouchableOpacity>

                    {/* --- CHECK 4: SAFE SPACE --- */}
                    {/* 🌟 ADDED testID TO SAFE SPACE ROW */}
                    <TouchableOpacity testID="safeSpaceCheck" style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]} onPress={() => setIsSafeSpace(!isSafeSpace)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isSafeSpace ? "checkbox" : "square-outline"} size={24} color={isSafeSpace ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> You are in a safe and clear space</Text>
                        </View>
                    </TouchableOpacity>

                    {/* ACTIVE TRIGGER BUTTON */}
                    {progressPercent === 100 && (
                        /* 🌟 ADDED testID TO FINAL TRIGGER ACTION */
                        <TouchableOpacity 
                            testID="startDropSessionButton"
                            style={[styles.startChallengeBtn, isStarting && { opacity: 0.7 }]}
                            onPress={handleStartChallenge}
                            disabled={isStarting}
                        >
                            {isStarting ? <ActivityIndicator color="#000" /> : <Text style={styles.startChallengeText}>Start Drop Session</Text>}
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
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, padding: 18, backgroundColor: 'white', marginBottom: 20 },
    overviewTextContainer: { flex: 1 },
    instructionHeading: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginBottom: 12, textDecorationLine: 'underline' },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 18, color: '#222' },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    checkpointHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginBottom: 15, marginTop: 5 },
    checkItem: { marginBottom: 20, backgroundColor: 'transparent', padding: 12, borderRadius: 15, borderWidth: 1 },
    whiteCheckItem: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#000' },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    materialsSubGrid: { marginTop: 10, paddingLeft: 28 },
    subCheckRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    subCheckLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#333' },
    sensorContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingLeft: 28 },
    telemetryWrapper: { flex: 1 },
    telemetryText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#555' },
    calibrateBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    calibratedStateBtn: { backgroundColor: '#00E5FF' },
    calibrateBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#000' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 10, marginBottom: 25 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 35, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, marginLeft: 10, color: '#000' },
});