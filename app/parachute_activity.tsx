import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Stack, useRouter } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { useVideoPlayer, VideoView } from 'expo-video';
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
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parachuteOps } from '../database/db';
import { db_cloud } from '../services/firebase_config';
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "Qvn4OR5l7pf9pCXB2pkq"; 
const MIN_VALID_FLIGHT_TIME_MS = 1200; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ParachuteActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // ─── Core Activity States ───────────────────────────────────────────
    const [actionPhase, setActionPhase] = useState<1 | 2 | 3>(1); 
    const [trial, setTrial] = useState<1 | 2 | 3>(1); 
    const [sessionState, setSessionState] = useState<'idle' | 'falling' | 'reviewing' | 'impact_captured'>('idle');
    const [dropTime, setDropTime] = useState<number>(0);
    const [showFormulaSheet, setShowFormulaSheet] = useState<boolean>(false);
    
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);

    const [maxGForce, setMaxGForce] = useState<number>(1.0);
    const [liveG, setLiveG] = useState<number>(1.0);
    
    // ─── Camera & Video Review States ────────────────────────────────────
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [reviewTime, setReviewTime] = useState<number>(0);

    const [toastMessage, setToastMessage] = useState<string>('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimestamp = useRef<number>(0);
    const subscription = useRef<any>(null);
    const cameraRef = useRef<CameraView>(null);
    const isRecordingRef = useRef<boolean>(false);

    // Instantiate modern native expo-video player interface
    const player = useVideoPlayer(videoUri || '', (p) => {
        p.loop = false;
        p.muted = true;
    });

    const checkDetoxBypass = (): boolean => {
        try {
            const { LaunchArguments } = require('react-native-launch-arguments');
            const args = LaunchArguments.value();
            return args && args.detoxSkipAuth === true;
        } catch (e) {
            return false;
        }
    };

    const showToast = (msg: string) => {
        setToastMessage(msg); 
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    // ─── Dynamic Video Uri Swap Binding ──────────────────────────────────
    useEffect(() => {
        if (videoUri && player) {
            player.replace(videoUri);
            player.currentTime = 0;
        }
    }, [videoUri, player]);

    useEffect(() => {
        (async () => {
            if (!checkDetoxBypass()) {
                await requestCameraPermission();
                await requestMediaLibraryPermission();
            }
        })();
    }, []);

    useEffect(() => {
        if (sessionState !== 'falling') {
            if (subscription.current) {
                subscription.current.remove();
                subscription.current = null;
            }
            return;
        }

        Accelerometer.setUpdateInterval(50); 
        
        subscription.current = Accelerometer.addListener(data => {
            const totalG = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
            setLiveG(Math.round(totalG * 100) / 100);

            if (totalG > maxGForce) {
                setMaxGForce(totalG);
            }
            
            if (totalG > 4.5) {
                handleImpactTrigger();
            }
        });

        return () => {
            if (subscription.current) subscription.current.remove();
        };
    }, [sessionState, maxGForce]);

    useEffect(() => {
        const fetchSessionMetadata = async () => {
            try {
                if (checkDetoxBypass()) {
                    setTeamId("DETOX-TEST-TEAM");
                    setLastAttemptId("DETOX-TEST-ATTEMPT");
                    setLoading(false);
                    return;
                }

                const auth = getAuth();
                const user = auth.currentUser;
                if (user) {
                    const studentDoc = await getDoc(doc(db_cloud, "MS_Student", user.uid));
                    if (studentDoc.exists()) {
                        const tId = studentDoc.data().teamID;
                        setTeamId(tId);

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
                console.error("Initialization failure:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSessionMetadata();
    }, []);

    // ─── Recording Control Operations ──────────────────────────────────
    const startDropTracking = async () => {
        if (!checkDetoxBypass() && (!cameraPermission?.granted || !mediaLibraryPermission?.granted)) {
            setAlertModal({
                visible: true,
                title: "Permissions Required",
                message: "Camera and Storage system clearance metrics are required to accurately map drops.",
                type: 'warning'
            });
            return;
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSessionState('falling');
        setDropTime(0);
        setReviewTime(0);
        setVideoUri(null);
        setMaxGForce(1.0);
        startTimestamp.current = Date.now();
        
        timerRef.current = setInterval(() => {
            setDropTime((Date.now() - startTimestamp.current) / 1000);
        }, 10);

        if (cameraRef.current) {
            try {
                isRecordingRef.current = true;
                cameraRef.current.recordAsync({
                    maxDuration: 15,
                }).then((file) => {
                    if (file?.uri) {
                        setVideoUri(file.uri);
                    }
                    isRecordingRef.current = false;
                }).catch(err => {
                    console.error("Recording processing drop caught:", err);
                    isRecordingRef.current = false;
                });
            } catch (err) {
                console.error("Failed initialization sync on camera pipeline:", err);
            }
        }
    };

    const handleImpactTrigger = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        
        const airtimeCalculatedMs = Date.now() - startTimestamp.current;
        if (airtimeCalculatedMs < MIN_VALID_FLIGHT_TIME_MS) {
            if (cameraRef.current && isRecordingRef.current) {
                try { cameraRef.current.stopRecording(); } catch (_) {}
            }
            setSessionState('idle');
            setDropTime(0);
            setMaxGForce(1.0);
            
            setAlertModal({
                visible: true,
                title: "Invalid Flight Time Detected",
                message: "The drop recorded was shorter than 1.2 seconds. Parachutes need proper clearance flight windows to expand canopy walls properly.",
                type: 'warning'
            });
            return;
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        
        if (cameraRef.current && isRecordingRef.current) {
            try {
                cameraRef.current.stopRecording();
            } catch (e) {
                console.error("Error stopping video stream:", e);
            }
        }
        
        setSessionState('reviewing');
        setReviewTime(0);
        setDropTime(0);
        showToast("Impact Landing Recorded! Review Footage.");
    };

    // ─── Frame Step Systems ─────────────────────────────────────────────
    const stepFrame = (direction: 'forward' | 'backward') => {
        if (player) {
            // ~33ms slice represents an exact single-frame segment shift for 30 FPS video
            const FRAME_TIME_SEC = 0.033; 
            const currentPos = player.currentTime;
            
            const newPos = direction === 'forward' 
                ? currentPos + FRAME_TIME_SEC 
                : Math.max(0, currentPos - FRAME_TIME_SEC);
            
            player.currentTime = newPos; // Synchronous native call updates UI immediately
            setReviewTime(newPos);
            setDropTime(newPos); // Keeps the on-screen timer perfectly synced with manual step frames
        }
    };

    const saveLandingFrameVideo = async () => {
        if (!checkDetoxBypass() && videoUri) {
            try {
                await MediaLibrary.saveToLibraryAsync(videoUri);
            } catch (err) {
                console.error("Media retention failure:", err);
                showToast("Hardware caching issue encountered saving video.");
            }
        }

        try {
            parachuteOps.insertTrial({
                attempt_id: lastAttemptId || "UNKNOWN",
                action_phase: actionPhase,
                trial_number: trial,
                air_time: dropTime,
                peak_g_force: maxGForce,
                recorded_at: Date.now()
            });
        } catch (error) {
            console.error("Local caching fallback exception:", error);
        }

        setAlertModal({
            visible: true,
            title: "Data Sequence Saved",
            message: "The current trial video has been cached locally. ⚠️ This has to be submitted in your final evaluation.",
            type: 'info'
        });

        setSessionState('impact_captured');
    };

    const commitSessionResults = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            if (checkDetoxBypass()) {
                showToast("Mock Data Packet Transmitted!");
                setTimeout(() => {
                    router.push({
                        pathname: '/activity_finish',
                        params: {
                            activityId: ACTIVITY_ID,
                            activityTitle: "Parachute Drop Challenge",
                            attemptId: lastAttemptId || "UNKNOWN"
                        }
                    });
                }, 1000);
                return;
            }

            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: 100,
                workScore: 0,
                teacherID: "" 
            });

            showToast("Data Packet Transmitted!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: {
                        activityId: ACTIVITY_ID,
                        activityTitle: "Parachute Drop Challenge",
                        attemptId: lastAttemptId || "UNKNOWN"
                    }
                });
            }, 1000);
        } catch (error) {
            console.error("Firestore submission anomaly:", error);
            setAlertModal({
                visible: true,
                title: "Network Synchronization Failure",
                message: "Unable to pass data parameters across active cloud routes.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const advanceExperimentalStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        if (trial < 3) {
            setTrial((trial + 1) as any);
            setSessionState('idle');
            setDropTime(0);
            setReviewTime(0);
            setVideoUri(null);
            showToast(`Advanced to Run Iteration #${trial + 1}`);
        } else if (actionPhase < 3) {
            setAlertModal({
                visible: true,
                title: "Canopy Phase Complete",
                message: `Action Prototype ${actionPhase} profiling successfully resolved. Reconfigure physical structural dimensions to execute Action Prototype ${actionPhase + 1}.`,
                type: 'info'
            });
            setActionPhase((actionPhase + 1) as any);
            setTrial(1);
            setSessionState('idle');
            setDropTime(0);
            setReviewTime(0);
            setVideoUri(null);
        } else {
            commitSessionResults();
        }
    };

    const toggleFormulaSheet = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowFormulaSheet(!showFormulaSheet);
    };

    const getPhaseLabel = () => {
        if (actionPhase === 1) return "Action 1: No Parachute Baseline Test";
        if (actionPhase === 2) return "Action 2: 4-Corner Plastic Matrix";
        return "Action 3: Custom Engineered Redesign";
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
                    <Ionicons name="flash-sharp" size={18} color="#00E5FF" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </Animated.View>
            ) : null}

            <Modal transparent visible={alertModal.visible} animationType="fade" onRequestClose={() => setAlertModal({ ...alertModal, visible: false })}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <Ionicons 
                            name={alertModal.type === 'error' ? "close-circle" : alertModal.type === 'warning' ? "warning" : "information-circle-sharp"} 
                            size={56} 
                            color={alertModal.type === 'error' ? "#FF5252" : alertModal.type === 'warning' ? "#FFB74D" : "#00E5FF"} 
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
                                <View style={[styles.progressFill, { width: `${((actionPhase - 1) * 3 + (trial - 1)) / 9 * 100}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Trial Logging Matrix</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.containerContent}>
                    
                    <View style={styles.titleSection}>
                        <Text testID="physicsProfileHeader" style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Physics Profile</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{getPhaseLabel()}</Text>
                        <Text style={[styles.phaseIndicator, isDarkMode && { color: '#00E5FF' }]}>Trial Run Iteration {trial} of 3</Text>
                    </View>

                    <View style={styles.dropdownContainer}>
                        <TouchableOpacity onPress={toggleFormulaSheet} style={styles.formulaDropdownHeader} activeOpacity={0.9}>
                            <Ionicons name={showFormulaSheet ? "book" : "book-outline"} size={18} color="#000" />
                            <Text style={styles.dropdownHeaderText}> View Reference Formulas & Science Specs</Text>
                            <Ionicons name={showFormulaSheet ? "chevron-up" : "chevron-down"} size={18} color="#000" style={styles.chevronIcon} />
                        </TouchableOpacity>

                        {showFormulaSheet && (
                            <ScrollView nestedScrollEnabled={true} style={styles.formulaScrollArea} showsVerticalScrollIndicator={true}>
                                <Text style={styles.sheetSectionTitle}>Forces Acting on Payload</Text>
                                <Text style={styles.sheetBodyText}>• Downward (Weight): Weight = mass × g</Text>
                                <Text style={styles.sheetBodyText}>• Upward (Drag): Aerodynamic resistance against canopy area</Text>
                                <Text style={styles.sheetBodyText}>• Net Force Matrix: Net Force = Weight – Drag Force</Text>
                                <Text style={styles.sheetBodyText}>• Newton's Second Law: Net Force = mass × acceleration</Text>
                            </ScrollView>
                        )}
                    </View>

                    {/* ─── Integrated Video & Camera Display Console Wrapper ─── */}
                    <View style={styles.displayConsoleWrapper}>
                        <View style={styles.telemetrySubPanel}>
                            <Text style={styles.telemetryReadoutLabel}>Live Acceleration Vector: <Text style={styles.telemetryValue}>{liveG.toFixed(2)} g</Text></Text>
                            <Text style={styles.telemetryReadoutLabel}>Peak Strain: <Text style={styles.telemetryValue}>{maxGForce.toFixed(2)} g</Text></Text>
                        </View>

                        <View style={styles.mediaContainerBox}>
                            {sessionState === 'idle' && (
                                <View style={styles.viewfinderPlaceholder}>
                                    <CameraView style={StyleSheet.absoluteFillObject} mode="video" facing="back" />
                                    <View style={styles.viewfinderOverlay}>
                                        <Ionicons name="camera-outline" size={28} color="#00E5FF" />
                                        <Text style={styles.viewfinderOverlayText}>Camera Pipeline Ready</Text>
                                    </View>
                                </View>
                            )}

                            {sessionState === 'falling' && (
                                <View style={styles.viewfinderPlaceholder}>
                                    <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} mode="video" facing="back" />
                                    <View style={[styles.viewfinderOverlay, { backgroundColor: 'rgba(255,82,82,0.15)' }]}>
                                        <View style={styles.recordingDot} />
                                        <Text style={[styles.viewfinderOverlayText, { color: '#FF5252' }]}>RECORDING FLIGHT DATA</Text>
                                    </View>
                                </View>
                            )}

                            {sessionState === 'reviewing' && (
                                <View style={styles.viewfinderPlaceholder}>
                                    {videoUri ? (
                                        <VideoView
                                            player={player}
                                            style={StyleSheet.absoluteFillObject}
                                            contentFit="contain"
                                        />
                                    ) : (
                                        <View style={styles.videoLoadingState}>
                                            <ActivityIndicator size="small" color="#00E5FF" />
                                            <Text style={styles.viewfinderOverlayText}>Processing Capture Clip...</Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            {sessionState === 'impact_captured' && (
                                <View style={styles.reviewCompleteBanner}>
                                    <Ionicons name="checkmark-done-circle" size={48} color="#00E5FF" />
                                    <Text style={styles.successCardHeadline}>Time Vector Confirmed</Text>
                                </View>
                            )}
                        </View>
                        
                        <View style={styles.timeMainTickerBox}>
                            <Text style={styles.timerLabelText}>
                                {sessionState === 'reviewing' ? "Reviewing Frame Timeline:" : "Calculated Air Time Profile:"}
                            </Text>
                            <Text style={[styles.timerBigDigits, sessionState === 'falling' && { color: '#FF5252' }]}>
                                {(sessionState === 'reviewing' ? reviewTime : dropTime).toFixed(2).replace('.', ',')} <Text style={styles.secSuffix}>SEC</Text>
                            </Text>
                        </View>

                        {/* Frame-by-frame controls */}
                        {sessionState === 'reviewing' && (
                            <View style={styles.scrubberControlBox}>
                                <TouchableOpacity style={styles.stepButton} onPress={() => stepFrame('backward')}>
                                    <Ionicons name="play-back" size={20} color="#000" />
                                    <Text style={styles.stepButtonText}>-1 Frame</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity style={[styles.stepButton, styles.confirmFrameBtn]} onPress={saveLandingFrameVideo}>
                                    <Ionicons name="save-outline" size={18} color="#000" />
                                    <Text style={styles.confirmFrameBtnText}>Confirm Frame</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.stepButton} onPress={() => stepFrame('forward')}>
                                    <Text style={styles.stepButtonText}>+1 Frame</Text>
                                    <Ionicons name="play-forward" size={20} color="#000" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <View style={styles.controlInteractionBlock}>
                        {sessionState === 'idle' && (
                            <TouchableOpacity testID="releasePayloadButton" activeOpacity={0.8} style={styles.primaryCircleLaunchBtn} onPress={startDropTracking}>
                                <Ionicons name="airplane-outline" size={32} color="#000" />
                                <Text style={styles.launchCircleText}>RELEASE PAYLOAD</Text>
                            </TouchableOpacity>
                        )}

                        {sessionState === 'falling' && (
                            <TouchableOpacity activeOpacity={0.8} style={[styles.primaryCircleLaunchBtn, styles.activeDropCaptureStyle]} onPress={handleImpactTrigger}>
                                <Ionicons name="disc-outline" size={32} color="#FFF" />
                                <Text style={[styles.launchCircleText, { color: '#FFF' }]}>CAPTURE IMPACT</Text>
                            </TouchableOpacity>
                        )}

                        {sessionState === 'reviewing' && (
                            <View style={styles.captureSuccessSplashCard}>
                                <Ionicons name="eye-outline" size={32} color="#00E5FF" />
                                <Text style={styles.successCardHeadline}>Isolate Landing Frame</Text>
                                <Text style={styles.successSubtext}>Scrub back/forth to frame point where parachute canvas settles on target boundary floor.</Text>
                            </View>
                        )}

                        {sessionState === 'impact_captured' && (
                            <View style={styles.captureSuccessSplashCard}>
                                <Ionicons name="cloud-upload-outline" size={32} color="#B2FF59" />
                                <Text style={styles.successCardHeadline}>Run Architecture Complete</Text>
                                <Text style={styles.successSubtext}>Proceed to capture parameters into final team logging array.</Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity 
                        style={[styles.nextBtn, sessionState !== 'impact_captured' && { opacity: 0.25 }]} 
                        onPress={advanceExperimentalStep}
                        disabled={sessionState !== 'impact_captured' || isFinishing}
                    >
                        {isFinishing ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.nextBtnText}>
                                {actionPhase === 3 && trial === 3 ? "[SYNCHRONIZE SESSION]" : "[Log & Move to Next Run]"}
                            </Text>
                        )}
                    </TouchableOpacity>

                </View>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true,
                            title: "Session Active",
                            message: "Please conclude your active structural drop simulation run before backing out of the lab module tracks.",
                            type: 'warning'
                        })}
                    >
                        <Ionicons name="arrow-back" size={20} color="#000" />
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

    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 13 },
    
    containerContent: { flex: 1, paddingTop: 115, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 100, justifyContent: 'space-between' },
    titleSection: { alignItems: 'center', marginTop: 5 },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22 },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#007AFF', marginTop: 4, textAlign: 'center' },
    
    dropdownContainer: { width: '100%', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#000', overflow: 'hidden', marginVertical: 4, maxHeight: 120 },
    formulaDropdownHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#E0E0E0' },
    dropdownHeaderText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000', flex: 1 },
    chevronIcon: { marginLeft: 5 },
    formulaScrollArea: { padding: 10, backgroundColor: '#FFF' },
    sheetSectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#007AFF', marginTop: 8, marginBottom: 4, textDecorationLine: 'underline' },
    sheetBodyText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#222', marginBottom: 2, lineHeight: 14 },

    displayConsoleWrapper: { width: '100%', backgroundColor: 'rgba(255,255,255,0.95)', padding: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', alignItems: 'center' },
    telemetrySubPanel: { width: '100%', borderBottomWidth: 1, borderBottomColor: '#DDD', paddingBottom: 6, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between' },
    telemetryReadoutLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#444' },
    telemetryValue: { fontFamily: 'BalsamiqSans_700Bold', color: '#FF5252' },
    
    mediaContainerBox: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#000', overflow: 'hidden', borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
    viewfinderPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    viewfinderOverlay: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
    viewfinderOverlayText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#00E5FF', marginLeft: 6 },
    recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', marginRight: 4 },
    videoLoadingState: { alignItems: 'center', justifyContent: 'center' },
    reviewCompleteBanner: { alignItems: 'center', justifyContent: 'center' },

    timeMainTickerBox: { alignItems: 'center', marginTop: 6 },
    timerLabelText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555' },
    timerBigDigits: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 32, color: '#000', marginTop: 1 },
    secSuffix: { fontSize: 16, fontFamily: 'BalsamiqSans_400Regular' },

    scrubberControlBox: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEE' },
    stepButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#BBB' },
    stepButtonText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, marginHorizontal: 4 },
    confirmFrameBtn: { backgroundColor: '#00E5FF', borderColor: '#000' },
    confirmFrameBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, marginLeft: 4 },

    controlInteractionBlock: { height: 130, justifyContent: 'center', alignItems: 'center', width: '100%' },
    primaryCircleLaunchBtn: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#B2FF59', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 4 },
    activeDropCaptureStyle: { backgroundColor: '#FF5252' },
    launchCircleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, textAlign: 'center', marginTop: 4, paddingHorizontal: 6, color: '#000' },
    captureSuccessSplashCard: { padding: 12, backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', width: '95%' },
    successCardHeadline: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#000', marginTop: 3 },
    successSubtext: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', textAlign: 'center', marginTop: 2 },

    nextBtn: { backgroundColor: '#4FC3F7', width: '90%', height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', marginBottom: 2 },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 80, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, marginLeft: 8, color: '#000' },
});