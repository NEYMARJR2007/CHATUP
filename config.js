/* ChatUP – הגדרות חיבור לשרת */
window.CHATUP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAwfq6E1awZiqcyY7PF1_ZTc0BliYYxxnU",
    authDomain: "chatup-656fd.firebaseapp.com",
    projectId: "chatup-656fd",
    storageBucket: "chatup-656fd.firebasestorage.app",
    messagingSenderId: "60685364216",
    appId: "1:60685364216:web:e7ca02d47ddcdacbf1c40d",
    measurementId: "G-K6VH4WCTMF"
  },
  /* שרת ההתראות (Cloudflare Worker). מדביקים כאן את הכתובת של ה־Worker */
  push: {
    url: "https://chatup-notify.hrypwtr89.workers.dev",
    publicKey: "BK8dFCiW93CJ4Nfnv5WyCN37VnSss3-SDy7YdSKuyxCLUcp-0GIWW13AA_V3mQjvx3c_1EgktjJM0PntHeyKKZo"
  },
  turn: [
    /* שרת TURN לשיחות ברשת סלולרית (שלב 5 במדריך) */
  ]
};
