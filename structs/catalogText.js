// Catalog FText fields must be strings, not maps keyed by language.
function localizeCatalogText(catalog, acceptLanguage = "en") {
    const locale = String(acceptLanguage).split(",")[0].split(";")[0].trim().toLowerCase();
    const baseLanguage = locale.split("-")[0];

    for (const storefront of catalog.storefronts) {
        for (const offer of storefront.catalogEntries) {
            for (const field of ["title", "description", "shortDescription"]) {
                const translations = offer[field];
                if (!translations || typeof translations !== "object" || Array.isArray(translations)) continue;
                const entries = Object.entries(translations);
                const find = language => entries.find(([key, value]) => key.toLowerCase() === language && typeof value === "string")?.[1];
                offer[field] = find(locale) ?? find(baseLanguage) ?? find("en") ?? entries.find(([, value]) => typeof value === "string")?.[1] ?? "";
            }
        }
    }
    return catalog;
}

module.exports = localizeCatalogText;
