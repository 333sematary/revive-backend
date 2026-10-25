const mongoose = require("mongoose");
const config = require("./Config/config.json");

async function fix() {
    await mongoose.connect(config.mongodb.database);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const col = db.collection("users");

    // List current indexes
    const indexes = await col.indexes();
    console.log("Current indexes:", JSON.stringify(indexes, null, 2));

    // Find and drop the discordId index if it's not sparse
    for (const idx of indexes) {
        if (idx.key && idx.key.discordId !== undefined) {
            console.log("Found discordId index:", idx.name, "sparse:", idx.sparse);
            if (!idx.sparse) {
                console.log("Dropping non-sparse discordId index...");
                await col.dropIndex(idx.name);
                console.log("Dropped. Recreating as sparse...");
                await col.createIndex({ discordId: 1 }, { unique: true, sparse: true });
                console.log("Done! discordId index is now sparse.");
            } else {
                console.log("Index is already sparse. OK.");
            }
        }
    }

    // Also check for any stuck null discordId duplicates
    const nullCount = await col.countDocuments({ discordId: null });
    console.log(`Documents with discordId null: ${nullCount}`);
    if (nullCount > 0) {
        console.log("Unsetting discordId null fields to avoid conflicts...");
        await col.updateMany({ discordId: null }, { $unset: { discordId: "" } });
        console.log("Done.");
    }

    await mongoose.disconnect();
    console.log("All fixed! Restart the backend now.");
}

fix().catch(e => { console.error(e); process.exit(1); });
