import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// DB_PATH aponta para um local que sobrevive aos deploys (na Hostinger, fora da pasta do app).
// Na primeira execução, copia o servidor.sqlite do projeto para lá, preservando o ranking.
const dbPath = process.env.DB_PATH || 'servidor.sqlite';
if (dbPath !== 'servidor.sqlite' && !fs.existsSync(dbPath)) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync('servidor.sqlite')) {
    fs.copyFileSync('servidor.sqlite', dbPath);
    console.log(`Banco copiado para ${dbPath}`);
  }
}
const db = new Database(dbPath);

// Tabela já existente: resultado final das avaliações de filmes
db.prepare(`
  CREATE TABLE IF NOT EXISTS avaliacoes_filmes (
    movie_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    poster_url TEXT,
    server_score REAL NOT NULL,
    vote_count INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// NOVA TABELA: votos individuais (quem avaliou o quê)
// 👉 Isso NÃO apaga nem altera nada da tabela avaliacoes_filmes.
db.prepare(`
  CREATE TABLE IF NOT EXISTS votos_filmes (
    movie_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT,
    score REAL NOT NULL,
    PRIMARY KEY (movie_id, user_id)
  )
`).run();

export default db;
