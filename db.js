// db.js — Supabase Edge Functions client
// config → /functions/v1/config  (global settings)
// bot    → /functions/v1/bot     (users, messages, analytics)

const BASE_URL = process.env.SUPABASE_URL;

async function edgeFetch(fn, method, action, body = null) {
    const url = `${BASE_URL}/functions/v1/${fn}?action=${action}`;
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_PUBLISHABLE_KEY,
            'x-mikubot-secret': process.env.MIKUBOT_API_SECRET,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`[DB] ${fn}/${action} (${res.status}): ${txt}`);
    }
    return res.json();
}

// ── Init ──────────────────────────────────────────────
async function initDB() {
    const config = await edgeFetch('config', 'GET', 'get');
    if (!config?.id) throw new Error('[DB] Could not reach config Edge Function');
    console.log('[DB] Supabase ready ✅');
}

// ── Config queries ───────────────────────────────────
async function getConfig() {
    return edgeFetch('config', 'GET', 'get');
}

async function updatePhone(phone) {
    return edgeFetch('config', 'POST', 'phone', { phone });
}

async function updateConfig({ prompt, whisperModel, sttEnabled, aiModel }) {
    return edgeFetch('config', 'POST', 'save', { prompt, whisperModel, sttEnabled, aiModel });
}

// ── Bot queries ──────────────────────────────────────

// Returns { messages, systemPrompt } — messages sent directly to Groq
async function prepareMessage(jid, text, name, config) {
    return edgeFetch('bot', 'POST', 'message', { jid, text, name, config });
}

// Save user message and bot reply after Groq responds
async function saveMessages(jid, userText, botReply, model) {
    return edgeFetch('bot', 'POST', 'save_messages', { jid, userText, botReply, model });
}

// Analytics for the dashboard
async function getAnalytics() {
    return edgeFetch('bot', 'GET', 'analytics');
}

// Block/unblock a user
async function setBlocked(jid, blocked) {
    return edgeFetch('bot', 'POST', 'block', { jid, blocked });
}

// Set a custom prompt for a specific user
async function setUserPrompt(jid, prompt) {
    return edgeFetch('bot', 'POST', 'set_prompt', { jid, prompt });
}

module.exports = {
    initDB, getConfig, updatePhone, updateConfig,
    prepareMessage, saveMessages, getAnalytics, setBlocked, setUserPrompt,
};