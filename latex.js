
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const sharp = require('sharp');

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
    packages: ['base', 'ams']
});

const svg = new SVG({
    fontCache: 'none'
});

const html = mathjax.document('', {
    InputJax: tex,
    OutputJax: svg
});

// Converte uma fórmula LaTeX em PNG.
async function latexToPng(expression) {
    const node = html.convert(expression, {
        display: true
    });

    const svgNodes = adaptor.tags(node, 'svg');
    const svgNode = svgNodes[0];

    if (!svgNode) {
        throw new Error('O MathJax não gerou um SVG válido.');
    }



    return sharp(Buffer.from(adaptor.outerHTML(svgNode)), {
        density: 200
    })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();


}

// Escapa caracteres que poderiam quebrar o SVG.
function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Converte uma matriz de dados em uma tabela PNG.
async function tableToPng(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('A tabela está vazia.');
    }

    const data = rows
        .slice(0, 26)
        .map(row => row.map(cell => String(cell).slice(0, 100)));

    const columnCount = Math.max(...data.map(row => row.length));

    if (columnCount === 0 || columnCount > 8) {
        throw new Error('A tabela precisa ter entre 1 e 8 colunas.');
    }

    // Completa linhas que tenham menos células.
    for (const row of data) {
        while (row.length < columnCount) row.push('');
    }

    const padding = 18;
    const rowHeight = 48;

    const columnWidths = Array.from(
        { length: columnCount },
        (_, col) => {
            const longest = Math.max(
                ...data.map(row => row[col].length)
            );
            return Math.min(280, Math.max(110, longest * 9 + padding * 2));
        }
    );

    const width = columnWidths.reduce((sum, value) => sum + value, 0);
    const height = data.length * rowHeight + 32;

    let svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg"
             width="${width}" height="${height}"
             viewBox="0 0 ${width} ${height}">
          <rect width="100%" height="100%" fill="#ffffff"/>
    `;

    let y = 16;

    for (let r = 0; r < data.length; r++) {
        const isHeader = r === 0;
        const background = isHeader ? '#e8eaf6' : (r % 2 ? '#ffffff' : '#f5f6fa');

        let x = 0;

        for (let c = 0; c < columnCount; c++) {
            const cellWidth = columnWidths[c];

            svgContent += `
                <rect x="${x}" y="${y}" width="${cellWidth}"
                      height="${rowHeight}" fill="${background}"
                      stroke="#c9cdd8" stroke-width="1"/>
                <text x="${x + padding}" y="${y + 29}"
                      font-family="Arial, sans-serif"
                      font-size="16"
                      font-weight="${isHeader ? 'bold' : 'normal'}"
                      fill="#202124">${escapeXml(data[r][c])}</text>
            `;

            x += cellWidth;
        }

        y += rowHeight;
    }

    svgContent += '</svg>';

    return sharp(Buffer.from(svgContent))
        .png()
        .toBuffer();
}

module.exports = {
    latexToPng,
    tableToPng
};
