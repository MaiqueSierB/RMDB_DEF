// Buscas no TMDB usadas pelos comandos (o cliente HTTP fica em tmdb-core.js)
import { tmdb } from './tmdb-core.js';

const relevante = r => r.vote_count > 50 && r.poster_path;   // corta lixo sem pôster ou sem votos

// Filmes e séries, mais populares primeiro
export async function searchMovie(nome) {
    const data = await tmdb(`/search/multi?query=${encodeURIComponent(nome)}`);
    return (data.results || [])
        .filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && relevante(r))
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 5)
        .map(r => ({ id: r.id, title: r.title || r.name, media_type: r.media_type }));
}

export const getMovieDetails = (id, tipo = 'movie') => tmdb(`/${tipo}/${id}`);

export async function getMovieRecommendations(id) {
    const data = await tmdb(`/movie/${id}/recommendations`);
    return (data.results || []).filter(relevante).sort((a, b) => b.popularity - a.popularity);
}

export async function getMoviesByGenre(genreId) {
    const data = await tmdb(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`);
    return (data.results || []).filter(relevante);
}
