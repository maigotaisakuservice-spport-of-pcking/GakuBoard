// Ensure firebase is loaded before this script

/**
 * Generate a random password
 */
function generatePassword(length = 12) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

/**
 * Creates a user in Authentication and Firestore.
 * Uses a secondary Firebase App to create the auth user without signing out the current admin.
 *
 * @param {object} primaryDb - The Firestore instance of the logged-in admin.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @param {string} role
 * @param {object} additionalData - { tenantId, schoolId, classId, etc. }
 */
async function createAccountDirectly(primaryDb, email, password, displayName, role, additionalData) {
    // 1. Initialize Secondary App
    const secondaryAppName = "secondaryApp-" + new Date().getTime();
    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = secondaryApp.auth();

    try {
        // 2. Create User in Auth (Secondary App)
        const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;

        // 3. Update Profile (DisplayName)
        await newUser.updateProfile({ displayName: displayName });

        // 4. Create User Document in Firestore (Primary App - as Admin)
        const uid = newUser.uid;
        const userDoc = {
            email: email,
            displayName: displayName,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...additionalData
        };

        // Clean undefined values
        Object.keys(userDoc).forEach(key => userDoc[key] === undefined && delete userDoc[key]);

        await primaryDb.collection('users').doc(uid).set(userDoc);

        console.log(`User created: ${email} (${uid})`);
        return { uid, email, password, displayName };

    } catch (error) {
        console.error("Error creating user directly:", error);
        throw error;
    } finally {
        // 5. Cleanup Secondary App
        await secondaryApp.delete();
    }
}

/**
 * Cascade Delete Helpers
 */

async function deleteCollectionByQuery(db, collectionName, queryFn) {
    const collectionRef = db.collection(collectionName);
    const query = queryFn(collectionRef);
    const snapshot = await query.get();

    if (snapshot.empty) return [];

    const batchSize = 500;
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
        currentBatch.delete(doc.ref);
        count++;
        if (count >= batchSize) {
            batches.push(currentBatch);
            currentBatch = db.batch();
            count = 0;
        }
    });
    if (count > 0) {
        batches.push(currentBatch);
    }

    await Promise.all(batches.map(b => b.commit()));
    console.log(`Deleted ${snapshot.size} docs from ${collectionName}`);
    return snapshot.docs.map(d => d.id); // Return IDs for further cascading if needed
}

async function deleteUserAndData(db, userId) {
    // 1. Delete Daily Records
    await deleteCollectionByQuery(db, 'daily_records', ref => ref.where('studentId', '==', userId));
    // 2. Delete User Doc
    await db.collection('users').doc(userId).delete();
    console.log(`Deleted user and data: ${userId}`);
}

async function deleteClassAndData(db, classId) {
    // 1. Find Students in Class
    const usersSnapshot = await db.collection('users').where('classId', '==', classId).get();

    // 2. Delete Each Student and their Data
    // We do this sequentially or in parallel? Parallel is faster but might hit rate limits if huge.
    // For now, Promise.all is okay for small scale.
    const deletePromises = usersSnapshot.docs.map(doc => deleteUserAndData(db, doc.id));
    await Promise.all(deletePromises);

    // 3. Delete Class Doc
    await db.collection('classes').doc(classId).delete();
    console.log(`Deleted class and users: ${classId}`);
}

async function deleteSchoolAndData(db, schoolId) {
    // 1. Find Classes in School
    const classesSnapshot = await db.collection('classes').where('schoolId', '==', schoolId).get();

    // 2. Delete Each Class and its data
    const deleteClassPromises = classesSnapshot.docs.map(doc => deleteClassAndData(db, doc.id));
    await Promise.all(deleteClassPromises);

    // 3. Find Users (School Admins / Unassigned Users) in School
    // Note: Students are deleted by class deletion, but what if they are unassigned or School Admins?
    const usersSnapshot = await db.collection('users').where('schoolId', '==', schoolId).get();
    // Some users might have been deleted already if they were in a class?
    // deleteUserAndData handles deletion of user doc. If doc is already deleted, it's fine.
    const deleteUserPromises = usersSnapshot.docs.map(doc => deleteUserAndData(db, doc.id));
    await Promise.all(deleteUserPromises);

    // 4. Delete Whitelist entries
    await deleteCollectionByQuery(db, 'whitelist', ref => ref.where('schoolId', '==', schoolId));

    // 5. Delete School Doc
    await db.collection('schools').doc(schoolId).delete();
    console.log(`Deleted school and all data: ${schoolId}`);
}

async function deleteTenantAndData(db, tenantId) {
    // 1. Find Schools in Tenant
    const schoolsSnapshot = await db.collection('schools').where('tenantId', '==', tenantId).get();

    // 2. Delete Each School
    const deleteSchoolPromises = schoolsSnapshot.docs.map(doc => deleteSchoolAndData(db, doc.id));
    await Promise.all(deleteSchoolPromises);

    // 3. Find Users (Tenant Admins / Unassigned)
    const usersSnapshot = await db.collection('users').where('tenantId', '==', tenantId).get();
    const deleteUserPromises = usersSnapshot.docs.map(doc => deleteUserAndData(db, doc.id));
    await Promise.all(deleteUserPromises);

    // 4. Delete Whitelist entries
    await deleteCollectionByQuery(db, 'whitelist', ref => ref.where('tenantId', '==', tenantId));

    // 5. Delete Tenant Doc
    await db.collection('tenants').doc(tenantId).delete();
    console.log(`Deleted tenant and all data: ${tenantId}`);
}
