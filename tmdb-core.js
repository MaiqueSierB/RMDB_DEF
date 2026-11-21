// tmdb.js — cliente mínimo da API do TMDB (aceita chave v3 ou token v4 "eyJ...")
import config from './config.js';

const API = 'https://api.themoviedb.org/3';

export async function tmdb(path) {
    const key = config.tmdbApiKey;
    if (!key) throw new Error('TMDB_API_KEY não configurada');

    const bearer = key.startsWith('eyJ');
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API}${path}${sep}language=pt-BR${bearer ? '' : `&api_key=${key}`}`;
    const r = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    return r.json();
}

export const pausa = (ms) => new Promise(r => setTimeout(r, ms));

// Próxima ocorrência de `hora` no fuso de Brasília (UTC-3, sem horário de verão)
export function msAte(hora) {
    const agora = Date.now();
    const alvo = new Date(agora);
    alvo.setUTCHours(hora + 3, 0, 0, 0);
    if (alvo.getTime() <= agora) alvo.setUTCDate(alvo.getUTCDate() + 1);
    return alvo.getTime() - agora;
}

// Data "de hoje" no fuso de Brasília
export const hojeBR = () => new Date(Date.now() - 3 * 3600 * 1000);
