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

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "SD3h6F4QSqYpwFZiTI1Z"; 
const FLATNESS_TOLERANCE = 0.15; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ReactionActivityScreen() {
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
    
    const [phase, setPhase] = useState(1); 
    const [trial, setTrial] = useState(1); 
    const [gameState, setGameState] = useState<'idle' | 'waiting' | 'signal' | 'result'>('idle');
    const [reactionTime, setReactionTime] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);
    
    const [isFollowing, setIsFollowing] = useState(false);
    const [traceProgress, setTraceProgress] = useState(0); 

    // Sensor State tracking
    const [isFlat, setIsFlat] = useState(true);
    
    // UX ANNOUNCEMENT & BADGE TOAST STATES
    const [toastMessage, setToastMessage] = useState<string>('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    const signalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const traceInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTime = useRef<number>(0);
    const tracePos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const subscription = useRef<any>(null);

    // --- IN-APP BADGE TOAST NOTIFICATION OVERLAY ---
    const showToast = (msg: string) => {
        setToastMessage(msg);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2200),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    // --- 1. BACKGROUND ENVIRONMENT SENSOR SUBSCRIPTION ---
    useEffect(() => {
        if (gameState === 'result') {
            if (subscription.current) {
                subscription.current.remove();
                subscription.current = null;
            }
            return;
        }

        Accelerometer.setUpdateInterval(100);
        
        subscription.current = Accelerometer.addListener(accelerometerData => {
            const flat = Math.abs(accelerometerData.x) < FLATNESS_TOLERANCE && 
                         Math.abs(accelerometerData.y) < FLATNESS_TOLERANCE;
            
            setIsFlat(flat);

            if (!flat) {
                if (signalTimer.current) {
                    clearTimeout(signalTimer.current);
                    setGameState('idle');
                }
                setIsFollowing(false);
            }
        });

        return () => {
            if (subscription.current) subscription.current.remove();
        };
    }, [gameState]);

    // --- 2. FETCH TEAM & ATTEMPT DATA ---
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
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- 3. TRACING ENGINE ---
    useEffect(() => {
        if (phase === 3 && gameState === 'signal' && isFollowing && isFlat) {
            traceInterval.current = setInterval(() => {
                setTraceProgress(prev => {
                    if (prev >= 100) {
                        if (traceInterval.current) clearInterval(traceInterval.current);
                        const finalTraceTime = (Date.now() - startTime.current) / 1000;
                        setReactionTime(finalTraceTime);
                        setGameState('result');
                        showToast("Tracing complete!");
                        return 100;
                    }
                    return prev + 2.5; 
                });
            }, 16);
        } else {
            if (traceInterval.current) clearInterval(traceInterval.current);
        }
        return () => { if (traceInterval.current) clearInterval(traceInterval.current); };
    }, [isFollowing, phase, gameState, isFlat]);

    useEffect(() => {
        if (phase === 3) {
            let x = 0, y = 0;
            if (traceProgress < 33) {
                x = (traceProgress / 33) * (width * 0.25);
                y = (traceProgress / 33) * -50;
            } else if (traceProgress < 66) {
                const sub = (traceProgress - 33) / 33;
                x = (width * 0.25) - (sub * (width * 0.5));
                y = -50 + (sub * 100);
            } else {
                const sub = (traceProgress - 66) / 34;
                x = (-width * 0.25) + (sub * (width * 0.25));
                y = 50 - (sub * 50);
            }
            tracePos.setValue({ x, y });
        }
    }, [traceProgress]);

    // --- 4. FINISH HANDLER ---
    const handleFinishChallenge = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 55,
                workScore: 0,
                teacherID: 0
            });

            showToast("Data Packet Transmitted!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Reaction Board Challenge"
                    }
                });
            }, 1200);
        } catch (error) {
            console.error("Error saving results:", error);
            setAlertModal({
                visible: true,
                title: "Cloud Connection Failure",
                message: "Could not synchronize reaction profiles safely back to the database tracking schemas.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const nextStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (trial < 3) {
            setTrial(trial + 1);
            setGameState('idle');
        } else if (phase < 3) {
            setPhase(phase + 1);
            setTrial(1);
            setGameState('idle');
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotate Team Members",
                message: `Member ${currentMember} analytics captured. Pass the data logging board layout safely over to Member ${currentMember + 1}.`,
                type: 'info'
            });
            setCurrentMember(currentMember + 1);
            setPhase(1); setTrial(1); setGameState('idle');
        } else {
            handleFinishChallenge();
        }
    };

    // --- 5. INPUT ACTIONS WITH ANTI-CHEAT SAFETY ENFORCEMENT ---
    const startAction = () => {
        if (!isFlat) return; 
        setGameState('waiting');
        setReactionTime(0);
        setTraceProgress(0);
        if (phase < 3) {
            const delay = Math.floor(Math.random() * 2000) + 1500;
            signalTimer.current = setTimeout(() => {
                setGameState('signal');
                startTime.current = Date.now();
            }, delay);
        } else {
            setGameState('signal');
            startTime.current = Date.now();
        }
    };

    const handleTap = () => {
        if (!isFlat) return;
        if (gameState === 'signal' && phase < 3) {
            const computedTime = (Date.now() - startTime.current) / 1000;
            
            if (computedTime < 0.10) {
                if (signalTimer.current) clearTimeout(signalTimer.current);
                setGameState('idle');
                setReactionTime(0);
                
                setAlertModal({
                    visible: true,
                    title: "Anticipation Warning",
                    message: "Tapping in under 0,1 seconds is physically impossible without guessing. Wait fully for the flashing 'TAP!' cue to display.",
                    type: 'warning'
                });
                return;
            }

            setReactionTime(computedTime);
            setGameState('result');
            showToast("Reaction Logged!");
        } else if (gameState === 'waiting') {
            if (signalTimer.current) clearTimeout(signalTimer.current);
            setGameState('idle');
        }
    };

    const totalSteps = 9; 
    const currentStep = ((currentMember - 1) * totalSteps) + ((phase - 1) * 3) + (trial - 1);
    
    // FIXED: Renamed to stepProgressPercent to fully avoid the global DOM type 'ProgressEvent' collision name bug
    const stepProgressPercent = (currentStep / (totalMembers * totalSteps)) * 100;

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
            
            {/* --- IN-APP TOAST ACTION CONFIRMATION BADGE --- */}
            {toastMessage ? (
                <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
                    <Ionicons name="flash" size={18} color="#00E5FF" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            ) : null}

            {/* --- CRITICAL POP-UP ANNOUNCEMENT OVERLAY MODAL --- */}
            <Modal transparent visible={alertModal.visible} animationType="fade" onRequestClose={() => setAlertModal({ ...alertModal, visible: false })}>
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
                            style={[styles.modalButton, { backgroundColor: alertModal.type === 'error' ? "#FF5252" : "#000000" }]}
                            onPress={() => setAlertModal({ ...alertModal, visible: false })}
                            activeOpacity={0.8}
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
                                <View style={[styles.progressFill, { width: `${stepProgressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Live Recording</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.content}>
                    
                    {/* --- BACKGROUND TILT WARNING OVERLAY --- */}
                    {!isFlat && (
                        <View style={styles.pauseOverlay}>
                            <Ionicons name="phone-portrait-outline" size={64} color="#FF5252" style={styles.alertIcon} />
                            <Text style={styles.pauseText}>Continue once you are on a flat surface</Text>
                        </View>
                    )}

                    {/* Loose title parameters wired directly to currentTheme layout color rules */}
                    <View style={styles.titleSection}>
                        <Text style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Recording</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>Reaction Board Challenge</Text>
                        <Text style={styles.phaseIndicator}>
                            {phase === 1 ? "Dominant Hand" : phase === 2 ? "Non-Dominant" : "Tracing Challenge"}
                        </Text>
                    </View>

                    <View style={styles.timerContainer}>
                        <Text style={[styles.timerText, { color: currentTheme.textColor }]}>
                            {phase === 3 ? "Follow Time : " : "Reaction Time : "}
                            <Text style={styles.timerBold}>{reactionTime.toFixed(2).replace('.', ',')} SEC</Text>
                        </Text>
                    </View>

                    <View 
                        style={styles.interactiveZone}
                        onStartShouldSetResponder={() => true}
                        onResponderMove={() => { if (isFlat) setIsFollowing(true); }}
                        onResponderRelease={() => setIsFollowing(false)}
                    >
                        {phase < 3 ? (
                            <TouchableOpacity 
                                activeOpacity={0.8}
                                onPress={gameState === 'idle' ? startAction : handleTap}
                                style={[
                                    styles.mainCircle,
                                    gameState === 'signal' && styles.mainCircleSignal,
                                    gameState === 'result' && styles.mainCircleResult
                                ]}
                            >
                                <Text style={styles.circleText}>
                                    {gameState === 'idle' ? "TAP TO\nSTART" : 
                                     gameState === 'waiting' ? "WAIT..." : 
                                     gameState === 'signal' ? "TAP!" : "DONE"}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.traceZone}>
                                {gameState === 'idle' ? (
                                    <TouchableOpacity style={styles.mainCircle} onPress={startAction}>
                                        <Text style={styles.circleText}>START\nTRACE</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <Animated.View 
                                        style={[
                                            styles.traceTarget, 
                                            tracePos.getLayout(),
                                            isFollowing && styles.traceTargetActive
                                        ]} 
                                    />
                                )}
                            </View>
                        )}
                    </View>

                    {/* Status tracker parameters (Dynamic text styles configured) */}
                    <View style={styles.statusRow}>
                        <View style={styles.redDot} />
                        <Text style={[styles.statusText, { color: currentTheme.textColor }]}>
                            Member {currentMember} - Attempt {trial}/3
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
                                {currentMember === totalMembers && phase === 3 && trial === 3 ? "[FINISH]" : "[Next Step]"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true,
                            title: "Session Locked",
                            message: "Conclude your current task metrics logging loops entirely before backing out of the application.",
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

const styles = StyleSheet.create({
    background: { flex: 1 },
    safeArea: { flex: 1 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    toastContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 35, alignSelf: 'center', backgroundColor: '#333333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, flexDirection: 'row', alignItems: 'center', zIndex: 3000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2 },
    toastText: { fontFamily: 'BalsamiqSans_700Bold', color: '#FFFFFF', fontSize: 13, marginLeft: 8 },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    modalBox: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 25, alignItems: 'center', borderWidth: 2, borderColor: '#000000', elevation: 10 },
    modalTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 19, color: '#000000', marginTop: 15, marginBottom: 10, textAlign: 'center' },
    modalMessage: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#444444', textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    modalButton: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, width: '100%', alignItems: 'center' },
    modalButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#FFFFFF' },

    pauseOverlay: { position: 'absolute', top: -130, left: -20, width: width, height: height, backgroundColor: 'rgba(243, 240, 233, 0.95)', zIndex: 2000, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    alertIcon: { marginBottom: 15 },
    pauseText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000', textAlign: 'center', lineHeight: 26 },

    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    
    content: { flex: 1, paddingTop: 130, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110, justifyContent: 'space-between', position: 'relative' },
    titleSection: { alignItems: 'center' },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24 },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#4FC3F7', marginTop: 4 },
    timerContainer: { marginVertical: 5 },
    timerText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18 },
    timerBold: { fontFamily: 'BalsamiqSans_700Bold' },
    interactiveZone: { height: 180, justifyContent: 'center', alignItems: 'center', width: '100%' },
    mainCircle: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#4FC3F7', borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center', elevation: 4 },
    mainCircleSignal: { backgroundColor: '#FF5252' },
    mainCircleResult: { backgroundColor: '#B2FF59' },
    circleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, textAlign: 'center' },
    traceZone: { width: '100%', height: 150, justifyContent: 'center', alignItems: 'center' },
    traceTarget: { width: 75, height: 75, borderRadius: 37.5, backgroundColor: '#FF4081', borderWidth: 4, borderColor: '#FFF', elevation: 10 },
    traceTargetActive: { backgroundColor: '#00E5FF', borderColor: '#FFF', shadowColor: '#00E5FF', shadowOpacity: 1, shadowRadius: 15 }, 
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252', marginRight: 8 },
    statusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18 },
    nextBtn: { backgroundColor: '#4FC3F7', width: '85%', height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18 },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10 },
});