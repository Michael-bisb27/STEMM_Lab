import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av'; // ← ADDED
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
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
const ACTIVITY_ID = "0clUTH6JFi8V2uuexn9k";
// allow layout animations on android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
// ─── Per-screen content ───────────────────────────────────────────────────────
export default function SoundPollutionReadyScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });
    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;
    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [teamMemberCount, setTeamMemberCount] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    
    const [isMicTested, setIsMicTested] = useState(false);
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false);
    const [isTestingMic, setIsTestingMic] = useState(false);
    const [testDbLevel, setTestDbLevel] = useState(0);
    
    const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);   // ← ADDED

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
                        }
                    }
                }
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        return () => {
            if (micIntervalRef.current) clearInterval(micIntervalRef.current);
            // ← ADDED: stop any live recording on unmount
            if (recordingRef.current) {
                recordingRef.current.stopAndUnloadAsync().catch(() => {});
                recordingRef.current = null;
            }
        };
    }, []);

    // Helper to turn off microphone sampling safely when navigating away
    const stopAudioTest = async () => {
        if (micIntervalRef.current) {
            clearInterval(micIntervalRef.current);
            micIntervalRef.current = null;
        }
        if (recordingRef.current) {
            try {
                await recordingRef.current.stopAndUnloadAsync();
            } catch (error) {
                console.error("Error stopping recording on navigation:", error);
            }
            recordingRef.current = null;
        }
        setIsTestingMic(false);
    };

    // ← REPLACED: now uses real expo-av microphone with metering
    const handleMicTestToggle = async () => {
        if (isTestingMic) {
            // ── STOP ──────────────────────────────────────────────
            await stopAudioTest();
            setIsMicTested(true);
        } else {
            // ── START ─────────────────────────────────────────────
            const { granted } = await Audio.requestPermissionsAsync();
            if (!granted) {
                Alert.alert("Permission Denied", "Microphone access is required to test the sensor.");
                return;
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            const recording = new Audio.Recording();
            await recording.prepareToRecordAsync({
                ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
                isMeteringEnabled: true,
            });
            await recording.startAsync();
            recordingRef.current = recording;
            setIsTestingMic(true);

            // poll metering every 150 ms — same cadence as before
            micIntervalRef.current = setInterval(async () => {
                if (!recordingRef.current) return;
                const status = await recordingRef.current.getStatusAsync();
                if (status.isRecording && status.metering !== undefined) {
                    // metering is dBFS (–160 to 0); +90 gives a rough dB SPL estimate
                    const dbSPL = Math.round(Math.max(30, Math.min(120, status.metering + 90)));
                    setTestDbLevel(dbSPL);
                    setIsMicTested(true);
                }
            }, 150);
        }
    };

    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No active Team Session located.");
        
        setIsStarting(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "GPS access is mandatory to accurately map sound pollution zones.");
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
            const q = query(
                attemptRef, 
                where("TeamID", "==", teamId), 
                where("ActivityID", "==", ACTIVITY_ID)
            );
            
            // fetch counts to dynamically increment next trial number
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
            
            await stopAudioTest(); // Stop audio sampling before moving to the activity screen
            router.push('/sound_activity');
            
        } catch (error) {
            console.error("Firestore Write/GPS Error:", error);
            Alert.alert("Connection Failure", "Unable to establish tracking session. Verify network status and retry.");
        } finally {
            setIsStarting(false);
        }
    };
    const completedTasks = [isMicTested, isUserPrepared, isSafeSpace].filter(Boolean).length;
    
    // avoid naming conflict with browser windows progressevent types
    const readinessProgressPercent = (completedTasks / 3) * 100;
    const allRequirementsMet = readinessProgressPercent === 100;
    useEffect(() => {
        // fire spring animations natively on update shifts
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }, [completedTasks]);
    if (!fontsLoaded || loading) {
        // fallback layout base to avoid early screen pops
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
                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={async () => {
                                await stopAudioTest();
                                router.push('/settings');
                            }}
                        >
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

                        <TouchableOpacity 
                            style={styles.iconCircle} 
                            onPress={async () => {
                                await stopAudioTest();
                                router.push('/history');
                            }}
                        >
                            <Ionicons name="timer-outline" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    <View style={styles.titleSection}>
                        <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Readiness Phase:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Sound Pollution Hunter"}</Text>
                    </View>

                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.overviewTitle}>Instructions:</Text>
                            <Text style={styles.overviewText}>
                                • <Text style={styles.bold}>Measure noise</Text> from different actions (dropping objects like pens and books, talking, walking, stamping your feet).{"\n"}
                                • <Text style={styles.bold}>Record sound levels</Text> and exact locations.{"\n"}
                                • <Text style={styles.bold}>Map loud and quiet zones</Text> across your testing area.
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Team Readiness Checklist:</Text>

                    <View style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isMicTested ? "checkbox" : "square-outline"} 
                                size={24} color={isMicTested ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Microphone Sensor verified</Text>
                        </View>
                        <View style={styles.sensorCheckContainer}>
                            <Text style={styles.dbGaugeText}>{testDbLevel > 0 ? `${testDbLevel} dB` : "-- dB"}</Text>
                            <TouchableOpacity style={[styles.miniBtn, isTestingMic && styles.stopBtn]} onPress={handleMicTestToggle}>
                                <Text style={styles.miniBtnText}>{isTestingMic ? "STOP SAMPLING" : "TEST AUDIO"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]} onPress={() => setIsUserPrepared(!isUserPrepared)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isUserPrepared ? "checkbox" : "square-outline"} size={24} color={isUserPrepared ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}>{` User prepared (${teamMemberCount} members)`}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]} onPress={() => setIsSafeSpace(!isSafeSpace)}>
                        <View style={styles.checkHeader}>
                            <Ionicons name={isSafeSpace ? "checkbox" : "square-outline"} size={24} color={isSafeSpace ? "#00E5FF" : currentTheme.textColor} />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> You are in a safe and clear space</Text>
                        </View>
                    </TouchableOpacity>

                    <Text style={[styles.tableSectionTitle, { color: currentTheme.textColor }]}>Sound Levels & Hearing Damage Risk Reference</Text>
                    <View style={styles.tableWrapper}>
                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, styles.headerCell, { flex: 1 }]}>
                                <Text style={styles.tableHeaderText}>Sound Level (dB)</Text>
                            </View>
                            <View style={[styles.tableCell, styles.headerCell, { flex: 1.3 }]}>
                                <Text style={styles.tableHeaderText}>Example Sounds</Text>
                            </View>
                            <View style={[styles.tableCell, styles.headerCell, { flex: 1.5 }]}>
                                <Text style={styles.tableHeaderText}>Risk to Hearing</Text>
                            </View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>0–30 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Whisper, quiet library</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellText}>No risk</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>30–60 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Normal conversation, classroom noise</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellText}>Safe for long periods</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>60–85 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Busy traffic, vacuum cleaner</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellText}>Generally safe, but long exposure can cause fatigue</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>85–90 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Lawn mower, loud classroom, heavy traffic</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellTextBold}>Hearing damage possible</Text><Text style={styles.cellText}> after long exposure</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>90–100 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Motorbike, power tools, loud music</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellTextBold}>Hearing damage likely</Text><Text style={styles.cellText}> after short exposure</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>100–110 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Nightclub, rock concert, chainsaw</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellTextBold}>Serious hearing damage</Text><Text style={styles.cellText}> in minutes</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>110–120 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Siren close by, car horn at 1 m</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellText}>Painful; </Text><Text style={styles.cellTextBold}>immediate damage possible</Text></View>
                        </View>

                        <View style={styles.tableRow}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>120–130 dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Jet engine at close range</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellTextBold}>Immediate and severe hearing damage</Text></View>
                        </View>

                        <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                            <View style={[styles.tableCell, { flex: 1 }]}><Text style={styles.cellTextBold}>140+ dB</Text></View>
                            <View style={[styles.tableCell, { flex: 1.3 }]}><Text style={styles.cellText}>Explosion, gunshot</Text></View>
                            <View style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.cellTextBold}>Instant, permanent hearing damage</Text></View>
                        </View>
                    </View>

                    {allRequirementsMet && (
                        <TouchableOpacity 
                            style={[styles.startChallengeBtn, isStarting && { opacity: 0.7 }]}
                            onPress={handleStartChallenge}
                            disabled={isStarting}
                        >
                            {isStarting ? <ActivityIndicator color="#000" /> : <Text style={styles.startChallengeText}>Start Challenge</Text>}
                        </TouchableOpacity>
                    )}

                </ScrollView>

                <View style={styles.bottomActionArea}>
                    <TouchableOpacity 
                        style={styles.backButton} 
                        onPress={async () => {
                            await stopAudioTest();
                            router.back();
                        }}
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
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, padding: 15, backgroundColor: 'white', marginBottom: 20 },
    overviewTextContainer: { flex: 1 },
    overviewTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, marginBottom: 5, color: '#000' },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 19, color: '#333' },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginBottom: 15 },
    checkItem: { marginBottom: 15, backgroundColor: 'transparent', padding: 12, borderRadius: 15, borderWidth: 1 },
    whiteCheckItem: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#000' },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 17 },
    sensorCheckContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingLeft: 30 },
    dbGaugeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, color: '#00E5FF' },
    miniBtn: { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#000', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 10 },
    stopBtn: { backgroundColor: '#FF8A80' },
    miniBtnText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 11, color: '#000' },
    
    tableSectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 15, marginTop: 20, marginBottom: 10 },
    tableWrapper: { borderWidth: 1.5, borderColor: '#000', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFF', marginBottom: 25 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 45 },
    tableCell: { padding: 8, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#000' },
    headerCell: { backgroundColor: '#F2F2F2', alignItems: 'center' },
    tableHeaderText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, textAlign: 'center', color: '#000' },
    cellText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#333' },
    cellTextBold: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 12, color: '#000' },

    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 10, marginBottom: 30 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});