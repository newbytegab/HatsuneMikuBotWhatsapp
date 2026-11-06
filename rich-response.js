const { latexToPng, tableToPng } = require('./latex');

/**
 * Envia uma resposta formatada citando a mensagem original.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {string} jid
 * @param {string} response
 * @param {import('@whiskeysockets/baileys').WAMessage} [quotedMsg]
 */
async function sendFormattedResponse(sock, jid, response, quotedMsg) {
    // Opções de envio: sempre tenta citar a mensagem original quando ela for válida
    const options = {};
    if (
        quotedMsg &&
        typeof quotedMsg === 'object' &&
        quotedMsg.key &&
        quotedMsg.key.id
    ) {
        options.quoted = quotedMsg;
    } else if (quotedMsg) {
        console.warn(
            '[rich-response] quotedMsg inválido ou incompleto. Enviando sem citação.'
        );
    }

    let text = String(response || '');

    // Converte delimitadores LaTeX comuns em blocos renderizáveis
    text = text
        .replace(
            /\\\[([\s\S]*?)\\\]/g,
            (_, formula) => `[[LATEX]]${formula.trim()}[[/LATEX]]`
        )
        .replace(
            /\$\$([\s\S]*?)\$\$/g,
            (_, formula) => `[[LATEX]]${formula.trim()}[[/LATEX]]`
        )
        .replace(
            /\\\(([\s\S]*?)\\\)/g,
            (_, formula) => `[[LATEX]]${formula.trim()}[[/LATEX]]`
        );

    const pattern = /\[\[(LATEX|TABELA)\]\]([\s\S]*?)\[\[\/\1\]\]/g;

    const blocks = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
        blocks.push({
            type: match[1],
            content: match[2].trim(),
            start: match.index,
            end: pattern.lastIndex
        });
    }

    // Sem marcadores especiais: envia o texto normalmente (com citação)
    if (blocks.length === 0) {
        if (text.trim()) {
            await sock.sendMessage(jid, { text: text.trim() }, options);
        }
        return;
    }

    let position = 0;

    for (const block of blocks) {
        const before = text.slice(position, block.start);

        if (before.trim()) {
            await sock.sendMessage(jid, { text: before.trim() }, options);
        }

        try {
            let imageBuffer;

            if (block.type === 'LATEX') {
                const formula = block.content.trim();

                // Evita gerar imagens para conteúdo vazio ou só com símbolos
                if (!formula || !/[a-zA-Z0-9]/.test(formula)) {
                    if (formula) {
                        await sock.sendMessage(jid, { text: formula }, options);
                    }
                    position = block.end;
                    continue;
                }

                imageBuffer = await latexToPng(formula);
            } else if (block.type === 'TABELA') {
                const rows = JSON.parse(block.content);
                imageBuffer = await tableToPng(rows);
            }

            if (imageBuffer) {
                await sock.sendMessage(
                    jid,
                    { image: imageBuffer },
                    options
                );

                console.log(`[Renderização] Bloco ${block.type} enviado.`);
            }
        } catch (error) {
            console.error(
                `[Renderização] Falha em ${block.type}:`,
                error.message
            );

            // Fallback: envia o conteúdo original como texto (ainda citando)
            if (block.content.trim()) {
                await sock.sendMessage(
                    jid,
                    { text: block.content },
                    options
                );
            }
        }

        position = block.end;
    }

    const remaining = text.slice(position);

    if (remaining.trim()) {
        await sock.sendMessage(jid, { text: remaining.trim() }, options);
    }
}

module.exports = { sendFormattedResponse };