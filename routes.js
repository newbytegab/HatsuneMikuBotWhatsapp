const express  = require('express');
const path     = require('path');
const router   = express.Router();

const { getConfig, updatePhone, updateConfig } = require('./db');
const { getSock, getPairingCode, setPairingCode } = require('./bot');

// ── GET / — Serve dashboard ──────────────────────────
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ── GET /status — Bot + config state ────────────────
router.get('/status', async (req, res) => {
    try {
        const sock   = getSock();
        const config = await getConfig();

        res.json({
            connected:    !!sock?.authState?.creds?.registered,
            pairingCode:  getPairingCode(),
            prompt:       config?.prompt        || '',
            phone:        config?.phone         || '',
            sttEnabled:   !!config?.stt_enabled,
            whisperModel: config?.whisper_model || 'whisper-large-v3-turbo',
            aiModel:      config?.ai_model      || 'meta-llama/llama-4-scout-17b-16e-instruct',
        });
    } catch (err) {
        console.error('[Routes] /status error:', err.message);
        res.status(500).json({ error: 'DB Error' });
    }
});

// ── POST /get-code — Request WhatsApp pairing code ──
router.post('/get-code', async (req, res) => {
    const phone = (req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'Invalid number' });

    try {
        await updatePhone(phone);

        const sock = getSock();
        if (!sock) return res.status(500).json({ error: 'Socket not ready' });

        let code = await sock.requestPairingCode(phone);
        code     = code?.match(/.{1,4}/g)?.join('-') || code;

        setPairingCode(code);
        console.log(`[Routes] Pairing code: ${code}`);
        res.json({ success: true, code });

    } catch (err) {
        console.error('[Routes] /get-code error:', err.message);
        res.status(500).json({ error: 'Could not generate code' });
    }
});

// ── POST /save — Save dashboard settings ────────────
router.post('/save', async (req, res) => {
    try {
        const { prompt, whisperModel, sttEnabled, aiModel } = req.body;
        await updateConfig({ prompt, whisperModel, sttEnabled, aiModel });
        res.json({ success: true });
    } catch (err) {
        console.error('[Routes] /save error:', err.message);
        res.status(500).json({ error: 'Save failed' });
    }
});

module.exports = router;