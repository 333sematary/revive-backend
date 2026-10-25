const Arena = require("../model/arena.js");

const HYPE_THRESHOLDS = [400, 800, 1200, 2000, 3000, 5000, 7500, 10000, 15000, 99999999999999999999999999999999999999999999];

function calculateDivision(hype) {
    for (let i = 0; i < HYPE_THRESHOLDS.length; i++) {
        if (hype < HYPE_THRESHOLDS[i]) {
            return i + 1; 
        }
    }
    return HYPE_THRESHOLDS.length;
}

async function addCommandHypePoints(user, points = 1) {
    const accountId = user.account_id || user.accountId;

    const result = await Arena.findOneAndUpdate(
        { accountId },
        { $inc: { hype: points } },
        { upsert: true, new: true }
    );

    const division = calculateDivision(result.hype);
    await Arena.updateOne(
        { accountId },
        { $set: { division } }
    );

    return result.hype;
}

async function subtractCommandHypePoints(user, points = 1) {
    const accountId = user.account_id || user.accountId;

    const arena = await Arena.findOne({ accountId });
    if (!arena) return 0;

    const newHype = Math.max(0, arena.hype - points);
    const division = calculateDivision(newHype);

    await Arena.updateOne(
        { accountId },
        { $set: { hype: newHype, division } }
    );

    return newHype;
}

module.exports = {
    addCommandHypePoints,
    subtractCommandHypePoints,
    calculateDivision
};