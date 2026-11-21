// watchlist.js — "quero ver" + aviso quando chega em streaming (BR)
import db from './db.js';
import { tmdb, pausa, msAte } from './tmdb-core.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    discord_id TEXT NOT NULL,
    tmdb_id    INTEGER NOT NULL,
    titulo     TEXT NOT NULL,
    criado_em  INTEGER NOT NULL,
    PRIMARY KEY (discord_id, tmdb_id)
  );
  CREATE TABLE IF NOT EXISTS streaming_cache (
    tmdb_id    INTEGER PRIMARY KEY,
    provedores TEXT NOT NULL,
    checado_em INTEGER NOT NULL
  );
`);

async function provedoresBR(tmdbId) {
    const d = await tmdb(`/movie/${tmdbId}/watch/providers`);
    return (d.results?.BR?.flatrate ?? []).map(p => p.provider_name);
}

export async function adicionar(discordId, busca) {
    const r = await tmdb(`/search/movie?query=${encodeURIComponent(busca)}`);
    const f = r.results?.[0];
    if (!f) return { ok: false, msg: `Não achei "${busca}" 🤔` };

    const ano = f.release_date?.slice(0, 4) || '?';
    db.prepare(`INSERT OR IGNORE INTO watchlist VALUES (?, ?, ?, ?)`)
        .run(discordId, f.id, f.title, Date.now());

    const agora = await provedoresBR(f.id);
    db.prepare(`INSERT OR REPLACE INTO streaming_cache VALUES (?, ?, ?)`)
        .run(f.id, JSON.stringify(agora), Date.now());

    const onde = agora.length ? `Já está em: ${agora.join(', ')} 🍿`
                              : 'Ainda não está em streaming. Eu te aviso quando chegar 👀';
    return { ok: true, msg: `📌 **${f.title}** (${ano}) na sua lista.\n${onde}` };
}

export function listar(discordId) {
    return db.prepare(`
        SELECT w.titulo, c.provedores FROM watchlist w
        LEFT JOIN streaming_cache c ON c.tmdb_id = w.tmdb_id
        WHERE w.discord_id = ? ORDER BY w.criado_em`)
        .all(discordId)
        .map(r => ({ titulo: r.titulo, provedores: JSON.parse(r.provedores ?? '[]') }));
}

// Remove só UM filme (o mais parecido), não todos que batem no LIKE
export function remover(discordId, busca) {
    const f = db.prepare(`
        SELECT tmdb_id, titulo FROM watchlist
        WHERE discord_id = ? AND titulo LIKE ?
        ORDER BY (lower(titulo) = lower(?)) DESC, length(titulo) LIMIT 1`)
        .get(discordId, `%${busca}%`, busca);
    if (!f) return null;
    db.prepare(`DELETE FROM watchlist WHERE discord_id = ? AND tmdb_id = ?`).run(discordId, f.tmdb_id);
    return f.titulo;
}

export async function checar(avisar) {
    const filmes = db.prepare(`SELECT DISTINCT tmdb_id, titulo FROM watchlist`).all();

    for (const { tmdb_id, titulo } of filmes) {
        try {
            const agora = await provedoresBR(tmdb_id);
            const antes = JSON.parse(
                db.prepare(`SELECT provedores FROM streaming_cache WHERE tmdb_id = ?`)
                    .get(tmdb_id)?.provedores ?? '[]'
            );
            const novos = agora.filter(p => !antes.includes(p));

            db.prepare(`INSERT OR REPLACE INTO streaming_cache VALUES (?, ?, ?)`)
                .run(tmdb_id, JSON.stringify(agora), Date.now());

            if (novos.length) {
                const pessoas = db.prepare(`SELECT discord_id FROM watchlist WHERE tmdb_id = ?`).all(tmdb_id);
                for (const { discord_id } of pessoas) {
                    try {
                        await avisar(discord_id, `🎉 **${titulo}** chegou em ${novos.join(', ')}!`);
                    } catch (e) {
                        console.error(`[watchlist] aviso p/ ${discord_id}:`, e.message);
                    }
                }
            }
        } catch (e) {
            console.error(`[watchlist] ${titulo}:`, e.message);
        }
        await pausa(300);
    }
}

// Roda todo dia às `hora` (horário de Brasília)
export function agendar(avisar, hora = 10) {
    const rodar = async () => {
        try { await checar(avisar); }
        catch (e) { console.error('[watchlist]', e.message); }
        setTimeout(rodar, msAte(hora));
    };
    setTimeout(rodar, msAte(hora));
}
