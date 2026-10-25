const Users = require('../../../model/user');
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');
const { MessageEmbed } = require("discord.js");
const { subtractCommandHypePoints } = require("../../../structs/rawHype.js");

module.exports = {
    commandInfo: {
        name: "subtracthype",
        description: "Subtracts Hype points from a user",
        options: [
            {
                name: "user",
                description: "The user you want to remove Hype from",
                required: true,
                type: 6
            },
            {
                name: "hype",
                description: "Amount of points to subtract (1-10000)",
                required: true,
                type: 4,
                min_value: 1,
                max_value: 10000
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;

        const user = await Users.findOne({ discordId: selectedUserId }).lean();
        if (!user) {
            return interaction.editReply({ content: "That user does not own an account.", ephemeral: true });
        }

        const hype = interaction.options.getInteger('hype');
        if (!hype || hype < 1 || hype > 10000) {
            return interaction.editReply({ content: "Hype amount must be between 1 and 10000.", ephemeral: true });
        }

        await subtractCommandHypePoints(user, hype);

        const totalPoints = await functions.calculateTotalHypePoints(user);

        const embed = new MessageEmbed()
            .setTitle("Hype Subtracted ⬇️")
            .setDescription(`Subtracted **${hype}** Hype point${hype !== 1 ? 's' : ''} from <@${selectedUserId}>.\n**Updated total:** ${totalPoints}`)
            .setColor("RED")
            .setThumbnail("https://i.imgur.com/LJHibSW.png")
            .setFooter({ text: "Revive Backend", iconURL: require("../../constants").FOOTER_ICON_URL })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};
