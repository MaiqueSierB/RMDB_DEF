// fantasy.js — Fantasy de estreias do mês (TMDB, Brasil)
import db from './db.js';
import { tmdb, pausa, msAte, hojeBR } from './tmdb-core.js';

const MIN_VOTOS = 20;
const TZ = '-03:00';
const MAX_FILMES = 5;

db.exec(`
  CREATE TABLE IF NOT EXISTS fantasy_pool (
    temporada TEXT NOT NULL, tmdb_id INTEGER NOT NULL,
    titulo TEXT NOT NULL, estreia TEXT,
    PRIMARY KEY (temporada, tmdb_id)
  );
  CREATE TABLE IF NOT EXISTS fantasy_picks (
    temporada TEXT NOT NULL, discord_id TEXT NOT NULL,
    tmdb_id INTEGER NOT NULL, capitao INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (temporada, discord_id, tmdb_id)
  );
  CREATE TABLE IF NOT EXISTS fantasy_final (
    temporada TEXT PRIMARY KEY, resultado TEXT NOT NULL, apurado_em INTEGER NOT NULL
  );
`);

// "AAAA-MM" do mês atual (+offset) no horário de Brasília
export function temporada(offset = 0, base = hojeBR()) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const inicio = (t) => new Date(`${t}-01T00:00:00${TZ}`);
const ultimoDia = (t) => {
    const [a, m] = t.split('-').map(Number);
    return `${t}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
};
export const aberta = (t) => Date.now() < inicio(t).getTime();

export const pool = (t) =>
    db.prepare(`SELECT tmdb_id, titulo, estreia FROM fantasy_pool WHERE temporada = ? ORDER BY estreia, titulo`).all(t);

// Filmes com estreia no Brasil no mês `t`. O TMDB também devolve relançamentos
// (ex.: um "Duna" de 2021 voltando aos cinemas), que já têm nota alta e
// quebrariam o jogo — por isso só entram filmes lançados no mundo há no máximo 90 dias.
export async function gerarPool(t) {
    const corte = new Date(inicio(t).getTime() - 90 * 86400e3).toISOString().slice(0, 10);
    const novos = [];
    for (let page = 1; page <= 3 && novos.length < 20; page++) {
        const d = await tmdb(
            `/discover/movie?region=BR&with_release_type=2|3&sort_by=popularity.desc` +
            `&release_date.gte=${t}-01&release_date.lte=${ultimoDia(t)}&page=${page}`
        );
        for (const f of d.results ?? []) {
            if (novos.length >= 20) break;
            if (!f.release_date || f.release_date < corte) continue;
            // com region=BR a data da busca pode ser a do Brasil; confere a data original
            const det = await tmdb(`/movie/${f.id}`);
            if (det.release_date && det.release_date < corte) continue;
            novos.push(f);
            await pausa(100);
        }
        if (page >= (d.total_pages ?? 1)) break;
    }
    const ins = db.prepare(`INSERT OR IGNORE INTO fantasy_pool VALUES (?, ?, ?, ?)`);
    for (const f of novos.slice(0, 20)) ins.run(t, f.id, f.title, f.release_date);
    return pool(t);
}

export const formatarPool = (lista) =>
    lista.map((f, i) => `${i + 1}. ${f.titulo} (${f.estreia?.slice(8, 10)}/${f.estreia?.slice(5, 7)})`).join('\n');

export const time = (discordId, t) => db.prepare(`
    SELECT p.tmdb_id, p.capitao, f.titulo FROM fantasy_picks p
    JOIN fantasy_pool f ON f.temporada = p.temporada AND f.tmdb_id = p.tmdb_id
    WHERE p.temporada = ? AND p.discord_id = ? ORDER BY p.capitao DESC, f.titulo`).all(t, discordId);

export function escolher(discordId, t, escolha, capitao = false) {
    if (!aberta(t)) return 'As escolhas dessa temporada já fecharam 🔒';
    const lista = pool(t);
    if (!lista.length) return `A lista de ${t} ainda não saiu. Ela abre no dia 20 🗓️`;

    const f = /^\d+$/.test(escolha)
        ? lista[Number(escolha) - 1]
        : lista.find(x => x.titulo.toLowerCase().includes(escolha.toLowerCase()));
    if (!f) return `Esse filme não está na lista de ${t}. Use /fantasy filmes`;

    const meus = time(discordId, t);
    const jaTem = meus.find(m => m.tmdb_id === f.tmdb_id);
    if (!jaTem && meus.length >= MAX_FILMES) return `Você já tem ${MAX_FILMES} filmes. Remova um antes 😉`;
    if (jaTem && !capitao) return `**${f.titulo}** já está no seu time.`;

    db.transaction(() => {
        if (capitao) db.prepare(`UPDATE fantasy_picks SET capitao = 0 WHERE temporada = ? AND discord_id = ?`).run(t, discordId);
        db.prepare(`INSERT INTO fantasy_picks VALUES (?, ?, ?, ?)
                    ON CONFLICT(temporada, discord_id, tmdb_id) DO UPDATE SET capitao = excluded.capitao`)
            .run(t, discordId, f.tmdb_id, capitao ? 1 : 0);
    })();
    return `✅ **${f.titulo}** no seu time${capitao ? ' como ⭐ capitão (2x)' : ''} (${meus.length + (jaTem ? 0 : 1)}/${MAX_FILMES})`;
}

export function remover(discordId, t, escolha) {
    if (!aberta(t)) return 'As escolhas já fecharam 🔒';
    const f = time(discordId, t).find(x => x.titulo.toLowerCase().includes(escolha.toLowerCase()));
    if (!f) return 'Esse filme não está no seu time.';
    db.prepare(`DELETE FROM fantasy_picks WHERE temporada = ? AND discord_id = ? AND tmdb_id = ?`)
        .run(t, discordId, f.tmdb_id);
    return `🗑️ **${f.titulo}** saiu do seu time.`;
}

export async function ranking(t) {
    const fechado = db.prepare(`SELECT resultado FROM fantasy_final WHERE temporada = ?`).get(t);
    if (fechado) return { final: true, tabela: JSON.parse(fechado.resultado) };

    const picks = db.prepare(`SELECT * FROM fantasy_picks WHERE temporada = ?`).all(t);
    const usados = [...new Set(picks.map(p => p.tmdb_id))];

    const notas = {};
    for (const id of usados) {
        try {
            const d = await tmdb(`/movie/${id}`);
            notas[id] = d.vote_count >= MIN_VOTOS ? d.vote_average : 0;
        } catch (e) {
            console.error(`[fantasy] nota ${id}:`, e.message);
            notas[id] = 0;
        }
        await pausa(250);
    }

    const pontos = {};
    for (const p of picks) {
        pontos[p.discord_id] = (pontos[p.discord_id] ?? 0) + notas[p.tmdb_id] * (p.capitao ? 2 : 1);
    }
    const tabela = Object.entries(pontos)
        .map(([id, pts]) => ({ id, pts: Math.round(pts * 10) / 10 }))
        .sort((a, b) => b.pts - a.pts);
    return { final: false, tabela };
}

export const formatarRanking = (tabela) =>
    tabela.map((r, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} <@${r.id}> — ${r.pts} pts`).join('\n');

async function apurar(t) {
    const { tabela } = await ranking(t);
    db.prepare(`INSERT OR REPLACE INTO fantasy_final VALUES (?, ?, ?)`).run(t, JSON.stringify(tabela), Date.now());
    return tabela;
}

// Tarefas que dependem do estado, não do dia exato: se o bot estava fora do ar
// no dia 20 ou 15, ele recupera assim que voltar.
async function pendencias(anunciar) {
    const dia = hojeBR().getUTCDate();

    if (dia >= 20) {
        const t = temporada(1);
        if (!pool(t).length) {
            const lista = await gerarPool(t);
            if (lista.length) {
                await anunciar(`🎟️ **Fantasy de estreias ${t} aberto!**\n` +
                    `Escolha ${MAX_FILMES} filmes (1 capitão vale 2x) com /fantasy escolher até o dia 1:\n` +
                    formatarPool(lista));
            }
        }
    }

    if (dia >= 15) {
        const t = temporada(-1);
        const jaApurado = db.prepare(`SELECT 1 FROM fantasy_final WHERE temporada = ?`).get(t);
        const temPicks = db.prepare(`SELECT 1 FROM fantasy_picks WHERE temporada = ? LIMIT 1`).get(t);
        if (!jaApurado && temPicks) {
            const tabela = await apurar(t);
            if (tabela.length) await anunciar(`🏆 **Resultado do Fantasy ${t}**\n` + formatarRanking(tabela));
        }
    }
}

// Roda todo dia às `hora` (horário de Brasília) e uma vez ao ligar o bot
export function agendar(anunciar, hora = 10) {
    const rodar = async () => {
        try {
            if (hojeBR().getUTCDate() === 1) {
                await anunciar(`🔒 Escolhas do Fantasy ${temporada()} fechadas! Boa sorte 🍿`);
            }
            await pendencias(anunciar);
        } catch (e) { console.error('[fantasy]', e.message); }
        setTimeout(rodar, msAte(hora));
    };
    pendencias(anunciar).catch(e => console.error('[fantasy] pendências:', e.message));
    setTimeout(rodar, msAte(hora));
}
