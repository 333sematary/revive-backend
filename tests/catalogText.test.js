const assert = require("node:assert/strict");
const test = require("node:test");
const localizeCatalogText = require("../structs/catalogText.js");

test("the shipped catalog contains only string FText fields after localization", () => {
    const catalog = JSON.parse(JSON.stringify(require("../responses/catalog.json")));
    assert.equal(typeof catalog.storefronts[5].catalogEntries[0].title, "object");
    localizeCatalogText(catalog, "pt-BR,pt;q=0.9,en;q=0.8");
    assert.equal(catalog.storefronts[5].catalogEntries[0].title, "Upgrade Llama");
    for (const storefront of catalog.storefronts) {
        for (const offer of storefront.catalogEntries) {
            for (const field of ["title", "description", "shortDescription"]) {
                if (offer[field] !== undefined) assert.equal(typeof offer[field], "string", `${storefront.name}.${field}`);
            }
        }
    }
});

test("localized text keeps regional translations, fallback languages and existing strings", () => {
    const offer = { title: { "pt-BR": "Loja", en: "Shop" }, description: { pt: "Itens", en: "Items" }, shortDescription: "Original", offerId: "unchanged" };
    const catalog = { storefronts: [{ catalogEntries: [offer] }] };
    localizeCatalogText(catalog, "pt-BR,pt;q=0.9");
    assert.deepEqual(offer, { title: "Loja", description: "Itens", shortDescription: "Original", offerId: "unchanged" });
});
