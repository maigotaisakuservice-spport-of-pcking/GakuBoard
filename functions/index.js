const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Webhook Handler
// User can configure this URL in their external tool (Teams, Classroom)
// URL format: https://<region>-<project>.cloudfunctions.net/incomingWebhook?tenantId=<id>&token=<secret>
exports.incomingWebhook = functions.https.onRequest(async (req, res) => {
    const tenantId = req.query.tenantId;
    const token = req.query.token; // Simple security verification

    if (!tenantId || !token) {
        return res.status(400).send('Missing tenantId or token');
    }

    // Verify token against tenant config in Firestore
    const tenantDoc = await admin.firestore().collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists || tenantDoc.data().webhookToken !== token) {
        return res.status(403).send('Invalid token');
    }

    const payload = req.body;

    // Logic to parse payload and create a ToDo item
    // This is a generic handler, can be customized for Teams/Classroom structures

    let title = "New Webhook Item";
    let description = JSON.stringify(payload);

    // Simple heuristic for Teams/Classroom
    if (payload.text) title = payload.text.substring(0, 50);
    if (payload.summary) title = payload.summary;

    try {
        await admin.firestore().collection('activities').add({
            type: 'todo',
            tenantId: tenantId,
            title: title,
            description: description,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            target: 'all' // Default to all, or parse from payload if possible
        });
        res.status(200).send('Processed');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Error');
    }
});
