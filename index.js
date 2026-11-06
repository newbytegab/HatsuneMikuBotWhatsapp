require('dotenv').config();

const express    = require('express');
const bodyParser = require('body-parser');

const { initDB }   = require('./db');
const { startBot } = require('./bot');
const routes       = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', routes);

// Boot sequence — DB first, then bot, then server
(async () => {

    try {
        console.log('[Boot] Inicializando banco de dados...');
        await initDB();
        console.log('[Boot] Banco de dados iniciado!');

        console.log('[Boot] Inicializando bot...');
        await startBot();
        console.log('[Boot] Bot iniciado!');

        app.listen(PORT, () => {
            console.log(`[Server] Dashboard → http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('[Boot Error]:', err);
        console.error('[Boot Error - Cause]:', err.cause);
        process.exit(1);
    }
})();