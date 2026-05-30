import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB4A5K9GXqeL4BA06QJ0pkeT1sCIgECQ7c",
  authDomain: "stemm-lab-ff36b.firebaseapp.com",
  projectId: "stemm-lab-ff36b",
  storageBucket: "stemm-lab-ff36b.firebasestorage.app",
  messagingSenderId: "180625478999",
  appId: "1:180625478999:web:9922ff1a2fc7da0dff5a12",
  measurementId: "G-YDMS3CQPYX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export for use in your screens
export const db_cloud = getFirestore(app);
export const auth = getAuth(app);

export default app;