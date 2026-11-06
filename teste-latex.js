
const fs = require('fs');
const { latexToPng } = require('./latex');

async function main() {
    const formula = String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;

    console.log('Gerando a fórmula...');

    const png = await latexToPng(formula);

    fs.writeFileSync('teste-formula.png', png);

    console.log('Fórmula convertida com sucesso!');
    console.log('Imagem salva em teste-formula.png');
}

main().catch(error => {
    console.error('Erro ao renderizar LaTeX:', error);
    process.exitCode = 1;
});
