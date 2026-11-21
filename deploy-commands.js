import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config.js';

const commands = [
    // /filme
    new SlashCommandBuilder()
        .setName('filme')
        .setDescription('Procura um filme e abre uma enquete de avaliação.')
        .addStringOption(option => 
            option.setName('titulo')
                .setDescription('Título do filme')
                .setRequired(true)
        ),

    // /filmesavaliados (Com filtros de nota)
    new SlashCommandBuilder()
        .setName('filmesavaliados')
        .setDescription('Mostra a lista dos filmes avaliados.')
        .addNumberOption(option =>
            option.setName('min')
                .setDescription('Nota mínima (ex: 7)')
                .setRequired(false))
        .addNumberOption(option =>
            option.setName('max')
                .setDescription('Nota máxima (ex: 10)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('ordem')
                .setDescription('Como ordenar a lista')
                .setRequired(false)
                .addChoices(
                    { name: 'Melhor nota', value: 'nota' },
                    { name: 'Mais votados', value: 'votos' }
                )
        ),

    // /stats
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Mostra estatísticas do servidor ou de um usuário.')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuário para ver estatísticas individuais')
                .setRequired(false)
        ),

    // /recomendar
    new SlashCommandBuilder()
        .setName('recomendar')
        .setDescription('Recomendações de filmes')
        .addSubcommand(sub =>
            sub.setName('genero')
                .setDescription('Recomendar por gênero')
                .addStringOption(opt =>
                    opt.setName('genero')
                        .setDescription('Escolha o gênero')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ação', value: '28' },
                            { name: 'Comédia', value: '35' },
                            { name: 'Terror', value: '27' },
                            { name: 'Ficção Científica', value: '878' },
                            { name: 'Drama', value: '18' },
                            { name: 'Romance', value: '10749' },
                            { name: 'Animação', value: '16' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('filme')
                .setDescription('Baseado num filme que gostaste')
                .addStringOption(opt => opt.setName('titulo').setDescription('Nome do filme base').setRequired(true))
        ),

    // /removefilme
  // /removefilme
new SlashCommandBuilder()
    .setName('removefilme')
    .setDescription('Remove um filme ou os votos de um usuário específico.')
    .addStringOption(option => 
        option.setName('titulo')
            .setDescription('Título do filme')
            .setRequired(true)
    )
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Usuário cujos votos serão removidos (opcional)')
            .setRequired(false)
    ),

    // /assistir (watchlist de filmes)
    new SlashCommandBuilder()
        .setName('assistir')
        .setDescription('Sua lista de filmes "quero ver" (aviso quando chega em streaming)')
        .addSubcommand(s => s.setName('adicionar').setDescription('Adiciona um filme à sua lista')
            .addStringOption(o => o.setName('filme').setDescription('Nome do filme').setRequired(true)))
        .addSubcommand(s => s.setName('lista').setDescription('Mostra sua lista'))
        .addSubcommand(s => s.setName('remover').setDescription('Tira um filme da sua lista')
            .addStringOption(o => o.setName('filme').setDescription('Nome do filme').setRequired(true))),

    // /fantasy (estreias do mês)
    new SlashCommandBuilder()
        .setName('fantasy')
        .setDescription('Fantasy de estreias do mês')
        .addSubcommand(s => s.setName('filmes').setDescription('Lista os filmes do próximo mês'))
        .addSubcommand(s => s.setName('escolher').setDescription('Coloca um filme no seu time (máx. 5)')
            .addStringOption(o => o.setName('filme').setDescription('Número ou nome do filme').setRequired(true))
            .addBooleanOption(o => o.setName('capitao').setDescription('Capitão vale 2x').setRequired(false)))
        .addSubcommand(s => s.setName('remover').setDescription('Tira um filme do seu time')
            .addStringOption(o => o.setName('filme').setDescription('Nome do filme').setRequired(true)))
        .addSubcommand(s => s.setName('time').setDescription('Mostra seu time'))
        .addSubcommand(s => s.setName('ranking').setDescription('Ranking do fantasy')
            .addStringOption(o => o.setName('mes').setDescription('Mês no formato AAAA-MM (padrão: mês atual)').setRequired(false))),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('⏳ Atualizando comandos de slash...');
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );
        console.log('✅ Comandos atualizados!');
    } catch (error) {
        console.error(error);
    }
})();