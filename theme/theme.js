// theme.js

export const themes = {
    light: {
        // Your current default styling
        backgroundImage: require('../assets/images/HomeBG.png'),
        headerBackground: 'rgba(243, 240, 233, 0.8)', 
        textColor: '#000000', // Default black for loose text
    },
    dark: {
        // Your new dark styling
        backgroundImage: require('../assets/images/DarkBG.png'),
        headerBackground: 'rgba(20, 20, 20, 0.9)', // Changes your bright cream header to a dark charcoal
        textColor: '#F4F0E6', // Automatically turns loose text white so it doesn't vanish
    }
};