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
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- SENSORS IMPORT ---
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
const ACTIVITY_ID = "Qvn4OR5l7pf9pCXB2pkq"; 
const MIN_VALID_FLIGHT_TIME_MS = 1200; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ParachuteActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- EXPERIMENTAL STRUCTURAL STATES ---
    const [actionPhase, setActionPhase] = useState<1 | 2 | 3>(1); 
    const [trial, setTrial] = useState<1 | 2 | 3>(1); 
    const [sessionState, setSessionState] = useState<'idle' | 'falling' | 'impact_captured'>('idle');
    const [dropTime, setDropTime] = useState<number>(0);
    const [showFormulaSheet, setShowFormulaSheet] = useState<boolean>(false);
    
    // Cloud Core Metadata Tracking
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);

    // Live Sensor Telemetry Metrics
    const [maxGForce, setMaxGForce] = useState<number>(1.0);
    const [liveG, setLiveG] = useState<number>(1.0);
    
    // UI NOTIFICATION & MODAL STATES
    const [toastMessage, setToastMessage] = useState<string>('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    // Internal Timers and References
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimestamp = useRef<number>(0);
    const subscription = useRef<any>(null);

    // --- HELPER TO CHECK DETOX BYPASS FLAG ---
    const checkDetoxBypass = (): boolean => {
        try {
            // Inline require avoids build-time crashes if package isn't linked yet
            const { LaunchArguments } = require('react-native-launch-arguments');
            const args = LaunchArguments.value();
            return args && args.detoxSkipAuth === true;
        } catch (e) {
            return false;
        }
    };

    // --- TOAST DISPLAY ACTION TRIGGER ---
    const showToast = (msg: string) => {
      setToastMessage(msg); 
      Animated.sequence([
          Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(2500),
          Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
      ]).start(() => setToastMessage(''));
  };

    // --- 1. SENSOR STREAM CONFIGURATION ---
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

    // --- 2. RETRIEVE METADATA CONTEXT ---
    useEffect(() => {
        const fetchSessionMetadata = async () => {
            try {
                // MODIFIED: Intercept and apply fake credentials if testing via Detox
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

    // --- 3. STOPWATCH CALCULATIONS INTERACTION HOOKS ---
    const startDropTracking = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSessionState('falling');
        setDropTime(0);
        setMaxGForce(1.0);
        startTimestamp.current = Date.now();
        
        timerRef.current = setInterval(() => {
            setDropTime((Date.now() - startTimestamp.current) / 1000);
        }, 10);
    };

    const handleImpactTrigger = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        
        const airtimeCalculatedMs = Date.now() - startTimestamp.current;
        if (airtimeCalculatedMs < MIN_VALID_FLIGHT_TIME_MS) {
            setSessionState('idle');
            setDropTime(0);
            setMaxGForce(1.0);
            
            setAlertModal({
                visible: true,
                title: "Invalid Flight Time Detected",
                message: "The drop recorded was shorter than 1,2 seconds. Parachutes need proper clearance flight windows to expand canopy walls and break gravitational velocity safely. Please re-run drop execution properly.",
                type: 'warning'
            });
            return;
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setSessionState('impact_captured');
        showToast("Impact Landing Recorded!");
    };

    // --- 4. DATA LOG ARCHITECTURE MATRIX REDIRECT ---
    const commitSessionResults = async () => {
        if (isFinishing) return;
        setIsFinishing(true);

        try {
            // MODIFIED: Bypass actual Firestore document compilation to prevent Auth rules blocks
            if (checkDetoxBypass()) {
                showToast("Mock Data Packet Transmitted!");
                setTimeout(() => {
                    router.push({
                        pathname: '/activity_finish',
                        params: {
                            activityId: ACTIVITY_ID,
                            activityTitle: "Parachute Drop Challenge"
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
                        activityTitle: "Parachute Drop Challenge"
                    }
                });
            }, 1000);
        } catch (error) {
            console.error("Firestore submission anomaly:", error);
            setAlertModal({
                visible: true,
                title: "Network Synchronization Failure",
                message: "Unable to pass data parameters across active cloud routes. Verify physical connection matrix channels.",
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
                                <View style={[styles.progressFill, { width: `${((actionPhase - 1) * 3 + (trial - 1)) / 9 * 100}%` }]} />
                            </View>
                            <Text style={styles.progressText}>Trial Logging Matrix</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
                <View style={styles.containerContent}>
                    
                    {/* Title Section with testID Added */}
                    <View style={styles.titleSection}>
                        <Text testID="physicsProfileHeader" style={[styles.recordingTag, { color: currentTheme.textColor }]}>Live Physics Profile</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{getPhaseLabel()}</Text>
                        <Text style={[styles.phaseIndicator, isDarkMode && { color: '#4FC3F7' }]}>Trial Run Iteration {trial} of 3</Text>
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

                                <Text style={styles.sheetSectionTitle}>Dynamic Analytical Steps</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 1:</Text> Log elevation boundaries (Drop Height: distance fallen).</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 2:</Text> Isolate drop time intervals cleanly using terminal stopwatch metrics.</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 3:</Text> Final Velocity = distance / time (Assuming v₀ = 0 m/s).</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Example: 1.0 m / 0.5 s = 2.0 m/s</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 4:</Text> Acceleration = Final Velocity / time.</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Example: 2.0 m/s / 0.5 s = 4.0 m/s²</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 5:</Text> Net Force = mass × acceleration.</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Example (0.20 kg mass): 0.20 × 4.0 = 0.8 N</Text>
                                <Text style={styles.sheetBodyText}><Text style={styles.bold}>Step 6:</Text> Drag Force = Weight – Net Force.</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Weight: 0.20 × 9.8 = 1.96 N → Drag: 1.96 – 0.8 = 1.16 N</Text>

                                <Text style={styles.sheetSectionTitle}>G-Force Real-Time Matrix</Text>
                                <Text style={styles.sheetBodyText}>• No Bounce Impact: Δv = v_impact</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Formula: g-force = (Δv / t_contact) ÷ 9.8</Text>
                                <Text style={styles.sheetBodyText}>• Rebound Bounce Impact: Δv = v_down + v_up</Text>
                                <Text style={styles.sheetBodyText_Italic}>   Upward Velocity (v_up) = g × t_up (time to max bounce height)</Text>

                                <Text style={styles.sheetSectionTitle}>Injury Shock Range Reference Data</Text>
                                <View style={styles.staticRefTable}>
                                    <Text style={styles.tableRowData}><Text style={styles.bold}>1–5 g:</Text> Standing up, standard elevators [No Injury Risks]</Text>
                                    <Text style={styles.tableRowData}><Text style={styles.bold}>5–10 g:</Text> Running falls, vehicle breaking [Bruises/Strains]</Text>
                                    <Text style={styles.tableRowData}><Text style={styles.bold}>10–30 g:</Text> Vehicle crashes with seatbelts [Bones/Concussions]</Text>
                                    <Text style={styles.tableRowData}><Text style={styles.bold}>30–50 g:</Text> High surface falls [Severe Trauma Risks]</Text>
                                    <Text style={styles.tableRowData}><Text style={styles.bold}>50+ g:</Text> Sudden un-cushioned shifts [Life Threatening Constraints]</Text>
                                </View>

                                <Text style={styles.sheetSectionTitle}>Curriculum Target Focus Guidelines</Text>
                                <Text style={styles.sheetBodyText}>• Primary Focus: Trace structural drop intervals and evaluate final speeds.</Text>
                                <Text style={styles.sheetBodyText}>• High School Focus: Compute drag metrics, net force models, and g-force variables.</Text>
                            </ScrollView>
                        )}
                    </View>

                    <View style={styles.displayConsoleWrapper}>
                        <View style={styles.telemetrySubPanel}>
                            <Text style={styles.telemetryReadoutLabel}>Live Acceleration Vector: <Text style={styles.telemetryValue}>{liveG.toFixed(2)} g</Text></Text>
                            <Text style={styles.telemetryReadoutLabel}>Peak Contact Strain Logged: <Text style={styles.telemetryValue}>{maxGForce.toFixed(2)} g</Text></Text>
                        </View>
                        
                        <View style={styles.timeMainTickerBox}>
                            <Text style={styles.timerLabelText}>Calculated Air Time Profile:</Text>
                            <Text style={styles.timerBigDigits}>{dropTime.toFixed(2).replace('.', ',')} <Text style={styles.secSuffix}>SEC</Text></Text>
                        </View>
                    </View>

                    {/* Button Controls Container with testID Added */}
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

                        {sessionState === 'impact_captured' && (
                            <View style={styles.captureSuccessSplashCard}>
                                <Ionicons name="checkmark-done-circle" size={40} color="#00E5FF" />
                                <Text style={styles.successCardHeadline}>Flight Mechanics Logged Successfully</Text>
                                <Text style={styles.successSubtext}>Instruct team to compile values into localized lab document.</Text>
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
    
    containerContent: { flex: 1, paddingTop: 125, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 110, justifyContent: 'space-between' },
    titleSection: { alignItems: 'center', marginTop: 5 },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22 },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
    phaseIndicator: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, color: '#007AFF', marginTop: 4, textAlign: 'center' },
    
    dropdownContainer: { width: '100%', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#000', overflow: 'hidden', marginVertical: 8, maxHeight: 180 },
    formulaDropdownHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#E0E0E0' },
    dropdownHeaderText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000', flex: 1 },
    chevronIcon: { marginLeft: 5 },
    formulaScrollArea: { padding: 10, backgroundColor: '#FFF' },
    sheetSectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#007AFF', marginTop: 8, marginBottom: 4, textDecorationLine: 'underline' },
    sheetBodyText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#222', marginBottom: 2, lineHeight: 14 },
    sheetBodyText_Italic: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 2, paddingLeft: 6 },
    staticRefTable: { padding: 5, backgroundColor: '#F5F5F5', borderRadius: 6, marginVertical: 4 },
    tableRowData: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#333', marginBottom: 2 },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },

    displayConsoleWrapper: { width: '100%', backgroundColor: 'rgba(255,255,255,0.85)', padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', alignItems: 'center' },
    telemetrySubPanel: { width: '100%', borderBottomWidth: 1, borderBottomColor: '#DDD', paddingBottom: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
    telemetryReadoutLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#444' },
    telemetryValue: { fontFamily: 'BalsamiqSans_700Bold', color: '#FF5252' },
    timeMainTickerBox: { alignItems: 'center', marginTop: 4 },
    timerLabelText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#000' },
    timerBigDigits: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 36, color: '#000', marginTop: 2 },
    secSuffix: { fontSize: 18, fontFamily: 'BalsamiqSans_400Regular' },

    controlInteractionBlock: { height: 160, justifyContent: 'center', alignItems: 'center', width: '100%' },
    primaryCircleLaunchBtn: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#B2FF59', borderWidth: 2, borderColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 4 },
    activeDropCaptureStyle: { backgroundColor: '#FF5252' },
    launchCircleText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, textAlign: 'center', marginTop: 6, paddingHorizontal: 10, color: '#000' },
    captureSuccessSplashCard: { padding: 15, backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1.5, borderColor: '#333', alignItems: 'center', width: '90%' },
    successCardHeadline: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#000', marginTop: 5 },
    successSubtext: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', textAlign: 'center', marginTop: 4 },

    nextBtn: { backgroundColor: '#4FC3F7', width: '90%', height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#000', marginBottom: 5 },
    nextBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, marginLeft: 8, color: '#000' },
});