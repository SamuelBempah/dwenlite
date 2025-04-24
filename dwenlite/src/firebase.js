import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; // Add this import

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCcRES5X4RSjWcRGm5crwuSl6qUKx6aG6Y",
  authDomain: "leumas-decipher-softwares.firebaseapp.com",
  databaseURL: "https://leumas-decipher-softwares-default-rtdb.firebaseio.com",
  projectId: "leumas-decipher-softwares",
  storageBucket: "leumas-decipher-softwares.appspot.com",
  messagingSenderId: "375335626697",
  appId: "1:375335626697:web:da9ee4c9dac8931f7caa18",
  measurementId: "G-0T6TTDN6K8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // Add storage initialization

// Provider for Google sign-in
const googleProvider = new GoogleAuthProvider();

export { auth, db, storage, googleProvider }; // Export storage