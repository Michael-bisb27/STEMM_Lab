import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    ImageBackground,
    LayoutAnimation,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- EXPONENT SENSORS IMPORT ---
import { Accelerometer } from 'expo-sensors';

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
import { humanOps } from '../database/db'; // Added to handle isolated high-velocity telemetry logs

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "KXCsIyy3aDNUJWtcmbgy"; 

const SHAKE_LIMIT = 1.6; 
const LOW_VIBRATION_THRESHOLD = 0.06;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HumanActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- STATES ---
    const [currentMember, setCurrentMember] = useState(1);
    const [totalMembers, setTotalMembers] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
    
    const [movement, setMovement] = useState(1); 
    const [attempt, setAttempt] = useState(1);   
    const [gameState, setGameState] = useState<'idle' | 'recording' | 'result'>('idle');
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);

    // Live Metrics Tracking
    const [elapsedTime, setElapsedTime] = useState(0);
    const [maxVibration, setMaxVibration] = useState(0);

    // UI NOTIFICATION & MODAL STATES
    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);
    const currentMaxVib = useRef<number>(0);
    const subscription = useRef<any>(null);

    // --- IN-APP TOAST NOTIFICATION HELPER ---
    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    // --- 1. REAL-TIME ACCELEROMETER SUBSCRIPTION ---
    useEffect(() => {
        if (gameState !== 'recording') {
            if (subscription.current) {
                subscription.current.remove();
                subscription.current = null;
            }
            return;
        }

        Accelerometer.setUpdateInterval(80); 
        
        subscription.current = Accelerometer.addListener(data => {
            const netForce = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
            const deviation = Math.abs(netForce - 1.0);

            if (deviation > currentMaxVib.current) {
                currentMaxVib.current = deviation;
                setMaxVibration(deviation);
            }

            if (deviation > SHAKE_LIMIT) {
                stopRecording(true);
            }
        });

        return () => {
            if (subscription.current) subscription.current.remove();
        };
    }, [gameState]);

    // --- 2. FETCH INITIALIZATION METADATA ---
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
                console.error("Error fetching laboratory setup configuration:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- 3. RECORDING CORE ENGINE & CAUTIONS ---
    const startRecording = () => {
        currentMaxVib.current = 0;
        setMaxVibration(0);
        setElapsedTime(0);
        setGameState('recording');
        
        startTimeRef.current = Date.now();
        recordingInterval.current = setInterval(() => {
            setElapsedTime(Date.now() - startTimeRef.current);
        }, 10);
    };

    const stopRecording = (failed = false) => {
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        
        if (failed) {
            setGameState('idle');
            Speech.speak("Movement too fast, please slow down.", { language: 'en' });
            setAlertModal({
                visible: true,
                title: "Movement Too Fast or Shaky!",
                message: "Please move slowly and with steady control. We detected jerky or abrupt movements that break the biomechanical recording.",
                type: 'warning'
            });
            return;
        } 
        
        if (elapsedTime < 2000) {
            setGameState('idle');
            setAlertModal({
                visible: true,
                title: "Activity Rushed!",
                message: "The recording was stopped too quickly to gather accurate biomechanical data. Please perform the full extension slowly.",
                type: 'warning'
            });
            return;
        }

        setGameState('result');
        if (currentMaxVib.current < LOW_VIBRATION_THRESHOLD) {
            Speech.speak("Vibration too low. Please perform complete movement extension.", { language: 'en' });
            setAlertModal({
                visible: true,
                title: "Insufficient Movement",
                message: "Vibration output too low. Please ensure you are performing the complete movement extension to track muscular force.",
                type: 'info'
            });
        } else {
            showToast("Movement Track Recorded!");

            // --- INJECT LOCAL SQLITE TELEMETRY SNAPSHOT WRITER ---
            try {
                humanOps.insertTrial({
                    attempt_id: lastAttemptId || "UNKNOWN",
                    member_number: currentMember,
                    movement_variant: movement,
                    attempt_number: attempt,
                    duration_ms: elapsedTime,
                    peak_vibration: currentMaxVib.current,
                    recorded_at: Date.now()
                });
            } catch (error) {
                console.error("Local SQLite database biomechanical logging error:", error);
            }
        }
    };

    // --- 4. DATA LOG SUBMISSION & FLOW ROUTING ---
    const handleFinishChallenge = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 60,
                workScore: 0,
                teacherID: "" 
            });

            showToast("Biomechanics log synced successfully.");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Human Performance Lab",
                        attemptId: lastAttemptId || "UNKNOWN" // Passed along to allow direct chart lookup down the pipeline
                    }
                });
            }, 1200);
        } catch (error) {
            console.error("Error committing score results:", error);
            setAlertModal({
                visible: true,
                title: "Synchronization Error",
                message: "Could not sync laboratory workspace results to the cloud servers.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const nextStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (attempt < 3) {
            setAttempt(attempt + 1);
            setGameState('idle');
            showToast(`Tracking Attempt ${attempt + 1}`);
        } else if (movement < 3) {
            setMovement(movement + 1);
            setAttempt(1);
            setGameState('idle');
            showToast(`Setup Movement ${movement + 1}`);
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotate Team Member",
                message: `Member ${currentMember} has completed their track. Safely hand the device over to Member ${currentMember + 1}.`,
                type: 'info'
            });
            setCurrentMember(currentMember + 1);
            setMovement(1); 
            setAttempt(1); 
            setGameState('idle');
        } else {
            handleFinishChallenge();
        }
    };

    const getMovementImage = () => {
        if (movement === 1) return require('../assets/images/human_snippet.png');
        if (movement === 2) return require('../assets/images/human_snippet2.png');
        return require('../assets/images/human_snippet3.png');
    };

    if (!fontsLoaded || loading) {
        /* Adaptive theme color fallback wrapper for loading state instances */
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
                    <View style={styles.topBar}>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${( ((currentMember - 1) * 9) + ((movement - 1) * 3) + (attempt - 1) ) / (totalMembers * 9) * 100}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Biomechanics Capture</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <View style={styles.content}>
                    
                    {/* Title Section (Dynamic text colors applied) */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Recording</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>Human Performance Lab</Text>
                        <Text style={styles.phaseIndicator}>Movement Layout Variant {movement}</Text>
                    </View>

                    {/* Diagram Display Window remains safe white background container block */}
                    <View style={styles.diagramDisplayWindow}>
                        <Image source={getMovementImage()} style={styles.activeMovementImage} />
                        <Text style={styles.imageCaption}>Execute Specified Track Path Slowly</Text>
                    </View>

                    {/* Metrics container elements tracking (Dynamic typography applied) */}
                    <View style={styles.metricsContainer}>
                        <Text style={[styles.metricLabel, { color: currentTheme.textColor }]}>
                            Duration: <Text style={styles.metricValue}>{(elapsedTime / 1000).toFixed(2)}s</Text>
                        </Text>
                        <Text style={[styles.metricLabel, { color: currentTheme.textColor }]}>
                            Peak Vibration: <Text style={styles.metricValue}>{maxVibration.toFixed(2)} G</Text>
                        </Text>
                    </View>

                    <View style={styles.interactiveZone}>
                        {gameState === 'idle' ? (
                            <TouchableOpacity activeOpacity={0.8} onPress={startRecording} style={styles.mainCircle}>
                                <Text style={styles.circleText}>START{"\n"}RECORDING</Text>
                            </TouchableOpacity>
                        ) : gameState === 'recording' ? (
                            <TouchableOpacity activeOpacity={0.8} onPress={() => stopRecording(false)} style={[styles.mainCircle, styles.mainCircleRecording]}>
                                <Text style={styles.circleText}>STOP &{"\n"}RECORD</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.mainCircle, styles.mainCircleCaptured]}>
                                <Ionicons name="checkmark-done-circle-outline" size={40} color="#000" />
                                <Text style={styles.circleText}>CAPTURED</Text>
                            </View>
                        )}
                    </View>

                    {/* Run Status Identifier (Dynamic text color configured) */}
                    <View style={styles.statusRow}>
                        <View style={styles.redDot} />
                        <Text style={[styles.statusText, { color: currentTheme.textColor }]}>
                            Member {currentMember} — Movement {movement}, Attempt {attempt}/3
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
                                {currentMember === totalMembers && movement === 3 && attempt === 3 ? "[FINISH]" : "[Next Step]"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true, title: "Action Locked", message: "Please save or complete the current data capture track first before exiting.", type: 'warning'
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
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25, zIndex: 4000 },
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
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    
    content: { flex: 1, paddingTop: 120, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 105, justifyContent: 'space-between' },
    titleSection: { alignItems: 'center', marginBottom: 5 },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24 },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#4FC3F7', marginTop: 2 },
    
    diagramDisplayWindow: { width: '85%', backgroundColor: '#FFF', borderRadius: 15, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#000' },
    activeMovementImage: { width: '100%', height: 90, resizeMode: 'contain' },
    imageCaption: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', marginTop: 5, fontStyle: 'italic' },
    
    metricsContainer: { flexDirection: 'row', width: '90%', justifyContent: 'space-around', marginVertical: 5 },
    metricLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    metricValue: { fontFamily: 'BalsamiqSans_700Bold', color: '#00E5FF' },
    
    interactiveZone: { height: 140, justifyContent: 'center', alignItems: 'center', width: '100%' },
    mainCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#4FC3F7', borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center', elevation: 4 },
    mainCircleRecording: { backgroundColor: '#FF5252' },
    mainCircleCaptured: { backgroundColor: '#B2FF59' },
    circleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, textAlign: 'center' },
    
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252', marginRight: 8 },
    statusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    
    nextBtn: { backgroundColor: '#4FC3F7', width: '85%', height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000' },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18 },
    
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10 },
});