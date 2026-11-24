// BCN — বারাটি কেবল নেটওয়ার্ক
// Firebase কনফিগ — কোনো সিক্রেট এই ফাইলে লিখবে না।
// apiKey .env ফাইল থেকে আসে (VITE_FIREBASE_API_KEY) — .env কখনো GitHub-এ পুশ করবে না।
// .env.example দেখে নিজের .env বানাও।
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  appId: "1:470430106934:web:41dd2fe84dadbe67515f97",
  authDomain: "bcn-barati-cable-network.firebaseapp.com",
  messagingSenderId: "470430106934",
  projectId: "bcn-barati-cable-network",
  storageBucket: "bcn-barati-cable-network.firebasestorage.app",
};