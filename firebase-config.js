import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";



export const firebaseConfig = {

  apiKey: "AIzaSyAG1UPUKECymTZ3aifFQuyN_mbviYjm2Q4",

  authDomain: "control-asistencias-y-entradas.firebaseapp.com",

  databaseURL: "https://control-asistencias-y-entradas-default-rtdb.firebaseio.com",

  projectId: "control-asistencias-y-entradas",

  storageBucket: "control-asistencias-y-entradas.firebasestorage.app",

  messagingSenderId: "420567524268",

  appId: "1:420567524268:web:5ec9a3e319ec56a6395009"

};



export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);



export const notificationWebhookUrl = "";
