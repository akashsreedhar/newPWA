import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD5zqQwL_IrG3o6oAlhjd3uuAUpy6hZ184",
  authDomain: "supermarketbot-eaf6a.firebaseapp.com",
  projectId: "supermarketbot-eaf6a",
  storageBucket: "supermarketbot-eaf6a.firebasestorage.app",
  messagingSenderId: "1070805923537",
  appId: "1:1070805923537:web:8e631de72af271e62ff7f0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);