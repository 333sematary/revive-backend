const express = require("express");
const app = express.Router();
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const log = require("../structs/log.js");
const bcrypt = require("bcrypt");
const functions = require("../structs/functions.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

// ── Login ──────────────────────────────────────────────────────────────────
app.get("/api/launcher/login", async (req, res) => {
    const { email, password } = req.query;
    if (!email || !password) return res.status(400).send("Missing email or password.");

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).send("User not found.");

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).send("Invalid password.");

        let avatarHash = null;
        try {
            if (user.discordId) {
                const discordUser = await req.client.users.fetch(user.discordId);
                avatarHash = discordUser.avatar;
            }
        } catch (discordErr) {
            log.error("Discord Fetch Error:", discordErr.message);
        }

        let vbucks = 0;
        try {
            const profile = await Profile.findOne({ accountId: user.accountId }).lean();
            if (profile && profile.profiles) {
                const commonCore = profile.profiles.common_core;
                if (commonCore && commonCore.items) {
                    const mtx = commonCore.items["Currency:MtxPurchased"];
                    if (mtx && mtx.quantity !== undefined) vbucks = mtx.quantity;
                }
            }
        } catch (profileErr) {
            log.error("Profile Fetch Error:", profileErr.message);
        }

        console.log(`[LAUNCHER LOGIN] user=${user.username} vbucks=${vbucks}`);

        return res.status(200).json({
            username: user.username,
            discordId: user.discordId,
            avatarHash,
            vbucks
        });
    } catch (err) {
        log.error("Launcher Login Error:", err);
        return res.status(500).send("Internal Server Error");
    }
});

// ── Register ───────────────────────────────────────────────────────────────
app.post("/api/launcher/register", async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !username || !password)
        return res.status(400).json({ error: "Missing fields." });

    // Check duplicates manually before calling registerUser
    // (avoids sparse index issues with null discordId)
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    const existingEmail = await User.findOne({ email: emailLower });
    if (existingEmail) return res.status(400).json({ error: "Email is already in use." });

    const existingUsername = await User.findOne({ username_lower: usernameLower });
    if (existingUsername) return res.status(400).json({ error: "Username is already taken." });

    // Basic validation
    const emailFilter = /^([a-zA-Z0-9_.\-])+@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
    if (!emailFilter.test(emailLower))  return res.status(400).json({ error: "Invalid email address." });
    if (username.length < 3)            return res.status(400).json({ error: "Username must be at least 3 characters." });
    if (username.length >= 25)          return res.status(400).json({ error: "Username must be less than 25 characters." });
    if (password.length < 4)            return res.status(400).json({ error: "Password must be at least 4 characters." });
    if (password.length >= 128)         return res.status(400).json({ error: "Password must be less than 128 characters." });

    const allowedChars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'.split("");
    for (const ch of username) {
        if (!allowedChars.includes(ch)) return res.status(400).json({ error: "Username contains invalid characters." });
    }

    try {
        const bcrypt        = require("bcrypt");
        const uuid          = require("uuid");
        const profileManager = require("../structs/profile.js");
        const Friends       = require("../model/friends.js");

        const accountId     = uuid.v4().replace(/-/g, "");
        const matchmakingId = uuid.v4().replace(/-/g, "");
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            created:       new Date().toISOString(),
            discordId:     undefined,   // omit entirely — avoids sparse index conflict
            accountId,
            username,
            username_lower: usernameLower,
            email:         emailLower,
            password:      hashedPassword,
            matchmakingId,
        });

        await Profile.create({
            created:   newUser.created,
            accountId: newUser.accountId,
            profiles:  profileManager.createProfiles(newUser.accountId),
        });

        await Friends.create({ created: newUser.created, accountId: newUser.accountId });
        profileManager.createUserStatsProfiles(newUser.accountId);

        console.log(`[REGISTER] New account: ${username} (${emailLower})`);
        return res.status(200).json({ message: `Account created successfully. Welcome, ${username}!` });

    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || "field";
            console.log(`[REGISTER ERROR 11000] keyPattern:`, err.keyPattern, `keyValue:`, err.keyValue);
            return res.status(400).json({ error: `${field === "email" ? "Email" : field === "username_lower" ? "Username" : "A field"} is already in use.` });
        }
        log.error("Register Error:", err);
        return res.status(500).json({ error: "Internal server error. Please try again." });
    }
});

// ── Status ─────────────────────────────────────────────────────────────────
app.get("/api/launcher/status", (req, res) => {
    return res.status(200).json({ status: "online" });
});

// ── Is Admin ───────────────────────────────────────────────────────────────
app.get("/api/launcher/isadmin", async (req, res) => {
    const { discordId } = req.query;
    if (!discordId) return res.status(200).json({ isAdmin: false });

    try {
        const adminRoleIds = config.launcher && config.launcher.adminRoleIds;
        const guildId      = config.launcher && config.launcher.guildId;

        if (Array.isArray(adminRoleIds) && adminRoleIds.length > 0 && guildId && req.client) {
            const guild  = await req.client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                const member = await guild.members.fetch(discordId).catch(() => null);
                if (member) {
                    const hasRole = adminRoleIds.some(roleId => member.roles.cache.has(roleId));
                    return res.status(200).json({ isAdmin: hasRole });
                }
            }
        }

        // Fallback: moderators list
        const isMod = Array.isArray(config.moderators) && config.moderators.includes(discordId);
        return res.status(200).json({ isAdmin: isMod });
    } catch (err) {
        log.error("IsAdmin Error:", err.message);
        return res.status(200).json({ isAdmin: false });
    }
});

// ── Admin: List Users ──────────────────────────────────────────────────────
app.get("/api/launcher/admin/users", async (req, res) => {
    const { discordId } = req.query;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const users = await User.find({}, { username: 1, email: 1, banned: 1, discordId: 1, accountId: 1 }).lean();
    return res.status(200).json(users);
});

// ── Admin: Ban ─────────────────────────────────────────────────────────────
app.post("/api/launcher/admin/ban", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });
    if (target.banned) return res.status(400).json({ error: "Already banned." });

    await target.updateOne({ $set: { banned: true } });
    _kickTokens(target.accountId);
    return res.status(200).json({ message: `Banned ${target.username}.` });
});

// ── Admin: Unban ───────────────────────────────────────────────────────────
app.post("/api/launcher/admin/unban", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });
    if (!target.banned) return res.status(400).json({ error: "Not banned." });

    await target.updateOne({ $set: { banned: false } });
    return res.status(200).json({ message: `Unbanned ${target.username}.` });
});

// ── Admin: Kick ────────────────────────────────────────────────────────────
app.post("/api/launcher/admin/kick", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    const kicked = _kickTokens(target.accountId);
    if (!kicked) return res.status(400).json({ error: `No active session for ${target.username}.` });
    return res.status(200).json({ message: `Kicked ${target.username}.` });
});

// ── Admin: Add V-Bucks ─────────────────────────────────────────────────────
app.post("/api/launcher/admin/addvbucks", async (req, res) => {
    const { discordId, username, amount } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    const qty = parseInt(amount);
    if (isNaN(qty) || qty === 0) return res.status(400).json({ error: "Invalid amount." });

    await Profile.updateOne({ accountId: target.accountId }, {
        $inc: {
            "profiles.common_core.items.Currency:MtxPurchased.quantity": qty,
            "profiles.profile0.items.Currency:MtxPurchased.quantity": qty
        }
    });
    return res.status(200).json({ message: `Added ${qty} V-Bucks to ${target.username}.` });
});

// ── Admin: Remove V-Bucks ──────────────────────────────────────────────────
app.post("/api/launcher/admin/removevbucks", async (req, res) => {
    const { discordId, username, amount } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    const qty = parseInt(amount);
    if (isNaN(qty) || qty === 0) return res.status(400).json({ error: "Invalid amount." });

    await Profile.updateOne({ accountId: target.accountId }, {
        $inc: {
            "profiles.common_core.items.Currency:MtxPurchased.quantity": -qty,
            "profiles.profile0.items.Currency:MtxPurchased.quantity": -qty
        }
    });
    return res.status(200).json({ message: `Removed ${qty} V-Bucks from ${target.username}.` });
});

// ── Admin: Add All Cosmetics ───────────────────────────────────────────────
app.post("/api/launcher/admin/addall", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    try {
        const fs   = require("fs");
        const path = require("path");
        const destr = require("destr");
        const allItems = destr(fs.readFileSync(path.join(__dirname, "../Config/DefaultProfiles/allathena.json"), "utf8"));
        if (!allItems) return res.status(500).json({ error: "Could not load allathena.json." });

        await Profile.findOneAndUpdate(
            { accountId: target.accountId },
            { $set: { "profiles.athena.items": allItems.items } },
            { new: true }
        );

        functions.sendXmppMessageToId({ type: "com.epicgames.gift.received", payload: {}, timestamp: new Date().toISOString() }, target.accountId);
        return res.status(200).json({ message: `All cosmetics added to ${target.username}.` });
    } catch (err) {
        log.error("AddAll Error:", err);
        return res.status(500).json({ error: "Internal error." });
    }
});

// ── Admin: Remove All Cosmetics ────────────────────────────────────────────
app.post("/api/launcher/admin/removeall", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    try {
        const fs   = require("fs");
        const path = require("path");
        const destr = require("destr");
        const defaultItems = destr(fs.readFileSync(path.join(__dirname, "../Config/DefaultProfiles/athena.json"), "utf8"));
        if (!defaultItems) return res.status(500).json({ error: "Could not load athena.json." });

        await Profile.findOneAndUpdate(
            { accountId: target.accountId },
            { $set: { "profiles.athena.items": defaultItems.items } },
            { new: true }
        );
        return res.status(200).json({ message: `All cosmetics removed from ${target.username}.` });
    } catch (err) {
        log.error("RemoveAll Error:", err);
        return res.status(500).json({ error: "Internal error." });
    }
});

// ── Admin: Add Item (cosmetic by name) ─────────────────────────────────────
app.post("/api/launcher/admin/additem", async (req, res) => {
    const { discordId, username, cosmeticName } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });
    if (!cosmeticName) return res.status(400).json({ error: "Missing cosmeticName." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    try {
        const axios  = require("axios");
        const fs     = require("fs");
        const path   = require("path");
        const destr  = require("destr");
        const uuid   = require("uuid");

        const apiRes = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(cosmeticName)}`);
        const cosmetic = apiRes.data?.data;
        if (!cosmetic) return res.status(404).json({ error: "Cosmetic not found." });

        const allItems = destr(fs.readFileSync(path.join(__dirname, "../Config/DefaultProfiles/allathena.json"), "utf8"));
        const items    = allItems.items;
        let foundKey   = "";

        for (const key of Object.keys(items)) {
            if (key.split(":")[1] === cosmetic.id) { foundKey = key; break; }
        }
        if (!foundKey) return res.status(404).json({ error: `Cosmetic '${cosmeticName}' not in allathena.` });

        const profile = await Profile.findOne({ accountId: target.accountId }).lean();
        if (profile?.profiles?.athena?.items?.[foundKey]) return res.status(400).json({ error: "User already has that cosmetic." });

        const purchaseId = uuid.v4();
        await Profile.updateOne({ accountId: target.accountId }, {
            $set: {
                [`profiles.athena.items.${foundKey}`]: items[foundKey],
                [`profiles.common_core.items.${purchaseId}`]: {
                    templateId: "GiftBox:GB_MakeGood",
                    attributes: { fromAccountId: "[Administrator]", lootList: [{ itemType: items[foundKey].templateId, itemGuid: items[foundKey].templateId, quantity: 1 }], params: { userMessage: "Thanks For Using Revive Backend!" }, giftedOn: new Date().toISOString() },
                    quantity: 1
                }
            }
        });

        functions.sendXmppMessageToId({ type: "com.epicgames.gift.received", payload: {}, timestamp: new Date().toISOString() }, target.accountId);
        return res.status(200).json({ message: `Added '${cosmeticName}' to ${target.username}.`, image: cosmetic.images?.icon });
    } catch (err) {
        log.error("AddItem Error:", err);
        return res.status(500).json({ error: "Internal error." });
    }
});

// ── Admin: Remove Item (cosmetic by name) ──────────────────────────────────
app.post("/api/launcher/admin/removeitem", async (req, res) => {
    const { discordId, username, cosmeticName } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });
    if (!cosmeticName) return res.status(400).json({ error: "Missing cosmeticName." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    try {
        const axios  = require("axios");
        const fs     = require("fs");
        const path   = require("path");
        const destr  = require("destr");

        const apiRes = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(cosmeticName)}`);
        const cosmetic = apiRes.data?.data;
        if (!cosmetic) return res.status(404).json({ error: "Cosmetic not found." });

        const allItems = destr(fs.readFileSync(path.join(__dirname, "../Config/DefaultProfiles/allathena.json"), "utf8"));
        let foundKey = "";
        for (const key of Object.keys(allItems.items)) {
            if (key.split(":")[1] === cosmetic.id) { foundKey = key; break; }
        }
        if (!foundKey) return res.status(404).json({ error: "Cosmetic not found in database." });

        const unset = {};
        unset[`profiles.athena.items.${foundKey}`] = "";
        await Profile.updateOne({ accountId: target.accountId }, { $unset: unset });
        return res.status(200).json({ message: `Removed '${cosmeticName}' from ${target.username}.` });
    } catch (err) {
        log.error("RemoveItem Error:", err);
        return res.status(500).json({ error: "Internal error." });
    }
});

// ── Admin: Add Hype ────────────────────────────────────────────────────────
app.post("/api/launcher/admin/addhype", async (req, res) => {
    const { discordId, username, amount } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() }).lean();
    if (!target) return res.status(404).json({ error: "User not found." });

    const pts = parseInt(amount);
    if (isNaN(pts) || pts < 1) return res.status(400).json({ error: "Invalid amount." });

    const { addCommandHypePoints } = require("../structs/rawHype.js");
    const total = await addCommandHypePoints(target, pts);
    return res.status(200).json({ message: `Added ${pts} hype to ${target.username}. Total: ${total}` });
});

// ── Admin: Remove Hype ─────────────────────────────────────────────────────
app.post("/api/launcher/admin/removehype", async (req, res) => {
    const { discordId, username, amount } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() }).lean();
    if (!target) return res.status(404).json({ error: "User not found." });

    const pts = parseInt(amount);
    if (isNaN(pts) || pts < 1) return res.status(400).json({ error: "Invalid amount." });

    const { subtractCommandHypePoints } = require("../structs/rawHype.js");
    const total = await subtractCommandHypePoints(target, pts);
    return res.status(200).json({ message: `Removed ${pts} hype from ${target.username}. Total: ${total}` });
});

// ── Admin: Delete Account ──────────────────────────────────────────────────
app.post("/api/launcher/admin/deleteaccount", async (req, res) => {
    const { discordId, username } = req.body;
    if (!_isAdmin(discordId)) return res.status(403).json({ error: "No permission." });

    const target = await User.findOne({ username_lower: username?.toLowerCase() });
    if (!target) return res.status(404).json({ error: "User not found." });

    try {
        const fs      = require("fs");
        const path    = require("path");
        const Friends = require("../model/friends.js");

        await User.deleteOne({ username_lower: username.toLowerCase() });
        await Profile.deleteOne({ accountId: target.accountId });
        await Friends.deleteOne({ accountId: target.accountId });

        const clientPath = path.join(__dirname, "../ClientSettings", target.accountId);
        if (fs.existsSync(clientPath)) fs.rmSync(clientPath, { recursive: true, force: true });

        _kickTokens(target.accountId);
        return res.status(200).json({ message: `Account '${target.username}' deleted.` });
    } catch (err) {
        log.error("DeleteAccount Error:", err);
        return res.status(500).json({ error: "Internal error." });
    }
});


function _isAdmin(discordId) {
    if (!discordId) return false;
    return Array.isArray(config.moderators) && config.moderators.includes(discordId);
}

function _kickTokens(accountId) {
    let kicked = false;
    const ri = global.refreshTokens ? global.refreshTokens.findIndex(i => i.accountId === accountId) : -1;
    if (ri !== -1) { global.refreshTokens.splice(ri, 1); kicked = true; }

    const ai = global.accessTokens ? global.accessTokens.findIndex(i => i.accountId === accountId) : -1;
    if (ai !== -1) {
        global.accessTokens.splice(ai, 1);
        const xmpp = global.Clients ? global.Clients.find(c => c.accountId === accountId) : null;
        if (xmpp) xmpp.client.close();
        kicked = true;
    }
    if (kicked) functions.UpdateTokens();
    return kicked;
}

module.exports = app;
