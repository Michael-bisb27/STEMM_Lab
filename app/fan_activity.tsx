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
    TextInput,
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

// --- LOCAL DATABASE UTILITIES IMPORT ---
import { fanOps } from '../database/db'; // Added to route time-series parameters to device structures

// --- THEME IMPORTS ---
import { themes } from '../theme/theme';
import { useTheme } from '../theme/theme_context';

const { width, height } = Dimensions.get('window');
const ACTIVITY_ID = "9IWijzqyiclKNayBpFZ1"; 
const FLATNESS_TOLERANCE = 0.25; 

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FanActivityScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- EXPERIMENT STEPPING STATES ---
    const [currentMember, setCurrentMember] = useState(1);
    const [totalMembers, setTotalMembers] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);

    // Activity tracking matrices
    const [targetMaterial, setTargetMaterial] = useState<'Paper' | 'Cardboard'>('Paper');
    const [currentDistance, setCurrentDistance] = useState<'15cm' | '30cm' | '45cm'>('30cm');
    const [fanDesign, setFanDesign] = useState<1 | 2 | 3>(1);
    const [experimentState, setExperimentState] = useState<'idle' | 'fanning' | 'recorded'>('idle');
    const [fanningTime, setFanningTime] = useState(0);

    // UI NOTIFICATION & MODAL STATES
    const [toastMessage, setToastMessage] = useState('');
    const toastOpacity = useRef(new Animated.Value(0)).current;
    
    const [alertModal, setAlertModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' 
    });

    // --- OPTIONAL CHALLENGE LAYER STATES ---
    const [showChallengePrompt, setShowChallengePrompt] = useState(false);
    const [challengeActive, setChallengeActive] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState<string>('Thin printer paper');
    const [stiffnessK, setStiffnessK] = useState<number>(0.05);
    const [observedAngleStr, setObservedAngleStr] = useState<string>('30');
    const [calculatedForce, setCalculatedForce] = useState<string>('0.0260');

    // Environmental Surface Sensor State
    const [isFlat, setIsFlat] = useState(true);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sensorSubscription = useRef<any>(null);

    // Material Matrix
    const materialMatrix = [
        { name: 'Thin printer paper', thickness: '0.1mm', k: 0.05, notes: 'Bends very easily' },
        { name: 'Standard card stock', thickness: '0.25mm', k: 0.20, notes: 'Moderate bend' },
        { name: 'Thin cardboard', thickness: '0.5mm', k: 0.50, notes: 'Much harder to bend' },
        { name: 'Corrugated cardboard', thickness: '3.0mm', k: 2.50, notes: 'Very stiff, k range: 2-3' },
    ];

    // --- IN-APP TOAST NOTIFICATION HELPER ---
    const showToast = (message: string) => {
        setToastMessage(message);
        Animated.sequence([
            Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2500),
            Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        ]).start(() => setToastMessage(''));
    };

    // --- 1. SENSOR CONTROL PROFILE (BATTERY OPTIMIZED) ---
    useEffect(() => {
        if (challengeActive || experimentState === 'recorded') {
            if (sensorSubscription.current) {
                sensorSubscription.current.remove();
                sensorSubscription.current = null;
            }
            setIsFlat(true); 
            return;
        }

        Accelerometer.setUpdateInterval(150);
        sensorSubscription.current = Accelerometer.addListener(data => {
            const flat = Math.abs(data.x) < FLATNESS_TOLERANCE && Math.abs(data.y) < FLATNESS_TOLERANCE;
            setIsFlat(flat);

            if (!flat && experimentState === 'fanning') {
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                setExperimentState('idle');
                setFanningTime(0);
            }
        });

        return () => {
            if (sensorSubscription.current) sensorSubscription.current.remove();
        };
    }, [experimentState, challengeActive]);

    // --- 2. RETRIEVE METADATA ---
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
                console.error("Error configuration loading fail:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- 3. LIVE PHYSICS CALCULATION ENGINE ---
    useEffect(() => {
        const deg = parseFloat(observedAngleStr);
        if (!isNaN(deg) && deg >= 0) {
            const radians = deg * (Math.PI / 180);
            const force = stiffnessK * radians;
            setCalculatedForce(force.toFixed(4));
        } else {
            setCalculatedForce('0.0000');
        }
    }, [selectedMaterial, stiffnessK, observedAngleStr]);

    // --- 4. ENGINE CONTROLS ---
    const startFanningTimer = () => {
        if (!isFlat) return;
        setExperimentState('fanning');
        setFanningTime(0);
        timerRef.current = setInterval(() => {
            setFanningTime(prev => prev + 1);
        }, 1000);
    };

    const stopFanningTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (fanningTime < 3) {
            setExperimentState('idle');
            setFanningTime(0);
            setAlertModal({
                visible: true,
                title: "Too Fast!",
                message: "You must sustain the fanning propulsion for at least 3 seconds to generate a stable, measurable airflow for structural deflection.",
                type: 'warning'
            });
        } else {
            setExperimentState('recorded');
            showToast("Run Captured! Log your deflection angles.");

            // --- INJECT LOCAL SQLITE STANDARD TRIAL WRITER ---
            try {
                fanOps.insertTrial({
                    attempt_id: lastAttemptId || "UNKNOWN",
                    member_number: currentMember,
                    target_material: targetMaterial,
                    distance_gap: currentDistance,
                    fan_design: fanDesign,
                    fanning_duration: fanningTime,
                    is_challenge_entry: 0,
                    recorded_at: Date.now()
                });
            } catch (error) {
                console.error("Local database trial caching exception:", error);
            }
        }
    };

    const handleMaterialChange = (matName: string, kValue: number) => {
        setSelectedMaterial(matName);
        setStiffnessK(kValue);
    };

    // --- 5. DATA SAVE PIPELINE ---
    const saveAndExit = async (bonusAccepted: boolean) => {
        if (isFinishing) return;
        setIsFinishing(true);

        // --- INJECT LOCAL SQLITE OPTIONAL CHALLENGE DATA DATA LOG ---
        if (bonusAccepted) {
            try {
                fanOps.insertTrial({
                    attempt_id: lastAttemptId || "UNKNOWN",
                    member_number: currentMember,
                    target_material: targetMaterial,
                    distance_gap: currentDistance,
                    fan_design: fanDesign,
                    fanning_duration: fanningTime,
                    is_challenge_entry: 1,
                    selected_material_spec: selectedMaterial,
                    stiffness_k: stiffnessK,
                    observed_angle: parseFloat(observedAngleStr) || 0,
                    calculated_force: parseFloat(calculatedForce) || 0,
                    recorded_at: Date.now()
                });
            } catch (error) {
                console.error("Local database challenge caching exception:", error);
            }
        }

        try {
            await addDoc(collection(db_cloud, "FC_Scoring_Result"), {
                AttemptID: lastAttemptId || "UNKNOWN",
                optionalChallengeCompleted: bonusAccepted,
                accuracyScore: 0,
                finishedAt: Timestamp.now(),
                pointsEarned: bonusAccepted ? 90 : 85,
                workScore: 0,
                teacherID: "" 
            });

            showToast(bonusAccepted ? "Bonus Points Secured!" : "Data Collection Complete!");
            
            setTimeout(() => {
                router.push({
                    pathname: '/activity_finish',
                    params: { 
                        activityId: ACTIVITY_ID, 
                        activityTitle: "Hand Fan Challenge",
                        attemptId: lastAttemptId || "UNKNOWN" // Passed along to pinpoint custom charts on layout finish screen
                    }
                });
            }, 1200);
        } catch (error) {
            console.error("Submission Error:", error);
            setAlertModal({
                visible: true,
                title: "Synchronization Error",
                message: "Could not safely upload your final metrics to the cloud servers.",
                type: 'error'
            });
            setIsFinishing(false);
        }
    };

    const progressNextStateStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        
        if (fanDesign < 3) {
            setFanDesign(prev => (prev + 1) as 1 | 2 | 3);
            setExperimentState('idle');
            setFanningTime(0);
            showToast(`Switched to Design ${fanDesign + 1}`);
        } else if (currentDistance === '30cm') {
            setCurrentDistance('15cm');
            setFanDesign(1);
            setExperimentState('idle');
            setFanningTime(0);
            showToast("Distance parameter updated to 15cm");
        } else if (currentDistance === '15cm') {
            setCurrentDistance('45cm');
            setFanDesign(1);
            setExperimentState('idle');
            setFanningTime(0);
            showToast("Distance parameter updated to 45cm");
        } else if (targetMaterial === 'Paper') {
            setTargetMaterial('Cardboard');
            setCurrentDistance('30cm');
            setFanDesign(1);
            setExperimentState('idle');
            setFanningTime(0);
            showToast("Target material updated to Cardboard");
        } else if (currentMember < totalMembers) {
            setAlertModal({
                visible: true,
                title: "Rotation Mode Active",
                message: `Team Member ${currentMember} has completed their trials. Hand over the physical fanning setup to Member ${currentMember + 1}.`,
                type: 'info'
            });
            setCurrentMember(prev => prev + 1);
            setTargetMaterial('Paper');
            setCurrentDistance('30cm');
            setFanDesign(1);
            setExperimentState('idle');
            setFanningTime(0);
        } else {
            setShowChallengePrompt(true);
        }
    };

    if (!fontsLoaded || loading) {
        /* Adaptive background color layout configuration mapping */
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
                                <View style={[styles.progressFill, { width: challengeActive ? '100%' : '50%' }]} />
                            </View>
                            <Text style={styles.progressText}>
                                {challengeActive ? "Bonus Exploration Phase" : "Experimentation Logging Track"}
                            </Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                
                {!isFlat && !challengeActive && (
                    <View style={styles.pauseOverlay}>
                        <Ionicons name="phone-portrait-outline" size={64} color="#FF5252" style={styles.alertIcon} />
                        <Text style={styles.pauseText}>Please keep your data terminal flat on the workbench to accurately verify local variables.</Text>
                    </View>
                )}

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    {/* --- SCIENTIFIC OBSERVATION TIP BOX BLOCK --- */}
                    <View style={styles.tipBox}>
                        <View style={styles.tipHeaderRow}>
                            <Ionicons name="bulb" size={20} color="#FFB300" />
                            <Text style={styles.tipHeaderTitle}> Scientific Observation Tip:</Text>
                        </View>
                        <Text style={styles.tipBodyText}>
                            Approximate applied force using F ≈ k · θ. Students can rank forces visually by stiffness traits and bend angles without mapping exact metric properties if needed!
                        </Text>
                    </View>

                    {!challengeActive ? (
                        <View style={styles.contentCard}>
                            <View style={styles.titleBlock}>
                                <Text style={styles.recordingTag}>Live Physics Session</Text>
                                <Text style={styles.activityName}>Hand Fan Challenge Tracker</Text>
                            </View>

                            <View style={styles.specificationsBox}>
                                <Text style={styles.specItem}>• Target Base Object: <Text style={styles.bold}>{targetMaterial}</Text></Text>
                                <Text style={styles.specItem}>• Spatial Separation Gap: <Text style={styles.bold}>{currentDistance}</Text></Text>
                                <Text style={styles.specItem}>• Core Blade Template: <Text style={styles.bold}>Design Layout {fanDesign}</Text></Text>
                            </View>

                            <View style={styles.timerEngineContainer}>
                                <Text style={styles.timerLabel}>Active Propulsion Stream Period:</Text>
                                <Text style={styles.timerValue}>{fanningTime} <Text style={styles.secondsUnit}>SEC</Text></Text>
                            </View>

                            <View style={styles.controlCenter}>
                                {experimentState === 'idle' && (
                                    <TouchableOpacity style={styles.actionCircleStart} onPress={startFanningTimer}>
                                        <Ionicons name="play" size={40} color="#FFF" />
                                        <Text style={styles.actionBtnText}>START FANNING</Text>
                                    </TouchableOpacity>
                                )}
                                {experimentState === 'fanning' && (
                                    <TouchableOpacity style={styles.actionCircleStop} onPress={stopFanningTimer}>
                                        <Ionicons name="stop" size={40} color="#FFF" />
                                        <Text style={styles.actionBtnText}>STOP WAVE</Text>
                                    </TouchableOpacity>
                                )}
                                {experimentState === 'recorded' && (
                                    <View style={styles.recordedBox}>
                                        <Ionicons name="checkmark-circle" size={32} color="#4FC3F7" />
                                        <Text style={styles.recordedText}>Run Captured! Log your structural angles onto your physical paper worksheet layout.</Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.teamTagRow}>
                                <Ionicons name="people" size={20} color="#666" />
                                <Text style={styles.teamTagText}>Active Investigator: Member {currentMember} / {totalMembers}</Text>
                            </View>

                            <TouchableOpacity 
                                style={[styles.stepProceedBtn, experimentState !== 'recorded' && styles.disabledBtn]}
                                disabled={experimentState !== 'recorded'}
                                onPress={progressNextStateStep}
                            >
                                <Text style={styles.stepProceedBtnText}>Advance Setup Profile</Text>
                                <Ionicons name="arrow-forward" size={20} color="#000" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.challengeDashboard}>
                            <View style={styles.bonusHeader}>
                                <Ionicons name="trophy" size={32} color="#FFD700" />
                                <Text style={styles.bonusTitle}>Stiffness Coefficient Estimation Challenge</Text>
                            </View>

                            <Text style={styles.physicsContextParagraph}>
                                Force calculation rule: Under uniform air velocity parameters, structural force is estimated using the bending formula:
                            </Text>
                            
                            <View style={styles.formulaWrapper}>
                                <Text style={styles.formulaText}>F ≈ k · θ</Text>
                            </View>
                            
                            <Text style={styles.physicsContextParagraph}>
                                Where F = force applied (N), θ = bend angle (radians), and k represents the stiffness coefficient representing resistance to bending (N/rad).
                            </Text>

                            <Text style={styles.subSectionTitle}>1. Select Target Material Resistance Profile (k):</Text>
                            <View style={styles.materialGrid}>
                                {materialMatrix.map((item, idx) => (
                                    <TouchableOpacity 
                                        key={idx} 
                                        style={[styles.materialCard, selectedMaterial === item.name && styles.selectedMaterialCard]}
                                        onPress={() => handleMaterialChange(item.name, item.k)}
                                    >
                                        <Text style={styles.matCardName}>{item.name}</Text>
                                        <Text style={styles.matCardVal}>t = {item.thickness}</Text>
                                        <Text style={styles.matCardValBold}>k = {item.k} N/rad</Text>
                                        <Text style={styles.matCardNote}>{item.notes}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.subSectionTitle}>2. Input Observed Bending Displacement (θ):</Text>
                            <View style={styles.inputContainerRow}>
                                <TextInput
                                    style={styles.angleInput}
                                    keyboardType="numeric"
                                    value={observedAngleStr}
                                    onChangeText={setObservedAngleStr}
                                    placeholder="e.g. 30"
                                />
                                <Text style={styles.inputUnitLabel}>Degrees (°)</Text>
                            </View>

                            <View style={styles.calculatorOutputBox}>
                                <Text style={styles.outputLabel}>Estimated Force Required (F):</Text>
                                <Text style={styles.outputValue}>{calculatedForce} <Text style={styles.newtonUnit}>Newtons (N)</Text></Text>
                                <Text style={styles.calculationTrace}>
                                    Details: {stiffnessK} N/rad × {((parseFloat(observedAngleStr) || 0) * (Math.PI / 180)).toFixed(4)} rad
                                </Text>
                            </View>

                            <Text style={styles.subSectionTitle}>3. Example Calculations Reference Guide:</Text>
                            <View style={styles.exampleCalculationBox}>
                                <Text style={styles.exampleTitle}>Suppose an observation angle of 30° is tracked:</Text>
                                <Text style={styles.exampleText}>• 30° angle converted to radians → θ ≈ 0.524 rad</Text>
                                
                                <View style={styles.exampleDivider} />
                                
                                <Text style={styles.exampleSubheading}>Scenario A: Thin Printer Paper (k = 0.05 N/rad)</Text>
                                <Text style={styles.exampleMath}>F ≈ 0.05 · 0.524 ≈ <Text style={styles.bold}>0.026 N</Text></Text>
                                
                                <View style={styles.exampleDivider} />

                                <Text style={styles.exampleSubheading}>Scenario B: Thicker Cardboard (k = 0.5 N/rad)</Text>
                                <Text style={styles.exampleMath}>F ≈ 0.5 · 0.524 ≈ <Text style={styles.bold}>0.26 N</Text></Text>
                                
                                <View style={styles.exampleTakeawayBox}>
                                    <Ionicons name="alert-circle" size={16} color="#E65100" />
                                    <Text style={styles.exampleTakeawayText}>
                                        Takeaway: The force required to reach identical displacement angles increases strongly with material stiffness!
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.classroomNoteText}>
                                * Note: These are rough classroom empirical values linked to flexural rigidity bounds to let you discover relative scale gaps between materials.
                            </Text>

                            <TouchableOpacity style={styles.finishFinalChallengeBtn} onPress={() => saveAndExit(true)}>
                                <Text style={styles.finishFinalChallengeBtnText}>Submit Challenge Solutions</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                </ScrollView>

                {showChallengePrompt && (
                    <View style={styles.modalBackdrop}>
                        <View style={styles.promptCard}>
                            <Ionicons name="sparkles" size={48} color="#FFD700" style={styles.promptIcon} />
                            <Text style={styles.promptHeading}>Optional Challenge Unlocked!</Text>
                            <Text style={styles.promptBody}>
                                Earn bonus configuration score points! Apply mathematical formulas to estimate the stiffness coefficient (k) and force parameters for your structural components.
                            </Text>
                            
                            <TouchableOpacity style={styles.acceptBtn} onPress={() => { setShowChallengePrompt(false); setChallengeActive(true); }}>
                                <Text style={styles.acceptBtnText}>Yes, Accept Challenge!</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.declineBtn} onPress={() => { setShowChallengePrompt(false); saveAndExit(false); }}>
                                <Text style={styles.declineBtnText}>No thanks, submit standard results</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={() => setAlertModal({
                            visible: true, title: "Action Locked", message: "Please complete your active configuration track data logs entirely before exiting.", type: 'warning'
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

    pauseOverlay: { position: 'absolute', top: 0, left: 0, width: width, height: height, backgroundColor: 'rgba(243, 240, 233, 0.98)', zIndex: 2000, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
    alertIcon: { marginBottom: 15 },
    pauseText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000', textAlign: 'center', lineHeight: 24 },

    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.8)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    progressContainer: { backgroundColor: 'white', height: 45, borderRadius: 25, width: width * 0.8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, elevation: 4 },
    progressBarBase: { flex: 1, height: 35, backgroundColor: '#F0F0F0', borderRadius: 20, overflow: 'hidden', justifyContent: 'center' },
    progressFill: { height: '100%', backgroundColor: '#4FC3F7', borderRadius: 20 },
    progressText: { position: 'absolute', width: '100%', textAlign: 'center', fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#333' },
    
    mainScroll: { paddingTop: 130, paddingBottom: 110, paddingHorizontal: 20 },
    
    tipBox: { backgroundColor: '#FFF9C4', borderWidth: 1.5, borderColor: '#FBC02D', borderRadius: 15, padding: 12, marginBottom: 15, elevation: 1 },
    tipHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    tipHeaderTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#5D4037' },
    tipBodyText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#5D4037', lineHeight: 16 },

    contentCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: '#000', elevation: 3 },
    titleBlock: { alignItems: 'center', marginBottom: 15 },
    recordingTag: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, color: '#000' },
    activityName: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic', color: '#555' },
    
    specificationsBox: { backgroundColor: '#F9F9F9', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#DDD', marginBottom: 20 },
    specItem: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, color: '#333', marginBottom: 4 },
    bold: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },
    
    timerEngineContainer: { alignItems: 'center', marginVertical: 10 },
    timerLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666' },
    timerValue: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 36, color: '#4FC3F7' },
    secondsUnit: { fontSize: 16, color: '#000' },
    
    controlCenter: { alignItems: 'center', marginVertical: 20 },
    actionCircleStart: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#4FC3F7', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#000', elevation: 4 },
    actionCircleStop: { width: 130, height: 130, borderRadius: 65, backgroundColor: '#FF5252', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#000', elevation: 4 },
    actionBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#FFF', marginTop: 5, textAlign: 'center' },
    
    recordedBox: { flexDirection: 'row', backgroundColor: '#E1F5FE', padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#B3E5FC' },
    recordedText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#0288D1', flex: 1, marginLeft: 10 },
    
    teamTagRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    teamTagText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', marginLeft: 6 },
    
    stepProceedBtn: { flexDirection: 'row', backgroundColor: '#B2FF59', paddingVertical: 12, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginTop: 25, borderWidth: 1.5, borderColor: '#000' },
    disabledBtn: { opacity: 0.3, backgroundColor: '#E0E0E0' },
    stepProceedBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000', marginRight: 8 },

    modalBackdrop: { position: 'absolute', top: -130, left: -20, width: width, height: height, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 4000, justifyContent: 'center', alignItems: 'center' },
    promptCard: { backgroundColor: '#FFF', width: '85%', borderRadius: 20, padding: 25, alignItems: 'center', borderWidth: 2, borderColor: '#000' },
    promptIcon: { marginBottom: 10 },
    promptHeading: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textAlign: 'center', marginBottom: 10 },
    promptBody: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, textAlign: 'center', color: '#444', lineHeight: 20, marginBottom: 20 },
    acceptBtn: { backgroundColor: '#FFD700', width: '100%', paddingVertical: 12, borderRadius: 25, alignItems: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#000' },
    acceptBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    declineBtn: { width: '100%', paddingVertical: 10, alignItems: 'center' },
    declineBtnText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#666', textDecorationLine: 'underline' },

    challengeDashboard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, borderWidth: 1.5, borderColor: '#000' },
    bonusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10 },
    bonusTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000', flex: 1, marginLeft: 10 },
    physicsContextParagraph: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#333', lineHeight: 18, marginVertical: 6 },
    formulaWrapper: { backgroundColor: '#F5F5F5', padding: 12, borderRadius: 8, alignItems: 'center', marginVertical: 8, borderWidth: 1, borderColor: '#E0E0E0' },
    formulaText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },
    subSectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 14, color: '#000', marginTop: 15, marginBottom: 10 },
    materialGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    materialCard: { backgroundColor: '#F9F9F9', width: '48%', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#DDD', marginBottom: 10 },
    selectedMaterialCard: { borderColor: '#00E5FF', backgroundColor: '#E0F7FA', borderWidth: 2 },
    matCardName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },
    matCardVal: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#666', marginTop: 1 },
    matCardValBold: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#0288D1', marginVertical: 2 },
    matCardNote: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 10, color: '#888', fontStyle: 'italic' },
    inputContainerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
    angleInput: { borderWidth: 1.5, borderColor: '#000', borderRadius: 8, width: 100, paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontFamily: 'BalsamiqSans_400Regular', backgroundColor: '#FFF' },
    inputUnitLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 15, marginLeft: 10 },
    calculatorOutputBox: { backgroundColor: '#E1F5FE', padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#0288D1', marginVertical: 15 },
    outputLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#0288D1' },
    outputValue: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 26, color: '#01579B', marginVertical: 4 },
    newtonUnit: { fontSize: 14, color: '#000' },
    calculationTrace: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#0288D1', fontStyle: 'italic' },
    
    exampleCalculationBox: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#DDD', marginVertical: 5 },
    exampleTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#333', marginBottom: 5 },
    exampleText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555' },
    exampleDivider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 8 },
    exampleSubheading: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#0288D1', marginBottom: 2 },
    exampleMath: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#333', paddingLeft: 10 },
    exampleTakeawayBox: { flexDirection: 'row', backgroundColor: '#FFF3E0', padding: 8, borderRadius: 8, marginTop: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#FFE0B2' },
    exampleTakeawayText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#E65100', flex: 1, marginLeft: 6, lineHeight: 14 },
    
    classroomNoteText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#777', fontStyle: 'italic', marginVertical: 10 },
    finishFinalChallengeBtn: { backgroundColor: '#FFD700', paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginTop: 15, borderWidth: 1.5, borderColor: '#000' },
    finishFinalChallengeBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 18, color: '#000' },

    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});