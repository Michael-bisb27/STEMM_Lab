import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
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
import { soundOps } from '../database/db';
import { db_cloud } from '../services/firebase_config';
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "0clUTH6JFi8V2uuexn9k"; 
const FLATNESS_TOLERANCE = 0.15; 

// allow layout animations on android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Per-screen content ───────────────────────────────────────────────────────
export default function SoundActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;
    const [currentMember, setCurrentMember] = useState(1);
    const [totalMembers, setTotalMembers] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
    
    const [currentAction, setCurrentAction] = useState(1); 
    const [gameState, setGameState] = useState<'idle' | 'recording' | 'result'>('idle');
    const [currentDb, setCurrentDb] = useState(30);
    const [peakDb, setPeakDb] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);
    const [isFlat, setIsFlat] = useState(true);
    
    const [toastMessage, setToastMessage] = useState<string>('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });
    const samplingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const animationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const sensorSubscription = useRef<any>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    
    const isStartingRecordingRef = useRef(false);
    const isCancellingRecordingRef = useRef(false);
    const isUnloadingRecordingRef = useRef(false); // ← INFALLIBLE HARDWARE MULTI-THREAD LOCK

    const showToast = (msg: string) => {
        setToastMessage(msg);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2200),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    useEffect(() => {
        if (gameState === 'result') {
            if (sensorSubscription.current) {
                sensorSubscription.current.remove();
                sensorSubscription.current = null;
            }
            if (recordingRef.current && !isUnloadingRecordingRef.current) {
                isUnloadingRecordingRef.current = true;
                recordingRef.current.stopAndUnloadAsync()
                    .catch(() => {})
                    .finally(() => {
                        recordingRef.current = null;
                        isUnloadingRecordingRef.current = false;
                    });
            }
            return;
        }
        Accelerometer.setUpdateInterval(120); 
        
        sensorSubscription.current = Accelerometer.addListener(accelerometerData => {
            const flat = Math.abs(accelerometerData.x) < FLATNESS_TOLERANCE && 
                         Math.abs(accelerometerData.y) < FLATNESS_TOLERANCE;
            
            setIsFlat(flat);
            if (!flat && gameState === 'recording') {
                cancelSampling().then(() => {
                    setAlertModal({
                        visible: true,
                        title: "Monitoring Aborted",
                        message:
                            "The device was moved or tilted during active acoustic sampling. Please place the device flat and restart the measurement.",
                        type: 'warning'
                    });
                });
            }
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
                console.error("Error pulling tracking configuration records:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);
    
    useEffect(() => {
        return () => {
            cancelSampling().catch(() => {});
        };
    }, []);

    const handleFinishChallenge = async () => {
        if (isFinishing) return;
        setIsFinishing(true);
        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 50,
                workScore: 0,
                teacherID: "" 
            });
            showToast("Acoustic Profile Synchronized!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Sound Pollution Hunter",
                        attemptId: lastAttemptId || "UNKNOWN" 
                    }
                });
            }, 1200);
        } catch (error) {
            console.error("Failed writing outcome summary metrics:", error);
            setAlertModal({
                visible: true,
                title: "Synchronization Error",
                message: "Failed to securely write the final laboratory data packet over active firestore paths.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const nextStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (currentAction < 3) {
            setCurrentAction(currentAction + 1);
            setGameState('idle');
            setPeakDb(0);
            setCurrentDb(30);
            showToast(`Switched to Step Action #${currentAction + 1}`);
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotate Team Roles",
                message: `Member ${currentMember} acoustic records successfully mapped. Hand the device over to Member ${currentMember + 1} to begin their monitoring loop.`,
                type: 'info'
            });
            setCurrentMember(currentMember + 1);
            setCurrentAction(1);
            setGameState('idle');
            setPeakDb(0);
            setCurrentDb(30);
        } else {
            handleFinishChallenge();
        }
    };

    const cancelSampling = async () => {
        if (isCancellingRecordingRef.current) return;
        isCancellingRecordingRef.current = true;
        try {
            if (animationInterval.current) {
                clearInterval(animationInterval.current);
                animationInterval.current = null;
            }
            if (samplingTimer.current) {
                clearTimeout(samplingTimer.current);
                samplingTimer.current = null;
            }
            if (recordingRef.current && !isUnloadingRecordingRef.current) {
                isUnloadingRecordingRef.current = true;
                try {
                    await recordingRef.current.stopAndUnloadAsync();
                } catch (err) {}

                try {
                    const uri = recordingRef.current.getURI();
                    if (uri) {
                        await FileSystem.deleteAsync(uri, {
                            idempotent: true,
                        });
                    }
                } catch (err) {
                    console.error("FileSystem cleanup error:", err);
                }
                recordingRef.current = null;
                isUnloadingRecordingRef.current = false;
            }
        } finally {
            isCancellingRecordingRef.current = false;
        }
        setGameState('idle');
        setCurrentDb(30);
        setPeakDb(0);
    };

    const startAudioSampling = async () => {
        if (!isFlat) {
            setAlertModal({
                visible: true,
                title: "Device Not Flat",
                message: "Calibrating: Place mobile phone flat on target evaluation surface desk to gather telemetry.",
                type: 'warning'
            });
            return;
        }
        if (gameState === 'recording') return;
        if (recordingRef.current) return;
        if (isStartingRecordingRef.current) return;
        if (isCancellingRecordingRef.current) return;
        if (isUnloadingRecordingRef.current) return;
        isStartingRecordingRef.current = true;

        try {
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                setAlertModal({
                    visible: true,
                    title: "Permission Denied",
                    message: "Microphone access is required for acoustic sampling.",
                    type: 'warning'
                });
                return;
            }

            setGameState('recording');
            setPeakDb(0);
            let absolutePeak = 30;

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const recording = new Audio.Recording();
            recordingRef.current = recording;

            try {
                await recording.prepareToRecordAsync({
                    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
                    isMeteringEnabled: true,
                });
                await recording.startAsync();
            } catch (initErr) {
                if (!isUnloadingRecordingRef.current) {
                    isUnloadingRecordingRef.current = true;
                    try {
                        await recording.stopAndUnloadAsync();
                    } catch (_) {}
                    isUnloadingRecordingRef.current = false;
                }
                recordingRef.current = null;
                throw initErr; 
            }

            animationInterval.current = setInterval(async () => {
                if (!recordingRef.current) return;
                try {
                    const status = await recordingRef.current.getStatusAsync();
                    if (status.isRecording && status.metering !== undefined) {
                        const sampleDb = Math.round(
                            Math.max(30, Math.min(120, status.metering + 90))
                        );
                        setCurrentDb(sampleDb);
                        if (sampleDb > absolutePeak) {
                            absolutePeak = sampleDb;
                            setPeakDb(absolutePeak);
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }, 100);

            samplingTimer.current = setTimeout(async () => {
                if (isUnloadingRecordingRef.current) return;
                isUnloadingRecordingRef.current = true;
                try {
                    if (animationInterval.current) {
                        clearInterval(animationInterval.current);
                        animationInterval.current = null;
                    }

                    if (recordingRef.current) {
                        const currentRecording = recordingRef.current;
                        try {
                            await currentRecording.stopAndUnloadAsync();
                            const uri = currentRecording.getURI();
                            if (uri) {
                                await FileSystem.deleteAsync(uri, { idempotent: true });
                            }
                        } catch (err) {
                            console.error("Timeout native unload error:", err);
                        }
                        recordingRef.current = null;
                    }

                    if (absolutePeak <= 35) {
                        setGameState('idle');
                        setCurrentDb(30);
                        setPeakDb(0);
                        setAlertModal({
                            visible: true,
                            title: "Acoustic Sample Invalid",
                            message: "The recorded amplitude showed zero wave variance. Please ensure you execute the active sound action directly adjacent to the workbench surface framework.",
                            type: 'warning'
                        });
                    } else {
                        setGameState('result');
                        showToast("Acoustic wave capturing finalized!");
                        try {
                            soundOps.insertTrial({
                                attempt_id: lastAttemptId || "UNKNOWN",
                                member_number: currentMember,
                                action_phase: currentAction,
                                peak_db: absolutePeak,
                                recorded_at: Date.now()
                            });
                        } catch (error) {
                            console.error("Local SQLite database write exception:", error);
                        }
                    }
                } catch (err) {
                    console.error("Sampling completion error:", err);
                    if (animationInterval.current) clearInterval(animationInterval.current);
                    setGameState('idle');
                    setCurrentDb(30);
                    setPeakDb(0);
                } finally {
                    isUnloadingRecordingRef.current = false;
                }
            }, 4000);
        } catch (err) {
            console.error("Audio initialization error:", err);
            await cancelSampling();
        } finally {
            isStartingRecordingRef.current = false;
        }
    };

    const getRiskMitigationTag = (db: number) => {
        if (db < 30) return "No risk - Ultra Quiet Ambient Space";
        if (db < 60) return "Safe Environment for prolonged monitoring profiles";
        if (db < 85) return "Generally safe; heavy exposure triggers fatigue thresholds";
        if (db < 90) return "Hearing damage potential localized over sustained exposures";
        if (db <= 100) return "Hearing damage likely. Short duration threshold alert!";
        return "Critical Hazard: Serious permanent auditory distortion minutes!";
    };

    const getDynamicGaugeColor = () => {
        if (gameState !== 'recording' && gameState !== 'result') return '#4FC3F7';
        if (currentDb < 60) return '#B2FF59'; 
        if (currentDb < 85) return '#FFEE58'; 
        return '#FF5252'; 
    };

    const totalSteps = 3; 
    const currentStep = ((currentMember - 1) * totalSteps) + (currentAction - 1);
    const sessionProgressPercent = (currentStep / (totalMembers * totalSteps)) * 100;

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {toastMessage ? (
                <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
                    <Ionicons name="volume-high" size={18} color="#00E5FF" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            ) : null}

            <Modal transparent visible={alertModal.visible} animationType="fade" onRequestClose={() => setAlertModal({ ...alertModal, visible: false })}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Ionicons 
                            name={alertModal.type === 'error' ? "close-circle" : alertModal.type === 'warning' ? "warning" : "information-circle-sharp"} 
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
                                <View style={[styles.progressFill, { width: `${sessionProgressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Acoustic Tracking Session</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.content}>

                    <View style={styles.titleSection}>
                        <Text style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Wave Capture</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>Sound Pollution Hunter</Text>
                        <Text style={styles.phaseIndicator}>
                            {currentAction === 1 ? "Experiment Action 1: Object Dropping (Pens/Books)" : 
                             currentAction === 2 ? "Experiment Action 2: Vocal/Walking Level Checks" : 
                             "Experiment Action 3: Floor Stamping Impact Study"}
                        </Text>
                    </View>

                    <View style={styles.gaugeContainer}>
                        <View style={[styles.outerGaugeRing, { borderColor: getDynamicGaugeColor() }]}>
                            <Text style={styles.dbValueMain}>{currentDb}</Text>
                            <Text style={styles.dbUnitLabel}>dB SPL</Text>
                        </View>
                    </View>

                    <View style={styles.metricsContainer}>
                        <Text style={[styles.metricText, { color: currentTheme.textColor }]}>
                            Evaluated Peak Value: <Text style={styles.metricBold}>{peakDb > 0 ? `${peakDb} dB` : "-- dB"}</Text>
                        </Text>
                        {gameState === 'result' && (
                            <View style={styles.riskBadgeContainer}>
                                <Text style={styles.riskClassificationTitle}>Risk Matrix Analysis Result:</Text>
                                <Text style={styles.riskClassificationText}>{getRiskMitigationTag(peakDb)}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.interactiveZone}>
                        {gameState === 'idle' ? (
                            <TouchableOpacity activeOpacity={0.8} onPress={startAudioSampling} style={styles.mainCaptureBtn}>
                                <Ionicons name="mic-outline" size={32} color="#000" />
                                <Text style={styles.captureBtnText}>INITIALIZE MONITORING</Text>
                            </TouchableOpacity>
                        ) : gameState === 'recording' ? (
                            <View style={[styles.samplingPulseBase, { backgroundColor: getDynamicGaugeColor() + '33' }]}>
                                <Text style={styles.samplingStatusText}>RECORDING... KEEP STABLE</Text>
                            </View>
                        ) : (
                            <View style={styles.completionIndicatorBox}>
                                <Ionicons name="checkmark-circle-outline" size={28} color="#B2FF59" />
                                <Text style={[styles.completionIndicatorText, { color: currentTheme.textColor }]}>Step capture execution finalized</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.statusRow}>
                        <View style={styles.redDot} />
                        <Text style={[styles.statusText, { color: currentTheme.textColor }]}>
                            Member {currentMember} of {totalMembers} — Target Phase {currentAction}/3
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
                                {currentMember === totalMembers && currentAction === 3 ? "[FINALIZE PROFILE]" : "[Next Target Action]"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true,
                            title: "Framework Tracking Locked",
                            message: "Please conclude all target tracking intervals across remaining active participants completely before exiting laboratory configurations.",
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
    
    toastContainer: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 35, alignSelf: 'center', backgroundColor: '#333333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 25, flexDirection: 'row', alignItems: 'center', zIndex: 3000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2 },
    toastText: { fontFamily: 'BalsamiqSans_700Bold', color: '#FFFFFF', fontSize: 13, marginLeft: 8 },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25 },
    modalBox: { backgroundColor: '#FFFFFF', width: '100%', borderRadius: 24, padding: 25, alignItems: 'center', borderWidth: 2, borderColor: '#000000', elevation: 10 },
    modalTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 19, color: '#000000', marginTop: 15, marginBottom: 10, textAlign: 'center' },
    modalMessage: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#444444', textAlign: 'center', lineHeight: 22, marginBottom: 25 },
    modalButton: { paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, width: '100%', alignItems: 'center' },
    modalButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#FFFFFF' },

    pauseOverlay: { position: 'absolute', top: -130, left: -20, width: width, height: height, zIndex: 2000, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    alertIcon: { marginBottom: 15 },
    pauseText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, textAlign: 'center', lineHeight: 26 },

    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    
    content: { flex: 1, paddingTop: 130, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110, justifyContent: 'space-between', position: 'relative' },
    titleSection: { alignItems: 'center', width: '100%' },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 24, textAlign: 'center' },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#4FC3F7', marginTop: 6, textAlign: 'center', paddingHorizontal: 10 },
    
    gaugeContainer: { marginVertical: 10, justifyContent: 'center', alignItems: 'center' },
    outerGaugeRing: { width: 150, height: 150, borderRadius: 75, borderWidth: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    dbValueMain: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 42, color: '#000' },
    dbUnitLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', marginTop: -2 },

    metricsContainer: { width: '100%', paddingHorizontal: 15, alignItems: 'center' },
    metricText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 16 },
    metricBold: { fontFamily: 'BalsamiqSans_700Bold', color: '#00E5FF', fontSize: 18 },
    riskBadgeContainer: { marginTop: 10, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', borderRadius: 12, padding: 12, width: '100%', alignItems: 'center' },
    riskClassificationTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#FF5252', marginBottom: 2 },
    riskClassificationText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, textAlign: 'center', color: '#333' },

    interactiveZone: { height: 75, justifyContent: 'center', alignItems: 'center', width: '100%' },
    mainCaptureBtn: { backgroundColor: '#4FC3F7', flexDirection: 'row', width: '85%', height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', elevation: 3 },
    captureBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, marginLeft: 8, color: '#000' },
    samplingPulseBase: { width: '85%', height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', borderStyle: 'dashed' },
    samplingStatusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#000' },
    completionIndicatorBox: { flexDirection: 'row', alignItems: 'center' },
    completionIndicatorText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, marginLeft: 6 },

    statusRow: { flexDirection: 'row', alignItems: 'center' },
    redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5252', marginRight: 8 },
    statusText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16 },
    nextBtn: { backgroundColor: '#4FC3F7', width: '85%', height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000' },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});