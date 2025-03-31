const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, REST, Routes, EmbedBuilder } = require('discord.js');
const { token, clientId } = require('./config.js');
const activeCollectors = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

async function registerCommands() {
    try {
        var rest = new REST({ version: '10' }).setToken(token);
        await rest.put(Routes.applicationCommands(clientId), {
            body: [{
                name: 'honeypot',
                description: 'Create a honeypot channel',
                default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
            }]
        });
        console.log('Commands registered');
    } catch (error) {
        console.log('Command registration error:', error.message);
    }
}

function setupChannelCollector(channel) {
    if (activeCollectors.has(channel.id)) {
        activeCollectors.get(channel.id).stop();
    }

    var collector = channel.createMessageCollector({
        filter: msg => !msg.author.bot && msg.author.id !== client.user.id
    });

    collector.on('collect', async msg => {
        try {
            if (msg.deletable) {
                await msg.delete();
            }

            if (msg.member?.bannable) {
                await msg.member.ban({
                    reason: 'Honeypot activating',
                    deleteMessageSeconds: 86400
                });
                console.log(`Banned ${msg.author.tag}`);
            }
        } catch (error) {
            console.log('Error processing message:', error.message);
        }
    });

    collector.on('end', () => {
        activeCollectors.delete(channel.id);
    });

    activeCollectors.set(channel.id, collector);
    console.log(`Honeypot activated in #${channel.name}`);
}

async function restoreHoneypotChannels() {
    try {
        console.log('Restoring honeypot channels...');

        for (var guild of client.guilds.cache.values()) {
            try {
                for (var channel of guild.channels.cache.values()) {
                    if (channel.type === ChannelType.GuildText && channel.name === 'honeypot') {
                        setupChannelCollector(channel);
                    }
                }
            } catch (guildError) {
                console.log(`Guild ${guild.name} error:`, guildError.message);
            }
        }
    } catch (error) {
        console.log('Restoration error:', error.message);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
    await restoreHoneypotChannels();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'honeypot') return;

    try {
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You need administrator permissions', ephemeral: true });
        }

        var channel = await interaction.guild.channels.create({
            name: 'honeypot',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: client.user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                }
            ]
        });

        setupChannelCollector(channel);

        // Отправка embed с предупреждением
        await channel.send({
            files: ['warn.png'], // Убедитесь, что файл warn.png доступен
            embeds: [
                new EmbedBuilder()
                    .setColor(0xff0000)
                    .setDescription(
                        "⚠️ **ВНИМАНИЕ!** ⚠️  **Не пишите сюда!** ⚠️\nЭтот канал создан, чтобы отлавливать спам-ботов, которые могут украсть ваши данные."
                    )
                    .setImage("attachment://warn.png")
                    .setFooter({ text: "Будьте внимательны и осторожны!" }),
            ]
        });

        await interaction.reply({ content: `Created honeypot channel: ${channel}`, ephemeral: true });
    } catch (error) {
        console.log('Command error:', error.message);
        await interaction.reply({ content: 'An error occurred', ephemeral: true });
    }
});

client.on('error', error => {
    console.log('Client error:', error.message);
});

process.on('unhandledRejection', error => {
    console.log('Unhandled rejection:', error.message);
});

client.login(token).catch(error => {
    console.log('Login error:', error.message);
});