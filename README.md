# 🎵 MikuBot — WhatsApp AI Bot

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/Baileys-7.x-25D366?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![Groq](https://img.shields.io/badge/Groq-AI-orange?style=for-the-badge)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**A Hatsune Miku-themed WhatsApp AI chatbot — powered by Groq, Baileys, and Supabase Edge Functions.**

---

## ✨ Features

- 🤖 **AI Chat** — Powered by Groq (Llama 4 Scout by default)
- 🎤 **Voice-to-Text** — Transcribes voice messages via Groq Whisper
- 🧠 **Chat History** — Per-user conversation memory via Supabase
- 🚫 **Rate Limiting & Blocking** — Managed through Edge Functions
- 🌐 **Web Dashboard** — Manage settings via browser
- 🔗 **Pairing Code Auth** — No QR scan needed, just a phone number

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| WhatsApp | `@whiskeysockets/baileys` |
| Web Server | `express` |
| AI Backend | `Groq API` |
| Database | `Supabase Edge Functions` |
| STT | `Groq Whisper` |

---

## 🚀 Setup

### 1. Clone the repo
```bash
git clone https://github.com/M5Develop/MikuBot-WhatsApp.git
cd MikuBot-WhatsApp
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Fill in your keys in `.env`.

### 4. Run
```bash
npm start
```

Dashboard available at `http://localhost:3000`

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | Groq API key — free at [console.groq.com](https://console.groq.com) |
| `SUPABASE_URL` | ✅ | Your Supabase project URL |

---

## 📱 Connecting to WhatsApp

1. Open the dashboard at `http://localhost:3000`
2. Enter your WhatsApp phone number
3. Get the pairing code and enter it in WhatsApp → Linked Devices

---

## 🗂️ Project Structure

```
MikuBot-WhatsApp/
├── index.js      # Entry point — DB → Bot → Server boot sequence
├── bot.js        # Baileys socket, message handler, STT
├── ai.js         # Groq chat + Whisper transcription
├── db.js         # Supabase Edge Functions client
├── routes.js     # Express dashboard API routes
├── .env.example
└── package.json
```

---

## 📄 License

MIT — free to use, modify, and build on.

---

<div align="center">
Made with 💙 by <a href="https://github.com/M5Develop">M5Develop</a> | <a href="https://huggingface.co/M5-Dev">HuggingFace</a>
</div>
