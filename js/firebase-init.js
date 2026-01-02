// Assumes firebase-app-compat.js, firebase-auth-compat.js, and firebase-firestore-compat.js are loaded
// and firebaseConfig is defined in firebase-config.js (or loaded before this)

if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded.');
} else {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Expose services globally
    window.auth = firebase.auth();
    window.db = firebase.firestore();

    // Enable offline persistence
    window.db.enablePersistence()
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('Persistence failed: Multiple tabs open');
            } else if (err.code == 'unimplemented') {
                console.warn('Persistence not supported by browser');
            }
        });

    console.log('Firebase initialized.');
}
