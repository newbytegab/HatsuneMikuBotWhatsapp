
const fs = require('fs');
const { tableToPng } = require('./latex');

async function main() {
    const rows = [
        ['Jogo', 'Gênero', 'Preço'],
        ['NEKOKORO', 'Visual novel', 'Grátis'],
        ['Clannad', 'Romance', 'Pago'],
        ['Boleirou', 'Futebol', 'Grátis']
    ];

    const png = await tableToPng(rows);

    fs.writeFileSync('teste-tabela.png', png);

    console.log('Tabela gerada com sucesso!');
}

main().catch(error => {
    console.error('Erro ao gerar tabela:', error);
    process.exitCode = 1;
});
