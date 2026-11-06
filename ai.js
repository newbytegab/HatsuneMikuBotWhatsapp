const Groq   = require('groq-sdk');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const {
    recordSuccess,
    recordRateLimitError,
    printStartupBanner,
} = require('./token-usage');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_AI_MODEL      = 'meta-llama/llama-4-scout-17b-16e-instruct';
const DEFAULT_WHISPER_MODEL = 'whisper-large-v3-turbo';

// Aviso único no start do módulo
printStartupBanner();

/**
 * Transcribe voice buffer using Groq Whisper
 */
async function transcribeAudio(buffer, model = DEFAULT_WHISPER_MODEL) {
    const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}.ogg`);
    fs.writeFileSync(tmpPath, buffer);

    try {
        const { data: transcription, response: raw } = await groq.audio.transcriptions
            .create({
                file:            fs.createReadStream(tmpPath),
                model,
                response_format: 'text',
            })
            .withResponse();

        // Whisper normalmente não retorna usage de tokens no mesmo formato.
        // Ainda assim capturamos headers de rate limit.
        recordSuccess({
            model,
            usage: null,
            headers: raw.headers,
            endpoint: 'stt',
        });

        console.log(`[STT] Model: ${model} → "${transcription}"`);
        return transcription;

    } catch (error) {
        if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
            recordRateLimitError({
                model,
                error,
                headers: error?.headers || null,
                endpoint: 'stt',
            });
        }
        throw error;
    } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
}

/**
 * Generate chat reply
 */
async function chatReply(systemPrompt, userText, model = DEFAULT_AI_MODEL, history = null) {
    const messages = history || [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userText      },
    ];

    try {
        const { data: completion, response: raw } = await groq.chat.completions
            .create({ model, messages })
            .withResponse();

        const reply = completion.choices[0].message.content;
        const usage = completion.usage || null;

        recordSuccess({
            model,
            usage,
            headers: raw.headers,
            endpoint: 'chat',
        });

        console.log(`[AI] Model: ${model} | History: ${history ? history.length : 0} msgs`);
        return reply;

    } catch (error) {
        if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
            recordRateLimitError({
                model,
                error,
                headers: error?.headers || null,
                endpoint: 'chat',
            });
        }
        throw error;
    }
}

/**
 * Análise de imagem (visão)
 */
async function analyzeImage(buffer, mimeType = 'image/jpeg', prompt = 'Descreva esta imagem de forma natural e detalhada.') {
    console.log('[Visão] Preparando imagem para análise...');

    const imageBase64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    console.log('[Visão] Enviando imagem para o Qwen...');

    const model = 'qwen/qwen3.8-27b';

    try {
        const { data: completion, response: raw } = await groq.chat.completions
            .create({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: { url: dataUrl }
                            }
                        ]
                    }
                ],
                max_completion_tokens: 500
            })
            .withResponse();

        const result = completion.choices[0]?.message?.content;
        const usage = completion.usage || null;

        if (!result) {
            throw new Error('O modelo não retornou uma descrição da imagem.');
        }

        recordSuccess({
            model,
            usage,
            headers: raw.headers,
            endpoint: 'vision',
        });

        console.log(`[Visão] Análise concluída: ${result.length} caracteres.`);
        return result;

    } catch (error) {
        if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
            recordRateLimitError({
                model,
                error,
                headers: error?.headers || null,
                endpoint: 'vision',
            });
        }
        throw error;
    }
}

module.exports = { transcribeAudio, chatReply, analyzeImage };