const { MessageEmbed } = require("discord.js");
const path = require("path");
const fs = require("fs");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const log = require("../../../structs/log.js");
const destr = require("destr");
const config = require('../../../Config/config.json');
const functions = require('../../../structs/functions.js');

module.exports = {
    commandInfo: {
        name: "addall",
        description: "Allows you to give a user all cosmetics. Note: This will reset all your lockers to default",
        options: [
            {
                name: "user",
                description: "The user you want to give the cosmetic to",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.reply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const selectedUser = interaction.options.getUser('user');
        const selectedUserId = selectedUser?.id;
        try {
            const targetUser = await Users.findOne({ discordId: selectedUserId });
            if (!targetUser) {
                return interaction.editReply({ content: "That user does not own an account" });
            }

            const profile = await Profiles.findOne({ accountId: targetUser.accountId });
            if (!profile) {
                return interaction.editReply({ content: "That user does not have a profile" });
            }

            const allItems = destr(fs.readFileSync(path.join(__dirname, "../../../Config/DefaultProfiles/allathena.json"), 'utf8'));
            if (!allItems) {
                return interaction.editReply({ content: "Failed to parse allathena.json" });
            }

            // Build GiftBox notification item for common_core
            const giftBoxId = functions.MakeID();
            const giftBox = {
                templateId: "GiftBox:gb_battlepasspurchased",
                attributes: {
                    max_level_bonus: 0,
                    fromAccountId: "Server",
                    lootList: [
                        {
                            itemType: "AthenaCharacter:CID_028_Athena_Commando_F",
                            itemGuid: "AthenaCharacter:CID_028_Athena_Commando_F",
                            quantity: 1
                        }
                    ],
                    params: {
                        userMessage: "🎉 Parabéns! Recebeste o Full Locker do Revive Backend! Todos os cosméticos foram adicionados ao teu vestiário!"
                    },
                    giftedOn: new Date().toISOString()
                },
                quantity: 1
            };

            // Update athena items AND add giftbox to common_core
            const updatedProfile = await Profiles.findOneAndUpdate(
                { accountId: targetUser.accountId },
                {
                    $set: {
                        "profiles.athena.items": allItems.items,
                        [`profiles.common_core.items.${giftBoxId}`]: giftBox
                    }
                },
                { new: true }
            );

            if (!updatedProfile) {
                return interaction.editReply({ content: "There was an error updating the profile." });
            }

            // Set gift received flag so the game shows the popup on next QueryProfile
            global.giftReceived = global.giftReceived || {};
            global.giftReceived[targetUser.accountId] = true;

            // Send in-game XMPP notification if player is online
            functions.sendXmppMessageToId({
                type: "com.epicgames.gift.received",
                payload: {},
                timestamp: new Date().toISOString()
            }, targetUser.accountId);

            const embed = new MessageEmbed()
                .setTitle("🎉 Full Locker Adicionado")
                .setDescription(`Todos os cosméticos foram adicionados à conta de **${targetUser.username}**!\nUma mensagem de parabéns foi enviada ao jogador no jogo.`)
                .setColor("GREEN")
                .setFooter({
                    text: "Revive Backend",
                    iconURL: require("../../constants").FOOTER_ICON_URL
                })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            log.error("An error occurred:", error);
            interaction.editReply({ content: "An error occurred while processing the request." });
        }
    }
};