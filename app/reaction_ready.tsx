import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
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
import { db_cloud } from '../services/firebase_config';
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width } = Dimensions.get('window');
const FLATNESS_TOLERANCE = 10;
const ACTIVITY_ID = "SD3h6F4QSqYpwFZiTI1Z";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Per-screen content ───────────────────────────────────────────────────────
export default function ReactionReadyScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [teamMemberCount, setTeamMemberCount] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [trialCount, setTrialCount] = useState(0);
    
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false); 
    const [isRunning, setIsRunning] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);

    const [tilt, setTilt] = useState({ x: 0, y: 0 });
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
                            // cross-reference team members query
                            const studentsQuery = query(
                                collection(db_cloud, "MS_Student"),
                                where("teamID", "==", tId)
                            );
                            const querySnapshot = await getDocs(studentsQuery);
                            setTeamMemberCount(querySnapshot.size);

                            // fetch current trial count from attempts
                            const attemptRef = collection(db_cloud, "FC_Attempt");
                            const q = query(
                                attemptRef, 
                                where("TeamID", "==", tId), 
                                where("ActivityID", "==", ACTIVITY_ID)
                            );
                            const attemptSnapshot = await getDocs(q);
                            setTrialCount(attemptSnapshot.size);
                        }
                    }
                }
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        const subscribeTilt = () => {
            Accelerometer.setUpdateInterval(100);
            subscription.current = Accelerometer.addListener(data => {
                // map raw vector units to flat degree parameters
                setTilt({
                    x: Math.round(data.x * 90 * 10) / 10,
                    y: Math.round(data.y * 90 * 10) / 10,
                });
            });
        };

        fetchData();
        subscribeTilt();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            subscription.current?.remove();
        };
    }, []);

    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No Team Session found.");
        if (trialCount >= 3) return Alert.alert("Out of Trials", "Your team has used all available trials.");
        
        const proceedWithChallenge = async () => {
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

                // hardcoded regional school geofence check
                const isWithinZone = 
                    latitude >= -6.23 && latitude <= -6.19 && 
                    longitude >= 106.79 && longitude <= 106.82;

                if (!isWithinZone) {
                    Alert.alert("Outside Zone", "This activity must be performed within the Senayan/Sudirman school area.");
                    setIsStarting(false);
                    return;
                }

                const attemptRef = collection(db_cloud, "FC_Attempt");
                const nextTrialNumber = trialCount + 1;

                await addDoc(attemptRef, {
                    ActivityID: ACTIVITY_ID,
                    GPS_Coordinates: new GeoPoint(latitude, longitude),
                    TeamID: teamId,
                    VideoURL: "",
                    attemptAt: Timestamp.now(),
                    trialNumber: nextTrialNumber
                });

                router.push('/reaction_activity');
                
            } catch (error) {
                console.error("Firestore Write Error:", error);
                Alert.alert("Error", "Could not record attempt. Check your internet connection.");
            } finally {
                setIsStarting(false);
            }
        };

        // Pop up warning constraint before entering final trial
        if (trialCount === 2) {
            Alert.alert(
                "Final Trial Warning",
                "you only have one trial left, make sure you get the best accuracy and work score",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Continue", onPress: () => proceedWithChallenge() }
                ]
            );
        } else {
            await proceedWithChallenge();
        }
    };

    const handleStopwatchToggle = () => {
        if (isRunning) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsRunning(false);
        } else {
            setIsRunning(true);
            startTimeRef.current = Date.now() - (elapsedTime > 0 ? elapsedTime : 0);
            intervalRef.current = setInterval(() => {
                setElapsedTime(Date.now() - startTimeRef.current);
            }, 10);
        }
    };

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const milliseconds = ms % 1000;
        return `${seconds}.${milliseconds.toString().padStart(3, '0')} s`;
    };

    const isFlat = Math.abs(tilt.x) < FLATNESS_TOLERANCE && Math.abs(tilt.y) < FLATNESS_TOLERANCE;
    
    const allRequirementsMet = (elapsedTime > 0) && isFlat && isUserPrepared && isSafeSpace;
    const completedTasks = [elapsedTime > 0, isFlat, isUserPrepared, isSafeSpace].filter(Boolean).length;
    
    // avoid naming conflict with browser windows progressevent types
    const readinessProgressPercent = (completedTasks / 4) * 100;

    useEffect(() => {
        // fire spring animations natively on update shifts
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }, [completedTasks]);

    if (!fontsLoaded || loading) {
        // structural loader shell container to prevent early white flash updates
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
                                <View style={[styles.progressFill, { width: `${readinessProgressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>
                                {readinessProgressPercent === 100 ? "Ready!" : `Readiness: ${Math.round(readinessProgressPercent)}%`}
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
                    
                    <View style={styles.titleSection}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Readiness Phase:</Text>
                            <Text style={[styles.trialBadge, { color: trialCount >= 3 ? '#FF3B30' : '#00E5FF' }]}>
                                Trial {trialCount}/3
                            </Text>
                        </View>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Reaction Board Challenge"}</Text>
                    </View>

                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>Phase 1 – Tap Reaction: </Text>{"\n"}
                                Tap the screen as soon as the hidden button appears. Record reaction time. Rotate through each team member.{"\n\n"}
                                <Text style={styles.bold}>Phase 2 – Swap Hands: </Text>{"\n"}
                                3. Repeat using the non-dominant hand.{"\n"}
                                4. Compare results. Rotate through each team member.{"\n\n"}
                                <Text style={styles.bold}>Phase 3 – Tracing Challenge: </Text>{"\n"}
                                5. Trace a moving shape on the screen.{"\n"}
                                6. Review accuracy and delay. Rotate through each team member.
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Team Readiness Checklist:</Text>

                    <View style={styles.checkItem}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={elapsedTime > 0 ? "checkbox" : "square-outline"} 
                                size={24} color={elapsedTime > 0 ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Sensors checked</Text>
                        </View>
                        <View style={styles.sensorCheckContainer}>
                            <Text style={styles.stopwatchText}>{formatTime(elapsedTime)}</Text>
                            <TouchableOpacity style={[styles.miniBtn, isRunning && styles.stopBtn]} onPress={handleStopwatchToggle}>
                                <Text style={styles.miniBtnText}>{isRunning ? "STOP" : "TEST TAP"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.checkItem}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isFlat ? "checkbox" : "square-outline"} 
                                size={24} color={isFlat ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Surface ready (Flatness Meter)</Text>
                        </View>
                        <View style={styles.tiltMeterContainer}>
                            <View style={styles.tiltValues}>
                                <Text style={[styles.tiltText, Math.abs(tilt.x) > FLATNESS_TOLERANCE && styles.tiltWarning]}>
                                    X: {tilt.x > 0 ? `+${tilt.x}` : tilt.x}°
                                </Text>
                                <Text style={[styles.tiltText, Math.abs(tilt.y) > FLATNESS_TOLERANCE && styles.tiltWarning]}>
                                    Y: {tilt.y > 0 ? `+${tilt.y}` : tilt.y}°
                                </Text>
                            </View>
                            <View style={styles.levelBase}>
                                <View style={[styles.levelBubble, { left: 40 + (tilt.x * 2), top: 10 + (tilt.y * 2) }]} />
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsUserPrepared(!isUserPrepared)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isUserPrepared ? "checkbox" : "square-outline"} size={24} color={isUserPrepared ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}>{` User prepared (${teamMemberCount} members)`}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.checkItem} onPress={() => setIsSafeSpace(!isSafeSpace)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isSafeSpace ? "checkbox" : "square-outline"} size={24} color={isSafeSpace ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> You are in a safe and clear space</Text>
                        </View>
                    </TouchableOpacity>

                    {allRequirementsMet && (
                        <TouchableOpacity 
                            style={[
                                styles.startChallengeBtn, 
                                isStarting && { opacity: 0.7 },
                                trialCount >= 3 && styles.disabledTrialBtn
                            ]}
                            onPress={handleStartChallenge}
                            disabled={isStarting || trialCount >= 3}
                        >
                            {isStarting ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={[styles.startChallengeText, trialCount >= 3 && { color: '#FFF' }]}>
                                    {trialCount >= 3 ? "Out of Trials" : "Start Challenge"}
                                </Text>
                            )}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
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
    titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    trialBadge: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    phaseTag: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    activityName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, padding: 15, backgroundColor: 'white', marginBottom: 20 },
    overviewTextContainer: { flex: 1 },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, lineHeight: 16, color: '#222' },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginBottom: 15 },
    checkItem: { marginBottom: 20 },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18 },
    sensorCheckContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingLeft: 30 },
    stopwatchText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24, color: '#00E5FF' },
    miniBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 10 },
    stopBtn: { backgroundColor: '#FF8A80' },
    miniBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12 },
    tiltMeterContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingLeft: 30 },
    tiltValues: { marginRight: 20 },
    tiltText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, color: '#4FC3F7' },
    tiltWarning: { color: '#FF5252' },
    levelBase: { width: 100, height: 40, borderWidth: 1.5, borderColor: '#000', borderRadius: 20, backgroundColor: '#FFF' },
    levelBubble: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#00E5FF', position: 'absolute' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 10, marginBottom: 20 },
    disabledTrialBtn: { backgroundColor: '#FF3B30', borderColor: '#D32F2F', borderWidth: 1 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});