// js/mexcbt-service.js
// Service to handle MEXCBT operations (Mock Engine)

const MEXCBTService = {
    // --- Test Data (Seeding) ---
    // In a real app, this would fetch from an API. Here we provide a static list.
    availableTests: [
        {
            id: 't_nat_jp_01',
            title: '令和6年度 全国学力・学習状況調査 国語A',
            subject: 'Japanese',
            grade: '6',
            questions: [
                { id: 1, text: '次の漢字の読みを答えなさい。「日進月歩」', type: 'text', answer: 'にっしんげっぽ' },
                { id: 2, text: '「赤い」の品詞は？', type: 'choice', options: ['名詞', '形容詞', '動詞'], answer: '形容詞' }
            ]
        },
        {
            id: 't_nat_math_01',
            title: '令和6年度 全国学力・学習状況調査 算数A',
            subject: 'Math',
            grade: '6',
            questions: [
                { id: 1, text: '12 × 5 = ?', type: 'text', answer: '60' },
                { id: 2, text: '三角形の内角の和は？', type: 'choice', options: ['180度', '360度', '90度'], answer: '180度' }
            ]
        }
    ],

    async createTest(title, subject, questions) {
        // Tenant Admin creates a custom test
        return db.collection('mexcbt_tests').add({
            title, subject, questions,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- Distribution ---

    async broadcastToSchools(tenantId, testId, schoolIds) {
        // Tenant -> Multiple Schools
        const batch = db.batch();
        schoolIds.forEach(sid => {
            const ref = db.collection('mexcbt_assignments').doc();
            batch.set(ref, {
                testId,
                targetType: 'school',
                targetId: sid,
                tenantId,
                status: 'distributed', // distributed, open, closed
                distributedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        console.log(`Broadcasted test ${testId} to ${schoolIds.length} schools.`);
    },

    async distributeToClass(schoolId, tenantId, testId, classId) {
        // School -> Class
        return db.collection('mexcbt_assignments').add({
            testId,
            targetType: 'class',
            targetId: classId,
            schoolId,
            tenantId, // Pass down for visibility
            status: 'open',
            distributedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async distributeToStudent(schoolId, tenantId, testId, studentId) {
        // School -> Individual
        return db.collection('mexcbt_assignments').add({
            testId,
            targetType: 'student',
            targetId: studentId,
            schoolId,
            tenantId,
            status: 'open',
            distributedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- Taking Test ---

    async getTestContent(testId) {
        // 1. Check if custom test exists in DB
        const doc = await db.collection('mexcbt_tests').doc(testId).get();
        if (doc.exists) return doc.data();

        // 2. Check static list
        return this.availableTests.find(t => t.id === testId);
    },

    async submitResult(studentId, classId, schoolId, tenantId, testId, answers) {
        // Calculate Score (Simple exact match)
        const test = await this.getTestContent(testId);
        let score = 0;
        const total = test.questions.length;

        test.questions.forEach((q, idx) => {
            if (answers[idx] === q.answer) score++;
        });

        return db.collection('mexcbt_results').add({
            studentId, classId, schoolId, tenantId, testId,
            answers,
            score,
            totalQuestions: total,
            completedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // --- Reflection ---
    async saveReflection(resultId, comment) {
        return db.collection('mexcbt_results').doc(resultId).update({
            reflection: comment,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
};
