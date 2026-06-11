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
const ACTIVITY_ID = "9QUEyTVnLCsuXBgWcCQs";
const VIBRATION_THRESHOLD = 1.2; 

// allow layout animations on android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Per-screen content ───────────────────────────────────────────────────────
export default function EarthquakeReadyScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    const { isDarkMode } = useTheme();
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    const [activity, setActivity] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [teamMemberCount, setTeamMemberCount] = useState(0);
    const [teamId, setTeamId] = useState<string | null>(null);
    
    const [isUserPrepared, setIsUserPrepared] = useState(false);
    const [isSafeSpace, setIsSafeSpace] = useState(false);
    const [materialsChecked, setMaterialsChecked] = useState({
        cardboard: false,
        paper: false,
        scissors: false,
        tape: false,
        cups: false
    });

    const [gForce, setGForce] = useState(1.0);
    const [hasTriggeredOnce, setHasTriggeredOnce] = useState(false);
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
                        }
                    }
                }
            } catch (error) {
                console.error("Fetch Error:", error);
            } finally {
                setLoading(false);
            }
        };

        const subscribeAccelerometer = () => {
            Accelerometer.setUpdateInterval(100);
            subscription.current = Accelerometer.addListener(data => {
                // compute total g-force using vector magnitude
                const calculatedGForce = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
                const currentG = Math.round(calculatedGForce * 100) / 100;
                setGForce(currentG);
                
                if (currentG > VIBRATION_THRESHOLD) {
                    setHasTriggeredOnce(true);
                }
            });
        };

        fetchData();
        subscribeAccelerometer();

        return () => {
            subscription.current?.remove();
        };
    }, []);

    const handleStartChallenge = async () => {
        if (!teamId) return Alert.alert("Error", "No Team Session found.");
        
        setIsStarting(true);
        try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Denied", "GPS tracking permissions are required to log activity location.");
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

            router.push('/earthquake_activity');
            
        } catch (error) {
            console.error("Firestore Write Error:", error);
            Alert.alert("Error", "Could not record attempt. Check your connection parameters.");
        } finally {
            setIsStarting(false);
        }
    };

    const toggleMaterial = (key: keyof typeof materialsChecked) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setMaterialsChecked(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const allMaterialsSelected = Object.values(materialsChecked).every(Boolean);
    const isSensorVerified = hasTriggeredOnce;
    const allRequirementsMet = allMaterialsSelected && isSensorVerified && isUserPrepared && isSafeSpace;
    
    const completedTasks = [
        allMaterialsSelected, 
        isSensorVerified, 
        isUserPrepared, 
        isSafeSpace
    ].filter(Boolean).length;
    
    const progressPercent = (completedTasks / 4) * 100;

    useEffect(() => {
        // fire spring animations natively on update shifts
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }, [completedTasks]);

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
            
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>

                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBase}>
                                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <Text style={styles.progressText}>
                                {progressPercent === 100 ? "Ready!" : `Readiness: ${Math.round(progressPercent)}%`}
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
                        <Text style={[styles.phaseTag, { color: currentTheme.textColor }]}>Readiness Phase:</Text>
                        <Text style={[styles.activityName, { color: currentTheme.textColor }]}>{activity?.activityName || "Earthquake-Resistant Structure"}</Text>
                    </View>

                    <View style={styles.overviewBox}>
                        <View style={styles.overviewTextContainer}>
                            <Text style={styles.instructionHeading}>Instructions:</Text>
                            <Text style={styles.overviewText}>
                                <Text style={styles.bold}>1. </Text>Build an anti-vibration layer, by folding paper/cardboard.{"\n\n"}
                                <Text style={styles.bold}>2. </Text>Place a flat cardboard platform on top.{"\n\n"}
                                <Text style={styles.bold}>3. </Text>Place the phone in the centre and activate vibration mode on the STEMM App.{"\n\n"}
                                <Text style={styles.bold}>4. </Text>Modify the structure to reduce movement (e.g. more pillars, more folds, etc)
                            </Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionHeadingUnderlined, { color: currentTheme.textColor }]}>Team Readiness Checklist:</Text>

                    <View style={[styles.checkItem, styles.whiteCheckItem]}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={allMaterialsSelected ? "checkbox" : "square-outline"} 
                                size={24} color={allMaterialsSelected ? "#00E5FF" : "#000"} 
                            />
                            <Text style={styles.checkLabel}> Materials gathered</Text>
                        </View>
                        
                        <View style={styles.materialsSubGrid}>
                            <TouchableOpacity style={styles.subCheckRow} onPress={() => toggleMaterial('cardboard')}>
                                <Ionicons name={materialsChecked.cardboard ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Cardboard base sheets</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.subCheckRow} onPress={() => toggleMaterial('paper')}>
                                <Ionicons name={materialsChecked.paper ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Construction paper</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.subCheckRow} onPress={() => toggleMaterial('scissors')}>
                                <Ionicons name={materialsChecked.scissors ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Scissors</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.subCheckRow} onPress={() => toggleMaterial('tape')}>
                                <Ionicons name={materialsChecked.tape ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Sticky tape</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.subCheckRow} onPress={() => toggleMaterial('cups')}>
                                <Ionicons name={materialsChecked.cups ? "checkbox-outline" : "square-outline"} size={20} color="#555" />
                                <Text style={styles.subCheckLabel}> Plastic or paper cups</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={[styles.checkItem, { borderColor: isDarkMode ? currentTheme.textColor : '#DDD' }]}>
                        <View style={styles.checkHeader}>
                            <Ionicons 
                                name={isSensorVerified ? "checkbox" : "square-outline"} 
                                size={24} color={isSensorVerified ? "#00E5FF" : currentTheme.textColor} 
                            />
                            <Text style={[styles.checkLabel, { color: currentTheme.textColor }]}> Vibration Sensor Connected</Text>
                        </View>
                        <View style={styles.sensorStatus}>
                            <Text style={[styles.statusText, !isSensorVerified && styles.warningText]}>
                                {isSensorVerified ? `Live Feed: ${gForce} G` : "Connecting to accelerometer hardware..."}
                            </Text>
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
    phaseTag: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, fontStyle: 'italic' },
    activityName: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20 },
    overviewBox: { borderWidth: 1.5, borderColor: '#000', borderRadius: 20, padding: 15, backgroundColor: 'white', marginBottom: 25 },
    overviewTextContainer: { flex: 1 },
    instructionHeading: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginBottom: 10, color: '#000', textDecorationLine: 'underline' },
    overviewText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, lineHeight: 18, color: '#222' },
    bold: { fontFamily: 'BalsamiqSans_700Bold' },
    sectionHeadingUnderlined: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, textDecorationLine: 'underline', marginBottom: 20 },
    
    checkItem: { marginBottom: 20, backgroundColor: 'transparent', padding: 12, borderRadius: 15, borderWidth: 1 },
    whiteCheckItem: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#000' },
    checkHeader: { flexDirection: 'row', alignItems: 'center' },
    checkLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 17 },
    materialsSubGrid: { marginTop: 10, paddingLeft: 28 },
    subCheckRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    subCheckLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#333' },
    
    sensorStatus: { paddingLeft: 30, marginTop: 4 },
    statusText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 14, color: '#4CAF50' },
    warningText: { color: '#F44336' },
    startChallengeBtn: { backgroundColor: '#4FC3F7', borderRadius: 25, paddingVertical: 12, alignItems: 'center', marginTop: 15, marginBottom: 20 },
    startChallengeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000' },
    bottomActionArea: { position: 'absolute', bottom: 0, backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE' },
    backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25, borderWidth: 1, borderColor: '#AAA' },
    backButtonText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 18, marginLeft: 10, color: '#000' },
});