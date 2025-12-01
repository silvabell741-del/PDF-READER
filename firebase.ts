import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAt_O84vRAH4NbYzjXsYUFGXe82oR_SS4E",
  authDomain: "historia-acessivel-76f55.firebaseapp.com",
  projectId: "historia-acessivel-76f55",
  storageBucket: "historia-acessivel-76f55.firebasestorage.app",
  messagingSenderId: "456660035916",
  appId: "1:456660035916:web:337c6ec488020d987d47e9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);