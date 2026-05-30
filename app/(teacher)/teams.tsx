import {
    BalsamiqSans_400Regular,
    BalsamiqSans_700Bold,
    useFonts,
} from '@expo-google-fonts/balsamiq-sans';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ImageBackground,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- FIREBASE IMPORTS ---
import { collection, onSnapshot } from 'firebase/firestore';
import { db_cloud } from '../../services/firebase_config';

// --- THEME IMPORTS ---
import { themes } from '../../theme/theme';
import { useTheme } from '../../theme/theme_context';

const { width } = Dimensions.get('window');

// UPDATED INTERFACE PROPERTY
interface TeamItem {
    id: string;
    name: string;
    classSection: string;
    discriminator: string;
    attemptsMade: number; 
    teamScore: number;
}

export default function TeacherTeamsScreen() {
    const router = useRouter();
    const [fontsLoaded] = useFonts({ BalsamiqSans_400Regular, BalsamiqSans_700Bold });

    // --- CONSUME GLOBAL THEME CONTEXT ---
    const { isDarkMode } = useTheme();

    // --- RESOLVE ACTIVE CONFIG FROM THEME ---
    const currentTheme = isDarkMode ? themes.dark : themes.light;

    // --- STATES ---
    const [teams, setTeams] = useState<TeamItem[]>([]);
    const [filteredTeams, setFilteredTeams] = useState<TeamItem[]>([]);
    const [classList, setClassList] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [loading, setLoading] = useState<boolean>(true);

    // --- LIVE COMBINED STREAM FOR TEAMS & ATTEMPTS ---
    useEffect(() => {
        let teamsData: any[] = [];
        let attemptsData: any[] = [];
        let teamsLoaded = false;
        let attemptsLoaded = false;

        const combineAndProcessData = () => {
            if (!teamsLoaded || !attemptsLoaded) return;

            // 1. Group and count attempts matching each unique TeamID
            const attemptCounts: Record<string, number> = {};
            attemptsData.forEach((attempt) => {
                const teamId = attempt.TeamID;
                if (teamId) {
                    attemptCounts[teamId] = (attemptCounts[teamId] || 0) + 1;
                }
            });

            const uniqueClasses = new Set<string>();
            const fetchedTeams: TeamItem[] = teamsData.map((team) => {
                // Prioritizes active classroom section codes first
                let section = team.classSection || team.gradeLevel || team.category || "5a";
                const lowerSection = section.toLowerCase();
                
                if (lowerSection === "primary" || lowerSection === "junior high") {
                    section = "5a";
                } else {
                    section = lowerSection;
                }
                
                uniqueClasses.add(section);

                return {
                    id: team.id,
                    name: team.teamName || "Unnamed Team",
                    classSection: section,
                    discriminator: team.teamDiscriminator || "0000",
                    attemptsMade: attemptCounts[team.id] || 0, // Injected Dynamic Count sum
                    teamScore: team.teamScore || 0
                };
            });

            // Clean array sorting alphabetically for the class section filters
            const sortedClasses = Array.from(uniqueClasses).sort();
            setClassList(['All', ...sortedClasses]);
            
            // Sort teams cleanly by name
            fetchedTeams.sort((a, b) => a.name.localeCompare(b.name));
            setTeams(fetchedTeams);
            setLoading(false);
        };

        // Stream 1: MS_Team Collection Listener
        const unsubscribeTeams = onSnapshot(collection(db_cloud, "MS_Team"), (snapshot) => {
            teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            teamsLoaded = true;
            combineAndProcessData();
        }, (error) => {
            console.error("Error streaming active project groups:", error);
            setLoading(false);
        });

        // Stream 2: FC_Attempt Collection Listener
        const unsubscribeAttempts = onSnapshot(collection(db_cloud, "FC_Attempt"), (snapshot) => {
            attemptsData = snapshot.docs.map(doc => doc.data());
            attemptsLoaded = true;
            combineAndProcessData();
        }, (error) => {
            console.error("Error streaming activity attempts:", error);
        });

        return () => {
            unsubscribeTeams();
            unsubscribeAttempts();
        };
    }, []);

    // --- LIVE FILTERING LOGIC ---
    useEffect(() => {
        if (selectedClass === 'All') {
            setFilteredTeams(teams);
        } else {
            setFilteredTeams(teams.filter(t => t.classSection === selectedClass));
        }
    }, [selectedClass, teams]);

    if (!fontsLoaded || loading) {
        return (
            <View style={[styles.loader, { backgroundColor: isDarkMode ? '#121212' : '#F3F0E9' }]}>
                <ActivityIndicator size="large" color="#00E5FF" />
            </View>
        );
    }

    return (
        <ImageBackground source={currentTheme.backgroundImage} style={styles.background}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* --- FIXED TOP HEADER MENU BAR --- */}
            <View style={styles.headerWrapper}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.topBar}>
                        <TouchableOpacity style={styles.iconCircle} onPress={() => router.push('/(teacher)/settings')}>
                            <Ionicons name="settings-outline" size={24} color="#666" />
                        </TouchableOpacity>
                        
                        <View style={styles.portalBadgeContainer}>
                            <Text style={styles.portalBadgeText}>ROSTER CONSOLE</Text>
                        </View>

                        <View style={[styles.iconCircle, { opacity: 0 }]}>
                            <Ionicons name="lock-closed-outline" size={24} color="#666" />
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mainScroll}>
                    
                    <Text style={[styles.sectionTitle, { color: currentTheme.textColor }]}>Classroom Roster Filters</Text>

                    {/* --- HORIZONTAL FILTER TRACK BAR --- */}
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false} 
                        contentContainerStyle={styles.filterBarScrollTrack}
                    >
                        {classList.map((cls) => {
                            const isSelected = selectedClass === cls;
                            return (
                                <TouchableOpacity
                                    key={cls}
                                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                                    onPress={() => setSelectedClass(cls)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                                        {cls === 'All' ? 'All Classes' : `grade ${cls}`}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <Text style={[styles.sectionSubtitle, { color: currentTheme.textColor }]}>Project Teams ({filteredTeams.length})</Text>

                    {/* --- MAIN TEAMS SELECTION INTERFACE LIST --- */}
                    <View style={styles.teamsListContainer}>
                        {filteredTeams.length === 0 ? (
                            <View style={styles.emptyContainerCard}>
                                <Ionicons name="alert-circle-outline" size={36} color="#999" />
                                <Text style={styles.emptyContainerText}>No active lab groups match this selector filter criteria.</Text>
                            </View>
                        ) : (
                            filteredTeams.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.teamCardWrapper}
                                    activeOpacity={0.9}
                                    onPress={() => router.push({
                                        pathname: '/(teacher)/teams_detail',
                                        params: { teamId: item.id }
                                    })}
                                >
                                    <Image source={require('../../assets/images/User.png')} style={styles.teamAvatarIcon} />
                                    
                                    <View style={styles.teamMetadataBlock}>
                                        <Text style={styles.teamNameText} numberOfLines={1}>{item.name}</Text>
                                        <Text style={styles.teamSubText}>ID Badge: #{item.discriminator} • grade {item.classSection}</Text>
                                        {/* CHANGED LABEL TEXT AND VARIABLE REFERENCE HERE */}
                                        <Text style={styles.teamTelemetryText}>Attempts Made: {item.attemptsMade}</Text>
                                    </View>

                                    <View style={styles.scoreContainerSide}>
                                        <Text style={styles.scoreNumberLabel}>{item.teamScore}</Text>
                                        <Text style={styles.scoreSubLabel}>Rating</Text>
                                        <Ionicons name="chevron-forward" size={18} color="#000" style={styles.arrowIcon} />
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>

                </ScrollView>

                {/* --- NAVIGATION TAB FOOTER BOTTOM TABS BAR --- */}
                <View style={styles.bottomTabs}>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/home')}>
                        <Image source={require('../../assets/images/Home.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Home</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem} onPress={() => router.push('/(teacher)/leaderboard')}>
                        <Image source={require('../../assets/images/Leaderboard.png')} style={styles.tabIcon} />
                        <Text style={styles.tabText}>Leaderboard</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.tabItem}>
                        <Image source={require('../../assets/images/MembersB.png')} style={styles.tabIconActive} />
                        <Text style={styles.tabTextActive}>Teams</Text>
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
    mainScroll: { paddingTop: 110, paddingBottom: 110 },
    headerWrapper: { backgroundColor: 'rgba(243, 240, 233, 0.9)', zIndex: 1000, position: 'absolute', top: 0, width: '100%', paddingBottom: 10, borderBottomWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 10 : 0 },
    iconCircle: { backgroundColor: 'white', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeContainer: { backgroundColor: '#FFFFFF', height: 45, borderRadius: 25, width: width * 0.55, justifyContent: 'center', alignItems: 'center', elevation: 4 },
    portalBadgeText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 13, color: '#00E5FF', letterSpacing: 1 },
    
    sectionTitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 22, textDecorationLine: 'underline', marginHorizontal: 20, marginTop: 20 },
    filterBarScrollTrack: { paddingHorizontal: 15, paddingVertical: 12, gap: 10, alignItems: 'center' },
    filterChip: { backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#000', elevation: 2 },
    filterChipActive: { backgroundColor: '#00E5FF' },
    filterChipText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#000' },
    filterChipTextActive: { fontFamily: 'BalsamiqSans_700Bold', color: '#000' },

    sectionSubtitle: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, marginHorizontal: 20, marginTop: 10, marginBottom: 12 },
    teamsListContainer: { paddingHorizontal: 20, gap: 14 },
    teamCardWrapper: { backgroundColor: 'white', borderRadius: 22, borderWidth: 1.5, borderColor: '#000', padding: 16, flexDirection: 'row', alignItems: 'center', elevation: 3 },
    teamAvatarIcon: { width: 55, height: 55, marginRight: 15, resizeMode: 'contain' },
    teamMetadataBlock: { flex: 1, gap: 2 },
    teamNameText: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 16, color: '#000' },
    teamSubText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 12, color: '#555' },
    teamTelemetryText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 11, color: '#00E5FF', fontStyle: 'italic', marginTop: 2 },
    
    scoreContainerSide: { alignItems: 'center', justifyContent: 'center', paddingLeft: 10, minWidth: 55 },
    scoreNumberLabel: { fontFamily: 'BalsamiqSans_700Bold', fontSize: 20, color: '#000', lineHeight: 22 },
    scoreSubLabel: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 9, color: '#666', textTransform: 'uppercase' },
    arrowIcon: { marginTop: 4 },

    emptyContainerCard: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 22, borderWidth: 1.5, borderColor: '#BBB', borderStyle: 'dashed', padding: 40, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
    emptyContainerText: { fontFamily: 'BalsamiqSans_400Regular', fontSize: 13, color: '#666', textAlign: 'center' },
    
    bottomTabs: { position: 'absolute', bottom: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', height: 90, width: '100%', justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#EEEEEE', paddingBottom: 15 },
    tabItem: { alignItems: 'center', marginHorizontal: 40 },
    tabIcon: { width: 26, height: 26, tintColor: '#A0A0A0' },
    tabIconActive: { width: 30, height: 30 },
    tabText: { fontSize: 11, color: '#A0A0A0', marginTop: 5, fontFamily: 'BalsamiqSans_400Regular' },
    tabTextActive: { fontSize: 11, color: '#00E5FF', marginTop: 5, fontFamily: 'BalsamiqSans_700Bold' },
});