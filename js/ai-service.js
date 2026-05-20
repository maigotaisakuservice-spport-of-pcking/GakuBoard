// js/ai-service.js

const AIService = {

    /**
     * Check if AI is enabled for the tenant and get config.
     * Returns { enabled: boolean, apiKey: string, models: object } or throws error.
     */
    async getConfig(tenantId) {
        // 1. Check Public Settings (Usage Switch)
        const publicDoc = await db.collection('tenants').doc(tenantId).get();
        if (!publicDoc.exists) throw new Error("Tenant not found");

        const pubData = publicDoc.data();
        if (!pubData.aiSettings || !pubData.aiSettings.contractEnabled || !pubData.aiSettings.usageEnabled) {
            return { enabled: false };
        }

        // 2. Fetch Private Key (Only if role permits)
        try {
            const privateDoc = await db.collection('tenants').doc(tenantId).collection('private_config').doc('ai').get();
            if (!privateDoc.exists) return { enabled: false, reason: "No config" };

            const privData = privateDoc.data();
            return {
                enabled: true,
                apiKey: privData.apiKey,
                models: privData.models || {}
            };
        } catch(e) {
            console.warn("AI Key Access Denied:", e);
            return { enabled: false, reason: "Access Denied" };
        }
    },

    /**
     * Call Gemini API (Text Generation)
     */
    async callGemini(config, modelName, prompt) {
        if (!config.enabled || !config.apiKey) throw new Error("AI disabled");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini API Error");
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },

    /**
     * Call Gemini API (Multimodal / Vision)
     * imageBase64: without prefix, just data
     */
    async callGeminiVision(config, modelName, prompt, imageBase64) {
        if (!config.enabled || !config.apiKey) throw new Error("AI disabled");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`;

        const body = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: "image/png", data: imageBase64 } }
                ]
            }]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini Vision API Error");
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },

    // --- Specific Features ---

    async draftAnnouncement(tenantId, topic) {
        const config = await this.getConfig(tenantId);
        if (!config.enabled) throw new Error("AI機能が無効です");

        const model = config.models.announce || 'gemini-2.5-flash-lite'; // Fallback to user wish or standard
        const prompt = `
あなたは学校の先生です。以下のトピックについて、保護者や生徒向けのお知らせ文を作成してください。
文体は丁寧で、親しみやすくしてください。

トピック: ${topic}
        `;
        return this.callGemini(config, model, prompt);
    },

    async analyzeDailyRecords(tenantId, recordsText) {
        const config = await this.getConfig(tenantId);
        if (!config.enabled) throw new Error("AI機能が無効です");

        const model = config.models.daily || 'gemini-3-pro-preview';
        const prompt = `
以下の生徒の毎日の記録（コメント）を分析し、緊急性の高いSOS（いじめ、自殺念慮、家庭内暴力、極度の体調不良など）が含まれていないかチェックしてください。
結果はJSON形式で返してください。
形式: { "analysis": [ { "studentName": "...", "score": 1-5 (5 is danger), "reason": "..." } ] }

記録:
${recordsText}
        `;
        // Note: Real implementation should enforce JSON mode if supported or parse loosely
        const res = await this.callGemini(config, model, prompt);

        // Clean markdown code fence if present
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    },

    async recognizeShape(tenantId, imageBase64) {
        const config = await this.getConfig(tenantId);
        if (!config.enabled) throw new Error("AI機能が無効です");

        const model = config.models.whiteboard || 'gemini-2.5-flash';
        const prompt = `
Analyze the hand-drawn stroke in this image.
1. If it looks like a geometric shape (Rectangle, Circle, Triangle, Line), return:
{ "type": "shape", "shape": "rectangle", "x": 0.1, "y": 0.1, "width": 0.5, "height": 0.3, "color": "black" }
(Coordinates 0-1 range).

2. If it looks like handwritten text, OCR it and return:
{ "type": "text", "text": "Hello World", "x": 0.1, "y": 0.1, "color": "black", "fontSize": 20 }
(For fontSize, estimate appropriate size relative to image height assuming image height is 600px).

If unknown/scribble, return { "type": "unknown" }.
Return only valid JSON.
        `;

        const res = await this.callGeminiVision(config, model, prompt, imageBase64);
        const jsonStr = res.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    }
};
