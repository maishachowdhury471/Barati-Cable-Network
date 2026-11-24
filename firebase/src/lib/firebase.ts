import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// অফলাইন: IndexedDB-তে ডেটা জমা থাকবে। নেট না থাকলেও আব্বু বিলের টিক দিতে
// পারবে, নেট এলে নিজে থেকে Firestore-এ জমা (sync) হয়ে যাবে।
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  // ইতিমধ্যে চালু থাকলে (যেমন dev-এ hot reload) আগেরটাই ব্যবহার করো
  dbInstance = getFirestore(app);
}
export const db = dbInstance;
