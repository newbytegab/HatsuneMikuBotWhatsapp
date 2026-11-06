const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    downloadMediaMessage,
} = require('@whiskeysockets/baileys');
const { sendFormattedResponse } = require('./rich-response');
const pino = require('pino');
const { getConfig, prepareMessage, saveMessages } = require('./db');

const { transcribeAudio, chatReply, analyzeImage } = require('./ai');

let sock;
let pairingCode = null;

function getSock()         { return sock; }
function getPairingCode()  { return pairingCode; }
function setPairingCode(c) { pairingCode = c; }

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version }          = await fetchLatestBaileysVersion();
    const logger               = pino({ level: 'silent' });

    sock = makeWASocket({
        version,
        auth:              state,
        printQRInTerminal: false,
        logger,
        browser:           ['Ubuntu', 'Chrome', '20.0.04'],
    });

    sock.ev.on('creds.update', saveCreds);

    // ── Connection state ──────────────────────────────
    sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[Bot] Connection closed. Reconnect:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            pairingCode = null;
            console.log('[Bot] Miku is Online & Ready! 💙✨');
        }
    });



    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        for (const msg of messages) {
            try {
                if (!msg?.message || msg.key.fromMe) continue;

                const jid = msg.key.remoteJid;
                if (!jid || jid === 'status@broadcast') continue;

                const isGroup = jid.endsWith('@g.us');

                // Desembrulha mensagens temporárias e de visualização única.
                let content = msg.message;
                while (
                    content?.ephemeralMessage?.message ||
                    content?.viewOnceMessage?.message ||
                    content?.viewOnceMessageV2?.message ||
                    content?.documentWithCaptionMessage?.message
                ) {
                    content =
                        content.ephemeralMessage?.message ||
                        content.viewOnceMessage?.message ||
                        content.viewOnceMessageV2?.message ||
                        content.documentWithCaptionMessage?.message;
                }

                const name = msg.pushName?.trim().slice(0, 80) || null;

                const text =
                    content.conversation ||
                    content.extendedTextMessage?.text ||
                    content.imageMessage?.caption ||
                    content.videoMessage?.caption ||
                    content.documentMessage?.caption ||
                    '';

                const normalizeJid = value =>
                    value ? value.replace(/:\d+@/, '@').toLowerCase() : '';

                const botIds = [
                    sock.user?.id,
                    sock.user?.lid
                ].map(normalizeJid).filter(Boolean);

                const contextInfo =
                    content.extendedTextMessage?.contextInfo ||
                    content.imageMessage?.contextInfo ||
                    content.videoMessage?.contextInfo ||
                    content.stickerMessage?.contextInfo ||
                    content.audioMessage?.contextInfo ||
                    content.documentMessage?.contextInfo;

                const mentionedJids = (
                    contextInfo?.mentionedJid || []
                ).map(normalizeJid);

                const mentionedMiku = mentionedJids.some(
                    id => botIds.includes(id)
                );

                const isImage = !!content.imageMessage;
                const isSticker = !!content.stickerMessage;
                const isAudio = !!content.audioMessage;
                const isVideo = !!content.videoMessage;

                const typeName = isImage ? 'imagem'
                    : isSticker ? 'figurinha'
                    : isAudio ? 'áudio'
                    : isVideo ? 'vídeo'
                    : content.conversation || content.extendedTextMessage
                        ? 'texto'
                        : 'outro';

                console.log('\n[Mensagem] Recebida');
                console.log(`[Mensagem] Tipo: ${typeName}`);
                console.log(`[Mensagem] Origem: ${isGroup ? 'grupo' : 'privado'}`);
                console.log(`[Mensagem] Nome disponível: ${name || 'não informado'}`);
                console.log(`[Mensagem] JID: ${jid}`);
                console.log(`[Mensagem] Evento: ${type || 'não informado'}`);
                console.log(`[Mensagem] Menção à Miku: ${mentionedMiku}`);

                // Nos grupos, só responde quando for realmente mencionada.
                if (isGroup && !mentionedMiku) {
                    console.log('[Mensagem] Ignorada: Miku não foi mencionada.');
                    continue;
                }


                if (isImage || isSticker) {
                    try {
                        console.log(`[Visão] Recebido: ${isImage ? 'imagem' : 'figurinha'}`);

                        const buffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            {},
                            {
                                logger,
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );

                        console.log(`[Visão] Mídia baixada: ${buffer.length} bytes.`);

                        // Imagens comuns são JPEG por padrão no WhatsApp.
                        // Figurinhas estáticas costumam ser WebP.
                        const mimeType = isSticker
                            ? 'image/webp'
                            : (content.imageMessage.mimetype || 'image/jpeg');


                        const prompt = isSticker
                            ? 'Observe esta figurinha e entenda o que ela comunica. Responda em português brasileiro, de forma breve e natural, como uma amiga conversando no WhatsApp. Se houver texto importante, considere-o. Não faça uma descrição visual detalhada nem use listas.'
                            : 'Observe a imagem para entender seu conteúdo e o contexto. Responda em português brasileiro, de forma breve e natural, como uma amiga conversando no WhatsApp. Se a pessoa perguntar se você conhece algo, responda diretamente à pergunta. Evite descrições visuais detalhadas, listas, títulos e introduções como "Aqui está a descrição da imagem". Se não reconhecer algo com segurança, diga isso naturalmente.';


                        const description = await analyzeImage(
                            buffer,
                            mimeType,
                            prompt
                        );

                        
                        const config = await getConfig();

                            const visualContext = `${name || 'A pessoa'} mandou uma imagem${text ? ` e escreveu: "${text}"` : ''}.

                            Análise da imagem:
                            ${description}`;

                            const prepared = await prepareMessage(
                                jid,
                                visualContext,
                                name,
                                config
                            );

                            const reply = prepared.reply || await chatReply(
                                prepared.systemPrompt,
                                visualContext,
                                config.ai_model,
                                prepared.messages
                            );


                        const responseText = isGroup && name
                            ? `${name}, ${reply}`
                            : reply;

                        await sock.sendMessage(jid, {
                            text: responseText,
                            ...(isGroup && contextInfo?.participant
                                ? { mentions: [contextInfo.participant] }
                                : {})
                        });

                        console.log('[Visão] Resposta enviada.');
                    } catch (e) {
                        console.error('[Visão] Falha ao analisar mídia:', e.message);

                        await sock.sendMessage(jid, {
                            text: 'Eita! 😅 Tentei olhar essa mídia, mas não consegui analisá-la agora. Pode tentar enviar de novo?'
                        });
                    }

                    continue;
                }


                let finalText = text;

                if (isAudio) {
                    console.log('[Áudio] Mensagem de áudio detectada.');

                    const config = await getConfig();
                    console.log(`[Áudio] Transcrição habilitada: ${!!config.stt_enabled}`);
                    console.log(`[Áudio] Modelo configurado: ${config.whisper_model || 'padrão'}`);

                    if (!config.stt_enabled) {
                        console.warn('[Áudio] Transcrição desabilitada no painel.');
                        await sock.sendMessage(jid, {
                            text: 'No momento, minha transcrição de áudio está desativada. 😅🎤 Ative-a no painel para eu conseguir entender seus áudios!'
                        });
                        continue;
                    }

                    try {
                        console.log('[Áudio] Baixando arquivo de mídia...');

                        const buffer = await downloadMediaMessage(
                            msg,
                            'buffer',
                            {},
                            {
                                logger,
                                reuploadRequest: sock.updateMediaMessage
                            }
                        );

                        console.log(`[Áudio] Download concluído: ${buffer.length} bytes.`);
                        console.log('[Áudio] Enviando áudio para transcrição...');

                        finalText = await transcribeAudio(
                            buffer,
                            config.whisper_model
                        );

                        finalText = String(finalText || '').trim();

                        console.log(`[Áudio] Transcrição concluída: ${finalText.length} caracteres.`);
                    } catch (e) {
                        console.error('[Áudio] Falha na transcrição:', e.message);
                        await sock.sendMessage(jid, {
                            text: 'Não consegui entender esse áudio 😅🎤 Tente enviar novamente!'
                        });
                        continue;
                    }
                }

                if (!finalText.trim()) {
                    console.log('[Mensagem] Ignorada: não há texto para processar.');
                    continue;
                }

                console.log(`[Processamento] Texto recebido: ${finalText.length} caracteres.`);
                console.log('[Banco] Consultando configuração e histórico...');

                const config = await getConfig();
                const prepared = await prepareMessage(
                    jid,
                    finalText,
                    name,
                    config
                );

                if (prepared.reply) {
                    console.log('[Processamento] Resposta automática do banco/configuração.');
                    await sock.sendMessage(jid, { text: prepared.reply });
                    continue;
                }

                if (prepared.reply === null) {
                    console.log('[Processamento] Resposta cancelada pela configuração ou bloqueio.');
                    continue;
                }

                const history = Array.isArray(prepared.messages)
                    ? [...prepared.messages]
                    : [];

                // Informa à IA quem enviou a mensagem atual.
                // Se o WhatsApp não fornecer um nome, a Miku não deve inventá-lo.
                if (history.length > 0 && history[0].role === 'system' && name) {
                    history.splice(1, 0, {
                        role: 'system',
                        content: `Nesta mensagem, a pessoa que está falando é "${name}". Se for natural, chame-a por esse nome. Não repita o nome em toda resposta.`
                    });
                } else if (
                    history.length > 0 &&
                    history[0].role === 'system' &&
                    !name
                ) {
                    history.splice(1, 0, {
                        role: 'system',
                        content: 'O nome da pessoa que enviou esta mensagem não está disponível. Não invente um nome.'
                    });
                }

                console.log(`[Histórico] Mensagens enviadas à IA: ${history.length}`);
                console.log(`[IA] Modelo: ${config.ai_model}`);
                console.log('[IA] Gerando resposta...');

                const reply = await chatReply(
                    prepared.systemPrompt,
                    finalText,
                    config.ai_model,
                    history
                );

                console.log(`[IA] Resposta gerada: ${reply?.length || 0} caracteres.`);

                await sendFormattedResponse(sock, jid, reply, msg);

                console.log('[Envio] Resposta enviada ao WhatsApp.');

                saveMessages(jid, finalText, reply, config.ai_model).catch(e =>
                    console.error('[Banco] Erro ao salvar histórico:', e.message)
                );

                console.log('[Processamento] Mensagem concluída com sucesso.');
            } catch (e) {
                console.error('[Erro] Falha ao processar mensagem:', e.message);
                console.error(e.stack);
            }
        }
    });
}

module.exports = { startBot, getSock, getPairingCode, setPairingCode };