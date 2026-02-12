import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAPzSivlMWn_LhvV1IgbN6FyPAxLwYuaFM",
  authDomain: "fleng-poketrack.firebaseapp.com",
  projectId: "fleng-poketrack",
  storageBucket: "fleng-poketrack.firebasestorage.app",
  messagingSenderId: "692183279507",
  appId: "1:692183279507:web:7fef73001a9c077debea66"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
