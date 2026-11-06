
const { sendFormattedResponse } = require('./rich-response');

const sockFake = {
    async sendMessage(jid, message) {
        if (message.image) {
            console.log(`[TESTE] Imagem enviada para ${jid}`);
        } else {
            console.log(`[TESTE] Texto enviado: ${message.text}`);
        }
    }
};

async function main() {
    const resposta = [
        'Olha a fórmula de Bhaskara!',
        '[[LATEX]]',
        String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
        '[[/LATEX]]',
        'E aqui está uma tabelinha:',
        '[[TABELA]]',
        JSON.stringify([
            ['Jogo', 'Preço'],
            ['NEKOKORO', 'Grátis'],
            ['Clannad', 'Pago']
        ]),
        '[[/TABELA]]',
        'Prontinho!'
    ].join('\n');

    await sendFormattedResponse(sockFake, 'teste', resposta);
}

main().catch(console.error);
