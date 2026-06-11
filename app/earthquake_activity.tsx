import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { getAuth } from 'firebase/auth';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    Timestamp,
    where
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    ImageBackground,
    LayoutAnimation,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { earthquakeOps } from '../database/db';
import { db_cloud } from '../services/firebase_config';
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "9QUEyTVnLCsuXBgWcCQs"; 
const TEST_DURATION_MS = 5000; 

// enable layout animation for android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Per-screen content ───────────────────────────────────────────────────────
export default function EarthquakeActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [currentMember, setCurrentMember] = useState(1);
    const [totalMembers, setTotalMembers] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);

    const [designNum, setDesignNum] = useState(1); 
    const [gameState, setGameState] = useState<'idle' | 'testing' | 'result'>('idle');
    const [countdown, setCountdown] = useState(TEST_DURATION_MS / 1000);
    
    const [currentGForce, setCurrentGForce] = useState(1.0);
    const [peakDeviation, setPeakDeviation] = useState(0); 
    const [averageTiltDeflection, setAverageTiltDeflection] = useState(0); 

    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    const testTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sensorSubscription = useRef<any>(null);
    const runningPeakRef = useRef<number>(0);
    const runningTiltSumRef = useRef<number>(0);
    const readingsCountRef = useRef<number>(0);

    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    useEffect(() => {
        if (gameState !== 'testing') {
            if (sensorSubscription.current) {
                sensorSubscription.current.remove();
                sensorSubscription.current = null;
            }
            return;
        }

        // spin up fast sensor polls to trace sudden stress shakes
        Accelerometer.setUpdateInterval(50); 
        
        sensorSubscription.current = Accelerometer.addListener(accelerometerData => {
            const totalG = Math.sqrt(
                accelerometerData.x ** 2 + 
                accelerometerData.y ** 2 + 
                accelerometerData.z ** 2
            );
            setCurrentGForce(Math.round(totalG * 100) / 100);

            const deviation = Math.abs(totalG - 1.0);
            if (deviation > runningPeakRef.current) {
                runningPeakRef.current = deviation;
            }

            // extract pitch tilt degrees using inverse cosine conversions
            const tiltDegrees = Math.acos(Math.min(Math.abs(accelerometerData.z), 1.0)) * (180 / Math.PI);
            runningTiltSumRef.current += tiltDegrees;
            readingsCountRef.current += 1;
        });

        return () => {
            if (sensorSubscription.current) sensorSubscription.current.remove();
        };
    }, [gameState]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const auth = getAuth();
                const user = auth.currentUser;
                if (user) {
                    const studentDoc = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                    if (studentDoc.exists()) {
                        const tId = studentDoc.data().teamID;
                        setTeamId(tId);

                        const qMembers = query(collection(db_cloud, "MS_Student"), where("teamID", "==", tId));
                        const memberSnap = await getDocs(qMembers);
                        setTotalMembers(memberSnap.size || 1);

                        // pull context parameters from the active loop setup session
                        const qAttempt = query(
                            collection(db_cloud, "FC_Attempt"),
                            where("TeamID", "==", tId),
                            where("ActivityID", "==", ACTIVITY_ID),
                            orderBy("attemptAt", "desc"),
                            limit(1)
                        );
                        const attemptSnap = await getDocs(qAttempt);
                        if (!attemptSnap.empty) {
                            setLastAttemptId(attemptSnap.docs[0].id);
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching earthquake structural sessions:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const startStructuralTest = () => {
        runningPeakRef.current = 0;
        runningTiltSumRef.current = 0;
        readingsCountRef.current = 0;
        
        setPeakDeviation(0);
        setAverageTiltDeflection(0);
        setCountdown(TEST_DURATION_MS / 1000);
        setGameState('testing');

        countdownIntervalRef.current = setInterval(() => {
            setCountdown(prev => (prev > 1 ? prev - 1 : 0));
        }, 1000);

        testTimerRef.current = setTimeout(() => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            
            // trigger early validation exits on cheat shakes or dead data
            if (runningPeakRef.current > 3.5) {
                setGameState('idle');
                setAlertModal({
                    visible: true,
                    title: "Extreme Force Detected",
                    message: "The simulated earthquake was unrealistically violent. Please place the testing rig on a flat table and shake it reasonably to ensure scientific accuracy.",
                    type: 'warning'
                });
                return;
            } else if (runningPeakRef.current < 0.05) {
                setGameState('idle');
                setAlertModal({
                    visible: true,
                    title: "No Movement Detected",
                    message: "We didn't detect any structural stress. Ensure the vibration engine (shaking) is active to properly test the structure.",
                    type: 'warning'
                });
                return;
            }

            // scalar conversion mapping total structural shake forces to approximate cm
            const computedMovecm = runningPeakRef.current * 12.5; 
            const computedAvgTilt = readingsCountRef.current > 0 
                ? runningTiltSumRef.current / readingsCountRef.current 
                : 0;

            const finalDisplacement = Math.round(computedMovecm * 10) / 10;
            const finalAngularTilt = Math.round(computedAvgTilt * 10) / 10;

            setPeakDeviation(finalDisplacement);
            setAverageTiltDeflection(finalAngularTilt);
            setGameState('result');
            showToast(`Simulation Complete: Design ${designNum}`);

            try {
                // backup verified simulation parameters directly to local sqlite database
                earthquakeOps.insertTrial({
                    attempt_id: lastAttemptId || "UNKNOWN",
                    member_number: currentMember,
                    design_number: designNum,
                    peak_displacement: finalDisplacement,
                    angular_deflection: finalAngularTilt,
                    recorded_at: Date.now()
                });
            } catch (error) {
                console.error("Local SQLite database structure caching failed:", error);
            }
        }, TEST_DURATION_MS);
    };

    const nextStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (designNum < 3) {
            setDesignNum(designNum + 1);
            setGameState('idle');
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotate Team Roles",
                message: `Design structures for Member ${currentMember} verified. Safely hand the physical testing rig to Member ${currentMember + 1}.`,
                type: 'info'
            });
            setCurrentMember(currentMember + 1);
            setDesignNum(1);
            setGameState('idle');
        } else {
            handleFinishChallenge();
        }
    };

    const handleFinishChallenge = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 75,
                workScore: 0,
                teacherID: "" 
            });

            showToast("Data Logged Successfully!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Earthquake-Resistant Structure",
                        attemptId: lastAttemptId || "UNKNOWN" 
                    }
                });
            }, 1000);
        } catch (error) {
            console.error("Error committing score profile metrics:", error);
            setAlertModal({
                visible: true,
                title: "Synchronization Error",
                message: "Could not complete data recording pipelines to the cloud servers.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const totalSteps = 3; 
    const currentStep = ((currentMember - 1) * totalSteps) + (designNum - 1) + (gameState === 'result' ? 1 : 0);
    const progressPercent = (currentStep / (totalMembers * totalSteps)) * 100;

    const getDesignLabel = (num: number) => {
        if (num === 1) return "Design 1 (4 Folds + 4 Pillars)";
        if (num === 2) return "Design 2 (10 Folds + 4 Pillars)";
        return "Design 3 (3 Folds + 6 Pillars)";
    };

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
            
            {toastMessage ? (
                <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#00E5FF" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            ) : null}

            <Modal transparent visible={alertModal.visible} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Ionicons 
                            name={alertModal.type === 'error' ? "close-circle" : alertModal.type === 'warning' ? "warning" : alertModal.type === 'success' ? "checkmark-circle" : "information-circle"} 
                            size={56} 
                            color={alertModal.type === 'error' ? "#FF5252" : alertModal.type === 'warning' ? "#FFB74D" : alertModal.type === 'success' ? "#00E676" : "#4FC3F7"} 
                        />
                        <Text style={styles.modalTitle}>{alertModal.title}</Text>
                        <Text style={styles.modalMessage}>{alertModal.message}</Text>
                        
                        <TouchableOpacity 
                            style={[styles.modalButton, { backgroundColor: alertModal.type === 'error' ? "#FF5252" : "#000" }]}
                            onPress={() => setAlertModal({ ...alertModal, visible: false })}
                        >
                            <Text style={styles.modalButtonText}>Acknowledge</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.rootTopBar}>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Structural Stress Records</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.content}>
                    
                    <View style={styles.titleSection}>
                        <Text style={[styles.recordingTag, { color: currentTheme.textColor }]}>Seismic Structural Monitor</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>Earthquake-Resistant Architecture Profile</Text>
                        <Text style={styles.phaseIndicator}>{getDesignLabel(designNum)}</Text>
                    </View>

                    <View style={styles.interactiveZone}>
                        {gameState === 'idle' && (
                            <TouchableOpacity style={styles.mainCircleIdle} onPress={startStructuralTest}>
                                <Ionicons name="play" size={40} color="#000" style={{ marginLeft: 6 }} />
                                <Text style={styles.circleText}>RUN SEISMIC{"\n"}TEST</Text>
                            </TouchableOpacity>
                        )}

                        {gameState === 'testing' && (
                            <View style={styles.mainCircleTesting}>
                                <Text style={styles.countdownNumber}>{countdown}s</Text>
                                <Text style={styles.testingLabel}>VIBRATING ENGINE ACTIVE</Text>
                                <Text style={styles.liveTelemetry}>Live Forces: {currentGForce} G</Text>
                            </View>
                        )}

                        {gameState === 'result' && (
                            <View style={styles.resultDisplayBox}>
                                <Text style={styles.resultsHeader}>TEST SIMULATION DATA:</Text>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultFieldLabel}>Estimated Movement:</Text>
                                    <Text style={styles.resultFieldValue}>+/- {peakDeviation} cm</Text>
                                </View>
                                <View style={styles.resultRow}>
                                    <Text style={styles.resultFieldLabel}>Outcome Deflection:</Text>
                                    <Text style={styles.resultFieldValue}>{averageTiltDeflection}° Angular deviation</Text>
                                </View>
                                <Text style={styles.instructionNote}>Copy these readings into your paper data table template.</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.statusRow}>
                        <View style={gameState === 'testing' ? styles.greenDot : styles.redDot} />
                        <Text style={[styles.statusText, { color: currentTheme.textColor }]}>
                            Member {currentMember}/{totalMembers} — Structure Profiling
                        </Text>
                    </View>

                    <TouchableOpacity 
                        style={[styles.nextBtn, (gameState !== 'result' || isFinishing) && { opacity: 0.3 }]} 
                        onPress={nextStep}
                        disabled={gameState !== 'result' || isFinishing}
                    >
                        {isFinishing ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.nextBtnText}>
                                {currentMember === totalMembers && designNum === 3 ? "[SUBMIT PROFILE RESULTS]" : "[Log Design Metrics]"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true,
                            title: "Action Locked",
                            message: "Please complete design simulation loops before dropping the structural recording environment track.",
                            type: 'warning'
                        })}
                    >
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
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    toastContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, alignSelf: 'center', backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, flexDirection: 'row', alignItems: 'center', zIndex: 3000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2 },
    toastText: { fontFamily: 'BalsamiqSans_700Bold', color: '#FFF', fontSize: 13, marginLeft: 8 },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    modalBox: { backgroundColor: '#FFF', width: '100%', borderRadius: 24, padding: 25, alignItems: 'center', borderWidth: 2, borderColor: '#000', elevation: 10 },
    modalTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000', marginTop: 15, marginBottom: 10, textAlign: 'center' },
    modalMessage: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#444', textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    modalButton: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, width: '100%', alignItems: 'center' },
    modalButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#FFF' },

    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    rootTopBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    content: { flex: 1, paddingTop: 130, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110, justifyContent: 'space-between' },
    titleSection: { alignItems: 'center', width: '100%' },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, textAlign: 'center' },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#007AFF', marginTop: 8, textAlign: 'center', textDecorationLine: 'underline' },
    interactiveZone: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', marginVertical: 20 },
    mainCircleIdle: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#4FC3F7', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5 },
    mainCircleTesting: { width: 180, height: 180, borderRadius: 90, backgroundColor: '#FF8A80', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 8, padding: 10 },
    countdownNumber: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 44, color: '#000' },
    testingLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#FFF', letterSpacing: 1, textAlign: 'center', marginTop: 4 },
    liveTelemetry: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000', marginTop: 4 },
    circleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 18, color: '#000' },
    resultDisplayBox: { width: '100%', backgroundColor: '#FFF', borderRadius: 20, borderWidth: 2, borderColor: '#000', padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
    resultsHeader: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, marginBottom: 12, textDecorationLine: 'underline', color: '#000' },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 6 },
    resultFieldLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#555' },
    resultFieldValue: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#007AFF' },
    instructionNote: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#888', fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
    redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252', marginRight: 8 },
    greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00E5FF', marginRight: 8 },
    statusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    nextBtn: { backgroundColor: '#4FC3F7', width: '90%', height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16, marginLeft: 10, color: '#000' },
});