const state = {
    startedAt: new Date(),
    local: {
        totalRequests: 0,
        totalTokens: 0,
        minute: {
            windowStart: Date.now(),
            requests: 0,
            tokens: 0,
        },
        day: {
            dateKey: getDayKey(),
            requests: 0,
            tokens: 0,
        },
    },
    lastApi: {
        tpmLimit: null,
        tpmRemaining: null,
        tpmReset: null,
        rpdLimit: null,
        rpdRemaining: null,
        rpdReset: null,
        model: null,
    },
};

function getDayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

function ensureWindows() {
    const now = Date.now();

    if (now - state.local.minute.windowStart >= 60_000) {
        state.local.minute.windowStart = now;
        state.local.minute.requests = 0;
        state.local.minute.tokens = 0;
    }

    const today = getDayKey();
    if (state.local.day.dateKey !== today) {
        state.local.day.dateKey = today;
        state.local.day.requests = 0;
        state.local.day.tokens = 0;
    }
}

function formatNumber(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return 'N/D';
    return Number(n).toLocaleString('pt-BR');
}

function formatPercent(used, limit) {
    if (used == null || limit == null || limit === 0) return 'N/D';
    return ((used / limit) * 100).toFixed(1).replace('.', ',') + '%';
}

function parseHeaderInt(headers, name) {
    if (!headers) return null;
    const val = headers.get ? headers.get(name) : headers[name];
    if (val == null || val === '') return null;
    const n = parseInt(String(val), 10);
    return Number.isFinite(n) ? n : null;
}

function parseHeaderStr(headers, name) {
    if (!headers) return null;
    const val = headers.get ? headers.get(name) : headers[name];
    return val != null && val !== '' ? String(val) : null;
}

/**
 * Registra o uso de uma chamada bem-sucedida.
 * @param {object} opts
 * @param {string} opts.model
 * @param {object} [opts.usage] - usage do corpo da resposta
 * @param {Headers|object} [opts.headers] - headers da resposta
 * @param {string} [opts.endpoint] - 'chat' | 'vision' | 'stt'
 */
function recordSuccess({ model, usage, headers, endpoint = 'chat' }) {
    ensureWindows();

    const promptTokens =
        usage?.prompt_tokens ??
        usage?.input_tokens ??
        null;
    const completionTokens =
        usage?.completion_tokens ??
        usage?.output_tokens ??
        null;
    const totalTokens =
        usage?.total_tokens ??
        (promptTokens != null && completionTokens != null
            ? promptTokens + completionTokens
            : null);

    // Atualiza contadores locais
    state.local.totalRequests += 1;
    state.local.minute.requests += 1;
    state.local.day.requests += 1;

    if (totalTokens != null) {
        state.local.totalTokens += totalTokens;
        state.local.minute.tokens += totalTokens;
        state.local.day.tokens += totalTokens;
    }

    // Captura headers oficiais da Groq
    const tpmLimit = parseHeaderInt(headers, 'x-ratelimit-limit-tokens');
    const tpmRemaining = parseHeaderInt(headers, 'x-ratelimit-remaining-tokens');
    const tpmReset = parseHeaderStr(headers, 'x-ratelimit-reset-tokens');
    const rpdLimit = parseHeaderInt(headers, 'x-ratelimit-limit-requests');
    const rpdRemaining = parseHeaderInt(headers, 'x-ratelimit-remaining-requests');
    const rpdReset = parseHeaderStr(headers, 'x-ratelimit-reset-requests');

    state.lastApi = {
        tpmLimit,
        tpmRemaining,
        tpmReset,
        rpdLimit,
        rpdRemaining,
        rpdReset,
        model,
    };

    // Calculados a partir dos headers da API (quando disponíveis)
    const tpmUsed =
        tpmLimit != null && tpmRemaining != null
            ? tpmLimit - tpmRemaining
            : null;
    const rpdUsed =
        rpdLimit != null && rpdRemaining != null
            ? rpdLimit - rpdRemaining
            : null;

    printUsageReport({
        model,
        endpoint,
        promptTokens,
        completionTokens,
        totalTokens,
        tpmLimit,
        tpmRemaining,
        tpmUsed,
        tpmReset,
        rpdLimit,
        rpdRemaining,
        rpdUsed,
        rpdReset,
        isError: false,
    });
}

/**
 * Registra uma falha de rate limit (429).
 */
function recordRateLimitError({ model, error, headers, endpoint = 'chat' }) {
    ensureWindows();

    const retryAfter =
        parseHeaderStr(headers, 'retry-after') ||
        (error?.headers && parseHeaderStr(error.headers, 'retry-after')) ||
        null;

    const tpmLimit = parseHeaderInt(headers, 'x-ratelimit-limit-tokens') ??
        parseHeaderInt(error?.headers, 'x-ratelimit-limit-tokens');
    const tpmRemaining = parseHeaderInt(headers, 'x-ratelimit-remaining-tokens') ??
        parseHeaderInt(error?.headers, 'x-ratelimit-remaining-tokens');
    const tpmReset = parseHeaderStr(headers, 'x-ratelimit-reset-tokens') ??
        parseHeaderStr(error?.headers, 'x-ratelimit-reset-tokens');
    const rpdLimit = parseHeaderInt(headers, 'x-ratelimit-limit-requests') ??
        parseHeaderInt(error?.headers, 'x-ratelimit-limit-requests');
    const rpdRemaining = parseHeaderInt(headers, 'x-ratelimit-remaining-requests') ??
        parseHeaderInt(error?.headers, 'x-ratelimit-remaining-requests');
    const rpdReset = parseHeaderStr(headers, 'x-ratelimit-reset-requests') ??
        parseHeaderStr(error?.headers, 'x-ratelimit-reset-requests');

    console.log('\n════════════════════════════════════════════════════════');
    console.log('⚠️  RATE LIMIT ATINGIDO (HTTP 429)');
    console.log('════════════════════════════════════════════════════════');
    console.log(`Modelo:        ${model || 'N/D'}`);
    console.log(`Endpoint:      ${endpoint}`);
    console.log(`Mensagem:      ${error?.message || String(error)}`);
    console.log('');
    console.log('Headers da API:');
    console.log(`  TPM limite:          ${formatNumber(tpmLimit)}`);
    console.log(`  TPM restante:        ${formatNumber(tpmRemaining)}`);
    console.log(`  TPM reset em:        ${tpmReset || 'N/D'}`);
    console.log(`  RPD limite:          ${formatNumber(rpdLimit)}`);
    console.log(`  RPD restante:        ${formatNumber(rpdRemaining)}`);
    console.log(`  RPD reset em:        ${rpdReset || 'N/D'}`);
    console.log(`  retry-after:         ${retryAfter != null ? retryAfter + 's' : 'N/D'}`);
    console.log('');
    console.log('Fonte: headers da resposta de erro da Groq');
    console.log('════════════════════════════════════════════════════════\n');
}

function printUsageReport({
    model,
    endpoint,
    promptTokens,
    completionTokens,
    totalTokens,
    tpmLimit,
    tpmRemaining,
    tpmUsed,
    tpmReset,
    rpdLimit,
    rpdRemaining,
    rpdUsed,
    rpdReset,
}) {
    const line = '════════════════════════════════════════════════════════';

    console.log(`\n${line}`);
    console.log('CONSUMO DA IA (Groq)');
    console.log(line);
    console.log(`Modelo:              ${model || 'N/D'}`);
    console.log(`Endpoint:            ${endpoint}`);
    console.log(`Requisição nº:       ${formatNumber(state.local.totalRequests)} (desde o start do bot)`);
    console.log('');

    console.log('─ Tokens desta requisição (corpo da resposta da API)');
    console.log(`  Entrada (prompt):  ${formatNumber(promptTokens)}`);
    console.log(`  Saída (completion):${formatNumber(completionTokens)}`);
    console.log(`  Total:             ${formatNumber(totalTokens)}`);
    console.log('');

    console.log('─ Limite por minuto – TPM (headers da API)');
    console.log(`  Limite (TPM):      ${formatNumber(tpmLimit)}`);
    console.log(`  Utilizado:         ${formatNumber(tpmUsed)}`);
    console.log(`  Restante:          ${formatNumber(tpmRemaining)}`);
    console.log(`  Uso:               ${formatPercent(tpmUsed, tpmLimit)}`);
    console.log(`  Reset em:          ${tpmReset || 'N/D'}`);
    console.log('');

    console.log('─ Limite diário – RPD (headers da API)');
    console.log(`  Limite (RPD):      ${formatNumber(rpdLimit)}`);
    console.log(`  Utilizado:         ${formatNumber(rpdUsed)}`);
    console.log(`  Restante:          ${formatNumber(rpdRemaining)}`);
    console.log(`  Uso:               ${formatPercent(rpdUsed, rpdLimit)}`);
    console.log(`  Reset em:          ${rpdReset || 'N/D'}`);
    console.log('');

    console.log('─ Contadores locais (calculados pelo bot – reiniciam ao reiniciar o processo)');
    console.log(`  Requisições neste minuto:  ${formatNumber(state.local.minute.requests)}`);
    console.log(`  Tokens neste minuto:       ${formatNumber(state.local.minute.tokens)}`);
    console.log(`  Requisições hoje (UTC):    ${formatNumber(state.local.day.requests)}`);
    console.log(`  Tokens hoje (UTC):         ${formatNumber(state.local.day.tokens)}`);
    console.log(`  Total desde o start:       ${formatNumber(state.local.totalRequests)} req / ${formatNumber(state.local.totalTokens)} tokens`);
    console.log('');

    console.log('Fonte dos dados:');
    console.log('  Tokens da requisição → corpo da resposta (usage)');
    console.log('  TPM / RPD / restantes → headers x-ratelimit-* da Groq');
    console.log('  Contadores locais    → calculados pelo bot (não são o histórico real da conta)');
    console.log(`${line}\n`);
}

function printStartupBanner() {
    console.log('\n────────────────────────────────────────────────────────');
    console.log('[Token Usage] Monitoramento de tokens da Groq ativado.');
    console.log('[Token Usage] Contadores locais reiniciados (processo novo).');
    console.log('[Token Usage] Dados de limite vêm dos headers oficiais da API.');
    console.log('────────────────────────────────────────────────────────\n');
}

module.exports = {
    recordSuccess,
    recordRateLimitError,
    printStartupBanner,
    getState: () => ({ ...state }),
};