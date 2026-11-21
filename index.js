import http from 'node:http';
// Registra os slash commands a cada início
import './deploy-commands.js';
import {
    Client, Events, GatewayIntentBits,
    EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';

import db from "./db.js";
import config from './config.js';
import {
    searchMovie,
    getMovieDetails,
    getMoviesByGenre,
    getMovieRecommendations
} from './tmdb.js';
import * as watchlist from './watchlist.js';
import * as fantasy from './fantasy.js';
import { hojeBR } from './tmdb-core.js';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, c => {
    console.log(`🎬 RMDB online como ${c.user.tag}`);

    if (!config.tmdbApiKey) {
        console.warn('⚠️ TMDB_API_KEY ausente: watchlist e fantasy desligados.');
        return;
    }

    // Watchlist: aviso por DM quando o filme chega em streaming
    watchlist.agendar(async (discordId, msg) => {
        const user = await client.users.fetch(discordId);
        await user.send(msg);
    });

    // Fantasy: anúncios no canal configurado
    if (config.fantasyChannelId) {
        fantasy.agendar(async (msg) => {
            const canal = await client.channels.fetch(config.fantasyChannelId);
            await canal.send({ content: msg.slice(0, 2000), allowedMentions: { parse: [] } });
        });
    } else {
        console.warn('⚠️ FANTASY_CHANNEL_ID ausente: anúncios do fantasy desligados.');
    }
});

// ===== /assistir (watchlist) =====
async function comandoAssistir(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'adicionar') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const r = await watchlist.adicionar(userId, interaction.options.getString('filme'));
        return interaction.editReply(r.msg);
    }
    if (sub === 'lista') {
        const lista = watchlist.listar(userId);
        const texto = lista.length
            ? lista.map(f => `🎬 **${f.titulo}** — ${f.provedores.length ? f.provedores.join(', ') : 'ainda não está em streaming'}`).join('\n')
            : 'Sua lista está vazia. Use /assistir adicionar';
        return interaction.reply({ content: texto.slice(0, 2000), flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remover') {
        const titulo = watchlist.remover(userId, interaction.options.getString('filme'));
        return interaction.reply({
            content: titulo ? `🗑️ **${titulo}** saiu da sua lista.` : 'Esse filme não está na sua lista.',
            flags: MessageFlags.Ephemeral });
    }
}

// ===== /fantasy =====
async function comandoFantasy(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const t = fantasy.temporada(1); // as escolhas são sempre para o mês que vem

    if (sub === 'filmes') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        let lista = fantasy.pool(t);
        if (!lista.length && hojeBR().getUTCDate() >= 20) lista = await fantasy.gerarPool(t);
        if (!lista.length) return interaction.editReply(`A lista de ${t} ainda não saiu. Ela abre no dia 20 🗓️`);
        const status = fantasy.aberta(t) ? 'aberto até o dia 1' : 'fechado 🔒';
        return interaction.editReply(`🎟️ **Fantasy ${t}** (${status})\n${fantasy.formatarPool(lista)}`.slice(0, 2000));
    }
    if (sub === 'escolher') {
        const msg = fantasy.escolher(userId, t,
            interaction.options.getString('filme'),
            interaction.options.getBoolean('capitao') ?? false);
        return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'remover') {
        return interaction.reply({ content: fantasy.remover(userId, t, interaction.options.getString('filme')), flags: MessageFlags.Ephemeral });
    }
    if (sub === 'time') {
        // depois que fecha, mostra o time do mês em andamento
        const tt = fantasy.pool(t).length ? t : fantasy.temporada();
        const meus = fantasy.time(userId, tt);
        const texto = meus.length
            ? meus.map(f => `${f.capitao ? '⭐' : '🎬'} ${f.titulo}`).join('\n')
            : 'Você ainda não escolheu filmes.';
        return interaction.reply({ content: `**Seu time — ${tt}** (${meus.length}/5)\n${texto}`, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'ranking') {
        await interaction.deferReply();
        const tt = interaction.options.getString('mes') || fantasy.temporada();
        if (!/^\d{4}-\d{2}$/.test(tt)) return interaction.editReply('Use o formato AAAA-MM, ex: 2026-11');
        const { final, tabela } = await fantasy.ranking(tt);
        if (!tabela.length) return interaction.editReply(`Ninguém jogou o Fantasy ${tt}.`);
        return interaction.editReply({
            content: `🏆 **Fantasy ${tt}** ${final ? '(resultado final)' : '(parcial)'}\n${fantasy.formatarRanking(tabela)}`.slice(0, 2000),
            allowedMentions: { parse: [] }
        });
    }
}

client.on(Events.InteractionCreate, async interaction => {
    // Substitua pelo ID do seu canal de texto 'filmes'
    const ID_CANAL_PERMITIDO = '1211485436640235610'; 

    if (interaction.channelId !== ID_CANAL_PERMITIDO) {
        return interaction.reply({ 
            content: "❌ Este bot só pode ser usado no canal específico de filmes.", 
            flags: MessageFlags.Ephemeral });
    }
    try {
        // ================= SISTEMA DE BOTÕES =================
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('filme_escolha_')) {
                const [, , id, tipo] = interaction.customId.split('_');
                const movie = await getMovieDetails(id, tipo);

                const titulo = movie.title || movie.name;
                const data = movie.release_date || movie.first_air_date;
                const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;

                const embed = new EmbedBuilder()
                    .setTitle(`${titulo} (${data ? new Date(data).getFullYear() : 's/ano'})`)
                    .setDescription(movie.overview || "Sem descrição disponível.")
                    .addFields({ name: "Nota TMDB", value: movie.vote_average?.toFixed(1) || "0", inline: true });

                if (posterUrl) embed.setThumbnail(posterUrl);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`avaliar_filme_${id}_${tipo}`).setLabel('Avaliar Filme').setStyle(ButtonStyle.Success)
                );

                await interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId.startsWith('avaliar_filme_')) {
                const [, , id, tipo] = interaction.customId.split('_');
                const modal = new ModalBuilder().setCustomId(`modal_${id}_${tipo}`).setTitle('Avaliação');
                const input = new TextInputBuilder().setCustomId('nota').setLabel('Sua nota (0 a 10)').setStyle(TextInputStyle.Short).setMaxLength(4);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
            }
            return;
        }

        // ================= SISTEMA DE MODAL =================
        if (interaction.isModalSubmit()) {
            const [, id, tipo] = interaction.customId.split('_');
            const notaRaw = interaction.fields.getTextInputValue('nota').replace(',', '.');
            const nota = parseFloat(notaRaw);

            if (isNaN(nota) || nota < 0 || nota > 10) return interaction.reply({ content: "❌ Nota inválida. Usa valores entre 0 e 10.", flags: MessageFlags.Ephemeral });

            db.prepare(`
                INSERT INTO votos_filmes (movie_id, user_id, username, score)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(movie_id, user_id) DO UPDATE SET score = excluded.score
            `).run(id, interaction.user.id, interaction.user.tag, nota);

            const stats = db.prepare(`SELECT AVG(score) as avg, COUNT(*) as total FROM votos_filmes WHERE movie_id = ?`).get(id);
            const movie = await getMovieDetails(id, tipo);

            db.prepare(`
                INSERT INTO avaliacoes_filmes (movie_id, title, server_score, vote_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(movie_id) DO UPDATE SET server_score = excluded.server_score, vote_count = excluded.vote_count
            `).run(id, movie.title || movie.name, stats.avg, stats.total);

            await interaction.reply({ content: `✅ Voto registrado! **${movie.title || movie.name}** agora tem média **${stats.avg.toFixed(1)}** (${stats.total} votos).`, flags: MessageFlags.Ephemeral });
            return;
        }

        // ================= COMANDOS DE SLASH =================
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'assistir') return comandoAssistir(interaction);
            if (commandName === 'fantasy') return comandoFantasy(interaction);

           if (commandName === 'filme') {
    await interaction.deferReply();
    const tituloBusca = interaction.options.getString('titulo');
    
    // 1. Pesquisa no TMDB primeiro para pegar o ID correto
    const results = await searchMovie(tituloBusca);
    if (!results.length) return interaction.editReply("❌ Nenhum resultado encontrado.");

    const primeiroFilme = results[0];
    const movieId = primeiroFilme.id;

    // 2. Verifica se este filme específico já tem votos no Banco de Dados
    const votosLocal = db.prepare(`
        SELECT username, score 
        FROM votos_filmes 
        WHERE movie_id = ?
    `).all(movieId);

    // 3. Se houver votos, exibe quem votou e a nota
    if (votosLocal.length > 0) {
        const media = votosLocal.reduce((acc, curr) => acc + curr.score, 0) / votosLocal.length;
        
        const embedAvaliado = new EmbedBuilder()
            .setTitle(`✅ ${primeiroFilme.title || primeiroFilme.name} (Já Avaliado)`)
            .setColor(0x00FF00)
            .addFields(
                { name: "Média do Servidor", value: `⭐ ${media.toFixed(1)}`, inline: true },
                { name: "Total de Votos", value: `${votosLocal.length}`, inline: true }
            )
            .setDescription(
                "**Quem votou:**\n" + 
                votosLocal.map(v => `• **${v.username}**: ${v.score.toFixed(1)}`).join('\n')
            );

        // Botão opcional para quem ainda quiser atualizar a nota ou ver detalhes
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`filme_escolha_${movieId}_${primeiroFilme.media_type}`)
                .setLabel('Ver Detalhes / Avaliar')
                .setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [embedAvaliado], components: [row] });
    }

    // 4. Se NÃO tiver votos, segue o fluxo normal de mostrar a lista de pesquisa
    const embedLista = new EmbedBuilder()
        .setTitle(`Pesquisa: ${tituloBusca}`)
        .setDescription(results.map((m, i) => `${i + 1}. **${m.title || m.name}** ${m.media_type === "tv" ? "📺" : "🎬"}`).join('\n'));

    const rowLista = new ActionRowBuilder().addComponents(
        results.slice(0, 5).map((m, i) =>
            new ButtonBuilder().setCustomId(`filme_escolha_${m.id}_${m.media_type}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Primary)
        )
    );
    
    await interaction.editReply({ embeds: [embedLista], components: [rowLista] });
}

            if (commandName === 'filmesavaliados') {
                await interaction.deferReply();
                const min = interaction.options.getNumber('min') || 0;
                const max = interaction.options.getNumber('max') || 10;
                const ordem = interaction.options.getString('ordem') === 'votos' ? 'vote_count' : 'server_score';

                const filmes = db.prepare(`
                    SELECT title, server_score, vote_count 
                    FROM avaliacoes_filmes 
                    WHERE server_score BETWEEN ? AND ?
                    ORDER BY ${ordem} DESC
                `).all(min, max);

                if (!filmes.length) return interaction.editReply(`Nenhum filme encontrado no intervalo ⭐ ${min} - ${max}.`);

                const embed = new EmbedBuilder()
                    .setTitle(`🎬 Biblioteca (${min} a ${max})`)
                    .setColor(0xFFD700)
                    .setDescription(filmes.map((f, i) => 
                        `${i + 1}. **${f.title}** — ⭐ \`${f.server_score.toFixed(1)}\` (${f.vote_count} votos)`
                    ).join('\n').slice(0, 4000));

                await interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'stats') {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario');

                if (target) {
                    // Perfil: Oculta filmes com apenas 1 voto (migração)
                    const userVotes = db.prepare(`
                        SELECT v.score, a.title 
                        FROM votos_filmes v
                        JOIN avaliacoes_filmes a ON v.movie_id = a.movie_id
                        WHERE v.user_id = ? AND a.vote_count > 1
                        ORDER BY v.score DESC
                    `).all(target.id);

                    if (!userVotes.length) return interaction.editReply(`**${target.username}** ainda não possui avaliações em filmes da comunidade.`);

                    const media = userVotes.reduce((acc, curr) => acc + curr.score, 0) / userVotes.length;
                    const embed = new EmbedBuilder()
                        .setTitle(`📊 Perfil: ${target.username}`)
                        .setThumbnail(target.displayAvatarURL())
                        .addFields(
                            { name: "🎬 Filmes", value: `${userVotes.length}`, inline: true },
                            { name: "⭐ Média Pessoal", value: `${media.toFixed(1)}`, inline: true }
                        )
                        .setDescription(userVotes.map(f => `⭐ **${f.score.toFixed(1)}** - ${f.title}`).join('\n').slice(0, 3900))
                        .setColor(0x00AE86);
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    // Global
                    const totalVotos = db.prepare(`SELECT COUNT(*) as total FROM votos_filmes`).get();
                    const usuarios = db.prepare(`SELECT COUNT(DISTINCT user_id) as total FROM votos_filmes`).get();
                    const filmesTotais = db.prepare(`SELECT COUNT(*) as total FROM avaliacoes_filmes`).get();

                    const embed = new EmbedBuilder()
                        .setTitle("📊 Estatísticas Globais")
                        .addFields(
                            { name: "Votos Registrados", value: `${totalVotos.total}`, inline: true },
                            { name: "Membros Ativos", value: `${usuarios.total}`, inline: true },
                            { name: "Filmes no Banco", value: `${filmesTotais.total}`, inline: true }
                        )
                        .setColor(0x00AE86);
                    await interaction.editReply({ embeds: [embed] });
                }
            }

            if (commandName === 'recomendar') {
                await interaction.deferReply();
                const sub = interaction.options.getSubcommand();

                if (sub === 'genero') {
                    const genId = interaction.options.getString('genero');
                    const filmes = await getMoviesByGenre(genId);
                    const embed = new EmbedBuilder()
                        .setTitle("🎯 Recomendação por Gênero")
                        .setDescription(filmes.slice(0, 10).map(f => `• ${f.title}`).join('\n'))
                        .setColor(0x00FF00);
                    await interaction.editReply({ embeds: [embed] });
                }

                if (sub === 'filme') {
                    const titulo = interaction.options.getString('titulo');
                    const busca = await searchMovie(titulo);
                    if (!busca.length) return interaction.editReply("❌ Filme base não encontrado.");

                    const recomendacoes = await getMovieRecommendations(busca[0].id);
                    const embed = new EmbedBuilder()
                        .setTitle(`🎯 Porque assististe: ${busca[0].title}`)
                        .setDescription(recomendacoes.slice(0, 10).map(f => `• ${f.title}`).join('\n'))
                        .setColor(0x00FF00);
                    await interaction.editReply({ embeds: [embed] });
                }
            }

         
        }
    } catch (err) {
        console.error("❌ ERRO:", err);
        // não deixa o usuário preso no "pensando..."
        if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
            await interaction.editReply("❌ Deu erro aqui, tenta de novo daqui a pouco.").catch(() => {});
        }
    }
});

// Servidor HTTP mínimo: a hospedagem precisa de uma porta respondendo.
http.createServer((req, res) => {
    const ok = client.isReady();
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok, bot: client.user?.tag ?? null }));
}).listen(Number(process.env.PORT || 3000), () => {
    console.log(`Health check na porta ${process.env.PORT || 3000}`);
});

client.login(config.token);