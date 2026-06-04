import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
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

// --- EXPONENT SENSORS & SPEECH IMPORT ---
import { Accelerometer } from 'expo-sensors';
import * as Speech from 'expo-speech';

// --- FIREBASE IMPORTS ---
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
import { db_cloud } from '../services/firebase_config';

// --- LOCAL DATABASE UTILITIES IMPORT ---
import { breathingOps } from '../database/db'; // Added to track raw biomechanical telemetry inputs locally

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "U2gkCfB3uS6Z8jjmo3Kp"; 
const RECORDING_DURATION = 15; 
const MIN_BREATH_INTERVAL = 1200; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BreathingActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- SYSTEMS & TEAM STATES ---
    const [currentMember, setCurrentMember] = useState(1);
    const [totalMembers, setTotalMembers] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);

    // --- ACTIVITY FLOW STATES ---
    const [phase, setPhase] = useState(1); 
    const [gameState, setGameState] = useState<'idle' | 'countdown' | 'recording' | 'result'>('idle');
    const [countdown, setCountdown] = useState(3);
    const [timer, setTimer] = useState(RECORDING_DURATION);
    
    // --- RESPIRATORY MOTION SENSOR STATES ---
    const [peaks, setPeaks] = useState(0);
    const [calculatedRPM, setCalculatedRPM] = useState(0);

    // --- UI NOTIFICATION & MODAL STATES ---
    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    // Timers & Sensor Tracking References
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const subscription = useRef<any>(null);
    const lastZValueRef = useRef<number>(0);
    const isHeadingUpRef = useRef<boolean>(true);
    const lastPeakTimeRef = useRef<number>(0); 

    // --- IN-APP TOAST NOTIFICATION HELPER ---
    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    // --- 1. ACCELEROMETER ENGINE ---
    useEffect(() => {
        if (gameState !== 'recording') {
            if (subscription.current) {
                subscription.current.remove();
                subscription.current = null;
            }
            return;
        }

        Accelerometer.setUpdateInterval(120);
        
        subscription.current = Accelerometer.addListener(data => {
            const currentZ = data.z;

            if (Math.abs(data.x) > 0.7 || Math.abs(data.y) > 0.7) {
                if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
                setGameState('idle');
                
                setAlertModal({
                    visible: true,
                    title: "Device Displaced!",
                    message: "The device tilted too far and the recording was cancelled. Please place it completely flat on your chest to ensure accurate clinical results.",
                    type: 'error'
                });
                return;
            }

            const deltaZ = currentZ - lastZValueRef.current;
            const thresholdNoise = 0.015; 

            if (Math.abs(deltaZ) > thresholdNoise) {
                if (deltaZ > 0 && !isHeadingUpRef.current) {
                    isHeadingUpRef.current = true;
                } else if (deltaZ < 0 && isHeadingUpRef.current) {
                    isHeadingUpRef.current = false;
                    
                    const now = Date.now();
                    if (now - lastPeakTimeRef.current > MIN_BREATH_INTERVAL) {
                        setPeaks(prev => prev + 1);
                        lastPeakTimeRef.current = now;
                    }
                }
            }
            lastZValueRef.current = currentZ;
        });

        return () => {
            if (subscription.current) subscription.current.remove();
        };
    }, [gameState]);

    // --- 2. FETCH TEAM AND CORE SELECTION TARGETS ---
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
                console.error("Error fetching activity metadata:", error);
            } finally {
                loading && setLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- 3. TIMED RECORDING SEQUENCER ---
    const startBreathingTest = () => {
        setGameState('countdown');
        setCountdown(3);
        setPeaks(0);
        setCalculatedRPM(0);
        lastPeakTimeRef.current = 0; 

        countdownIntervalRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                    initiateRecording();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const initiateRecording = () => {
        setGameState('recording');
        setTimer(RECORDING_DURATION);

        recordingIntervalRef.current = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
                    wrapUpTest();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const wrapUpTest = () => {
        setGameState('result');
        
        Speech.speak("Recording done", {
            language: 'en',
            pitch: 1.0,
            rate: 1.0,
        });

        setPeaks(currentPeaks => {
            const finalRPM = currentPeaks * (60 / RECORDING_DURATION);
            setCalculatedRPM(finalRPM);

            // --- INJECT LOCAL SQLITE TELEMETRY RECORDER WRITER ---
            try {
                breathingOps.insertTrial({
                    attempt_id: lastAttemptId || "UNKNOWN",
                    member_number: currentMember,
                    phase_number: phase,
                    expansions_detected: currentPeaks,
                    calculated_rpm: finalRPM,
                    recorded_at: Date.now()
                });
            } catch (error) {
                console.error("Local database respiratory wave entry failure:", error);
            }

            if (finalRPM > 65 || finalRPM < 4) {
                setAlertModal({
                    visible: true,
                    title: "Suspicious Activity Detected",
                    message: "The respiratory data recorded is biologically highly unusual. This often happens if the device is manually shaken or the instructions are rushed. Please ensure scientific integrity.",
                    type: 'warning'
                });
            } else {
                showToast(`Phase Data Logged: ${finalRPM} RPM`);
            }

            return currentPeaks;
        });
    };

    // --- 4. DATA WRITER TO ROOT FIREBASE REPOSITORY ---
    const handleFinishChallenge = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 65,
                workScore: 0,
                teacherID: ""
            });

            showToast("Experiment Finalized!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Breathing Pace Trainer",
                        attemptId: lastAttemptId || "UNKNOWN" // Appended to support localized chart fetches
                    }
                });
            }, 1000);
        } catch (error) {
            console.error("Error saving results:", error);
            setAlertModal({
                visible: true,
                title: "Synchronization Error",
                message: "Could not synchronize recording data safely to the cloud.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const handleNextStepTransition = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (phase < 3) {
            setPhase(phase + 1);
            setGameState('idle');
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotation Required!",
                message: `Member ${currentMember} has completed their trials. Please safely hand the device over to Member ${currentMember + 1}.`,
                type: 'info'
            });
            setCurrentMember(currentMember + 1);
            setPhase(1);
            setGameState('idle');
        } else {
            handleFinishChallenge();
        }
    };

    const totalSteps = 3; 
    const currentStep = ((currentMember - 1) * totalSteps) + (phase - 1);
    const progressPercent = (currentStep / (totalMembers * totalSteps)) * 100;

    if (!fontsLoaded || loading) {
        /* Adaptive background color layout for activity loader instance */
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#141414' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        /* Dynamic Background Image Switch config alignment */
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {/* --- IN-APP TOAST NOTIFICATION BADGE --- */}
            {toastMessage ? (
                <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#00E5FF" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            ) : null}

            {/* --- CLEAR ANNOUNCEMENT POP-UP MODAL --- */}
            <Modal transparent visible={alertModal.visible} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Ionicons 
                            name={alertModal.type === 'error' ? "close-circle" : alertModal.type === 'warning' ? "warning" : "information-circle"} 
                            size={56} 
                            color={alertModal.type === 'error' ? "#FF5252" : alertModal.type === 'warning' ? "#FFB74D" : "#4FC3F7"} 
                        />
                        <Text style={styles.modalTitle}>{alertModal.title}</Text>
                        <Text style={styles.modalMessage}>{alertModal.message}</Text>
                        
                        <TouchableOpacity 
                            style={[styles.modalButton, { backgroundColor: alertModal.type === 'error' ? "#FF5252" : "#00" }]}
                            onPress={() => setAlertModal({ ...alertModal, visible: false })}
                        >
                            <Text style={styles.modalButtonText}>Acknowledge</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Chest Data Capture Engine</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.content}>
                    
                    {/* Title Section (Dynamic text color applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Recording</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>Breathing Pace Trainer</Text>
                        <View style={styles.phaseBadge}>
                            <Text style={styles.phaseIndicatorText}>
                                {phase === 1 ? "CONTEXT 1: At Rest" : phase === 2 ? "CONTEXT 2: After Jogging" : "CONTEXT 3: After Star Jumps"}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.monitorContainer}>
                        {gameState === 'idle' && (
                            <View style={styles.centerContainer}>
                                <Ionicons name="heart-outline" size={54} color="#4FC3F7" />
                                <Text style={styles.instructionContextText}>
                                    {phase === 1 && "Lie completely flat and rest phone over chest."}
                                    {phase === 2 && "Jog on spot for 1 min, then lay phone on chest."}
                                    {phase === 3 && "Perform 100 star jumps, then lay phone on chest."}
                                </Text>
                            </View>
                        )}
                        {gameState === 'countdown' && (
                            <Text style={styles.countdownValueText}>{countdown}</Text>
                        )}
                        {gameState === 'recording' && (
                            <View style={styles.centerContainer}>
                                <Text style={styles.liveTimerText}>{timer}s Remaining</Text>
                                <Text style={styles.livePulseLabel}>Tracking Motion...</Text>
                                <View style={styles.pulseContainer}>
                                    <View style={styles.pulseBar} />
                                </View>
                            </View>
                        )}
                        {gameState === 'result' && (
                            <View style={styles.centerContainer}>
                                <Text style={styles.bigRpmValue}>{calculatedRPM} RPM</Text>
                                <Text style={styles.subResultText}>{peaks} respiratory expansions detected</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.actionZone}>
                        {gameState === 'idle' && (
                            <TouchableOpacity style={styles.primaryActionButton} onPress={startBreathingTest}>
                                <Text style={styles.actionButtonText}>START CAPTURE</Text>
                            </TouchableOpacity>
                        )}
                        {(gameState === 'countdown' || gameState === 'recording') && (
                            <View style={[styles.primaryActionButton, styles.disabledButton]}>
                                <Text style={styles.actionButtonText}>RECORDING IN PROGRESS</Text>
                            </View>
                        )}
                        {gameState === 'result' && (
                            <TouchableOpacity style={[styles.primaryActionButton, styles.successButton]} onPress={handleNextStepTransition}>
                                <Text style={styles.actionButtonText}>
                                    {currentMember === totalMembers && phase === 3 ? "SAVE & COMPLETE" : "NEXT METRIC"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Status Tracker Row (Dynamic text color applied) */}
                    <View style={styles.statusRow}>
                        <View style={styles.liveMarkerDot} />
                        <Text style={[styles.statusText, { color: currentTheme.textColor }]}>
                            Member {currentMember}/{totalMembers} • Step {phase}/3
                        </Text>
                    </View>
                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true, title: "Action Locked", message: "Complete current active team capture matrix first.", type: 'warning'
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
    topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#333' },
    content: { flex: 1, paddingTop: 130, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110, justifyContent: 'space-between' },
    titleSection: { alignItems: 'center', width: '100%' },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24 },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic', marginTop: 2 },
    phaseBadge: { backgroundColor: '#E0F7FA', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginTop: 8, borderWidth: 1, borderColor: '#4FC3F7' },
    phaseIndicatorText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00B0FF' },
    monitorContainer: { minHeight: 180, width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 25, borderWidth: 2, borderColor: '#000', padding: 20, elevation: 2 },
    centerContainer: { alignItems: 'center', width: '100%' },
    instructionContextText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, textAlign: 'center', color: '#555', marginTop: 12, paddingHorizontal: 10, lineHeight: 20 },
    countdownValueText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 72, color: '#4FC3F7' },
    liveTimerText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 32, color: '#00E5FF' },
    livePulseLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#888', marginTop: 5 },
    pulseContainer: { height: 6, width: '60%', backgroundColor: '#E0E0E0', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
    pulseBar: { height: '100%', width: '30%', backgroundColor: '#00E5FF', borderRadius: 3 }, 
    bigRpmValue: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 46, color: '#00E676' },
    subResultText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', marginTop: 5 },
    actionZone: { width: '100%', alignItems: 'center' },
    primaryActionButton: { backgroundColor: '#4FC3F7', width: '90%', height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 3 },
    disabledButton: { backgroundColor: '#B0BEC5', borderColor: '#78909C' },
    successButton: { backgroundColor: '#00E676' },
    actionButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    liveMarkerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252', marginRight: 8 },
    statusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});