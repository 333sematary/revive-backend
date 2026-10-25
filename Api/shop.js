const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const log = require("../structs/log.js");

router.get("/api/launcher/shop", (req, res) => {
    try {        
        const configPath = path.join(__dirname, "../config/catalog_config.json");
        if (!fs.existsSync(configPath)) return res.status(404).json({ error: "Not found" });

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        const response = {
            featured: [],
            daily: []
        };

        Object.keys(config).forEach(key => {
            if (key === "//") return;
            const entry = config[key];
            
            if (entry.itemGrants && entry.itemGrants[0] !== "") {
                const itemData = { 
                    id: key, 
                    ...entry,

                    isBundle: !!entry.bundleName || entry.itemGrants.length > 1 
                };
                
                if (key.startsWith("featured")) response.featured.push(itemData);
                else if (key.startsWith("daily")) response.daily.push(itemData);
            }
        });

        res.json(response);
    } catch (err) {
        log.error("Shop API Error: " + err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;