import 'dotenv/config';
import fs from 'node:fs';
import dotenv from 'dotenv';

// Na Hostinger: segredos (TOKEN, TMDB_API_KEY...) ficam fora da public_html,
// num arquivo que não é apagado nos deploys nem fica acessível pela web.
const secretsFile = process.env.SECRETS_FILE || '/home/u243267678/domains/mrbnexus.com.br/.rmdb.env';
if (fs.existsSync(secretsFile)) dotenv.config({ path: secretsFile });

// Este objeto vai conter todas as nossas variáveis de ambiente.
// Nós lemos do process.env aqui, e apenas aqui.
const config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    tmdbApiKey: process.env.TMDB_API_KEY,
    // canal onde o Fantasy anuncia abertura, fechamento e resultado
    fantasyChannelId: process.env.FANTASY_CHANNEL_ID
};

// Exportamos o objeto para que outros ficheiros o possam importar.
export default config;