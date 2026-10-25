const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Arena = require("../../../model/arena.js");
const { calculateDivision } = require("../../../structs/rawHype.js");

module.exports = {
    commandInfo: {
        name: "leaderboard",
        description: "Shows the Arena Solo Top 10 Hype leaderboard"
    },
    execute: async (interaction) => {
        await interaction.deferReply();

        try {
            const arenaStats = await Arena
                .find({})
                .sort({ hype: -1 })
                .limit(10)
                .lean();

            if (!arenaStats.length) {
                return interaction.editReply({
                    content: "No arena players found.",
                    ephemeral: true
                });
            }

            const leaderboardData = await Promise.all(
                arenaStats.map(async (player) => {
                    const user = await User.findOne({ accountId: player.accountId }).lean();
                    if (!user) return null;

                    const division = calculateDivision(player.hype);

                    return {
                        username: user.username,
                        hype: player.hype,
                        division
                    };
                })
            );

            const embed = new MessageEmbed()
                .setTitle("🏆 ARENA HYPE LEADERBOARD")
                .setColor("PURPLE")
                .setThumbnail("https://i.imgur.com/ZzfatV2.png")
                .setFooter({
                    text: "Revive Backend",
                    iconURL: require("../../constants").FOOTER_ICON_URL
                })
                .setTimestamp();

            let description = "";

            leaderboardData
                .filter(Boolean)
                .slice(0, 10)
                .forEach((player, index) => {
                    const position = index + 1;
                    const medal =
                        position === 1 ? "🥇" :
                        position === 2 ? "🥈" :
                        position === 3 ? "🥉" :
                        `#${position}`;

                    description += `${medal} **${player.username}** — ${player.hype.toLocaleString()} Hype (Div ${player.division})\n`;
                });

            embed.setDescription(description || "No valid players to display.");

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Leaderboard command error:", error);
            await interaction.editReply({
                content: "An error occurred while fetching the leaderboard.",
                ephemeral: true
            });
        }
    }
};
