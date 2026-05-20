// js/auth.js

// Login with Email/Password
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error-message');

    try {
        errorDiv.classList.add('hidden');
        await auth.signInWithEmailAndPassword(email, password);
        await redirectBasedOnRole();
    } catch (error) {
        console.error("Login failed:", error);
        errorDiv.textContent = "ログインに失敗しました: " + error.message;
        errorDiv.classList.remove('hidden');
    }
}

// Login with Google
async function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
        await redirectBasedOnRole();
    } catch (error) {
        console.error("Google Login failed:", error);
        alert("Googleログインに失敗しました");
    }
}

// Login with Microsoft
async function handleMicrosoftLogin() {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    try {
        await auth.signInWithPopup(provider);
        await redirectBasedOnRole();
    } catch (error) {
        console.error("Microsoft Login failed:", error);
        alert("Microsoftログインに失敗しました");
    }
}

// Redirect logic
async function redirectBasedOnRole() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // Fetch user profile from Firestore
        let userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            console.log("User profile not found. Checking whitelist for:", user.email);

            // Check whitelist
            // Note: Use a query for email.
            const whitelistSnap = await db.collection('whitelist').where('email', '==', user.email).get();

            if (!whitelistSnap.empty) {
                const invite = whitelistSnap.docs[0].data();
                console.log("Found invite:", invite);

                // Create user doc
                const newProfile = {
                    email: user.email,
                    role: invite.role,
                    name: invite.name || user.displayName || 'No Name',
                    tenantId: invite.tenantId || null,
                    schoolId: invite.schoolId || null,
                    classId: invite.classId || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                await db.collection('users').doc(user.uid).set(newProfile);
                console.log("Created user profile.");

                // Re-fetch to confirm
                userDoc = await db.collection('users').doc(user.uid).get();
            } else {
                alert("ユーザー登録されていません。管理者に招待を依頼してください。");
                await auth.signOut();
                return;
            }
        }

        const userData = userDoc.data();
        const role = userData.role;

        switch (role) {
            case 'super_admin':
                window.location.href = 'super-admin.html';
                break;
            case 'tenant_admin':
                window.location.href = 'tenant-admin.html';
                break;
            case 'school_admin':
                window.location.href = 'school-admin.html';
                break;
            case 'teacher':
                window.location.href = 'teacher-dashboard.html';
                break;
            case 'student':
                window.location.href = 'student-dashboard.html';
                break;
            default:
                console.error("Unknown role:", role);
                alert("不明なロールです。");
        }

    } catch (error) {
        console.error("Error fetching user profile:", error);
        alert("プロファイル情報の取得に失敗しました: " + error.message);
    }
}

// Logout function (to be used in dashboards)
async function handleLogout() {
    try {
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout failed:", error);
    }
}
