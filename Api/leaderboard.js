const express = require("express");
const router = express.Router();
const User = require("../model/user.js");
const Arena = require("../model/arena.js");
const { calculateDivision } = require("../structs/rawHype.js");
const log = require("../structs/log.js");

router.get("/api/launcher/leaderboard", async (req, res) => {
    try {
        const leaderboard = await Arena.find()
        .sort({ hype: -1 })
        .limit(10)
        .lean();

        const arenaStats = await Arena
            .find({})
            .sort({ hype: -1 })
            .limit(10)
            .lean();

        if (!arenaStats.length) {
            return res.json([]);
        }

        const leaderboardData = await Promise.all(
            arenaStats.map(async (player) => {
                const user = await User.findOne({ accountId: player.accountId }).lean();
                if (!user) return null;

                let avatarHash = null;
                try {
                    if (user.discordId && req.client) {
                        const discordUser = await req.client.users.fetch(user.discordId);
                        avatarHash = discordUser.avatar;
                    }
                } catch (err) {
                }

                return {
                    username: user.username,
                    hype: player.hype,
                    division: calculateDivision(player.hype),
                    discordId: user.discordId || null,
                    avatarHash: avatarHash || null
                };
            })
        );

        res.json(leaderboardData.filter(Boolean));

    } catch (err) {
        log.error("Launcher Leaderboard Error: " + err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;