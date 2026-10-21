/* ChatUP – הגדרות חיבור לשרת
   1. הדביקו כאן את פרטי ה־Firebase שלכם (Firebase Console ← Project settings ← Your apps ← SDK setup and configuration ← Config).
   2. (מומלץ לשיחות ברשת סלולרית) הוסיפו שרת TURN ברשימה turn. ראו מדריך ההתקנה. */
window.CHATUP_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE.firebaseapp.com",
    projectId: "PASTE",
    storageBucket: "PASTE.appspot.com",
    messagingSenderId: "PASTE",
    appId: "PASTE"
  },
  turn: [
    /* דוגמה:
    { urls: "turn:global.relay.metered.ca:80", username: "XXXX", credential: "YYYY" },
    { urls: "turn:global.relay.metered.ca:443?transport=tcp", username: "XXXX", credential: "YYYY" }
    */
  ]
};
