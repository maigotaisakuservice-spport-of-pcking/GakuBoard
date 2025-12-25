// js/integration-service.js
// Service to handle Google/Teams Integration (Simulation)

const IntegrationService = {

    // --- Linking (Mock OAuth) ---
    async linkAccount(schoolId, provider) {
        // Simulate popup delay
        await new Promise(r => setTimeout(r, 1500));

        // Update Firestore
        const ref = db.collection('integrations').doc(schoolId);
        const updateData = {};

        if (provider === 'google') {
            updateData.googleLinked = true;
            updateData.googleLinkedAt = firebase.firestore.FieldValue.serverTimestamp();
            updateData.googleEmail = "admin@school.edu.jp"; // Mock
        } else if (provider === 'teams') {
            updateData.teamsLinked = true;
            updateData.teamsLinkedAt = firebase.firestore.FieldValue.serverTimestamp();
            updateData.teamsTenantId = "tid_" + Math.random().toString(36).substr(2, 8); // Mock
        }

        await ref.set(updateData, { merge: true });
        return true;
    },

    async unlinkAccount(schoolId, provider) {
        const ref = db.collection('integrations').doc(schoolId);
        const updateData = {};
        if (provider === 'google') updateData.googleLinked = false;
        if (provider === 'teams') updateData.teamsLinked = false;

        await ref.update(updateData);
    },

    // --- Syncing (Mock API Calls) ---
    async syncClasses(schoolId, provider) {
        // Simulate long running process
        const steps = [
            "L-Gateクラス情報を取得中...",
            `${provider === 'google' ? 'Google Classroom' : 'Microsoft Teams'} に接続中...`,
            "クラス情報を照合中...",
            "メンバーを追加中...",
            "同期完了"
        ];

        // This function yields status updates for UI
        return {
            async *run() {
                for (const step of steps) {
                    await new Promise(r => setTimeout(r, 800)); // 0.8s per step
                    yield step;
                }

                // Update Last Synced
                const ref = db.collection('integrations').doc(schoolId);
                const update = {};
                if (provider === 'google') update.lastGoogleSync = firebase.firestore.FieldValue.serverTimestamp();
                if (provider === 'teams') update.lastTeamsSync = firebase.firestore.FieldValue.serverTimestamp();
                await ref.update(update);
            }
        };
    }
};
