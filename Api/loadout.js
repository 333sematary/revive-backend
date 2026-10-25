const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../model/user.js");
const Profile = require("../model/profiles.js");
const router = express.Router();

router.post("/api/launcher/loadout", async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return res.status(400).json({ error: "Missing email or password." });
    }

    try {
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials." });
        }
        if (user.banned) return res.status(403).json({ error: "Account banned." });

        const profile = await Profile.findOne({ accountId: user.accountId }).lean();
        const athena = profile?.profiles?.athena;
        if (!athena) return res.status(404).json({ error: "Player profile not found." });

        const items = athena.items || {};
        const attributes = athena.stats?.attributes || {};
        const activeId = attributes.loadouts?.[attributes.active_loadout_index ?? 0];
        const locker = items[activeId] || items[attributes.last_applied_loadout] || items.sandbox_loadout;
        const slots = locker?.attributes?.locker_slots_data?.slots || {};
        const loadout = {};

        for (const slot of ["Character", "Pickaxe", "Backpack"]) {
            // Preserve empty slots; older profiles may only have favorite_* references.
            const equipped = slots[slot]?.items?.[0] ?? attributes[`favorite_${slot.toLowerCase()}`] ?? "";
            const template = items[equipped]?.templateId ?? equipped;
            loadout[slot] = typeof template === "string" ? template.slice(template.indexOf(":") + 1) : "";
        }

        return res.json(loadout);
    } catch (error) {
        console.error("Launcher loadout lookup failed:", error.message);
        return res.status(500).json({ error: "Unable to load equipped cosmetics." });
    }
});

module.exports = router;
