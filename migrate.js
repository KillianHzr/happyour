const fs = require('fs');

// 1. On charge ton ancien fichier
const input = require('./design-tokens.json');
const output = { Primitives: {}, Semantics: {} };

// Helper : Convertit les types W3C en types Figma
const mapType = (type) => {
    if (type === 'color') return 'COLOR';
    if (type === 'dimension' || type === 'fontSize') return 'FLOAT';
    if (type === 'fontFamily') return 'STRING';
    return 'STRING'; // Fallback
};

// Helper : Convertit les alias (ex: {primitive.color.black} -> {Primitives/color/black})
const fixAlias = (val) => {
    if (typeof val === 'string' && val.startsWith('{')) {
        let ref = val.replace(/[{}]/g, ''); // Enlève les accolades
        if (ref.startsWith('primitive.')) ref = ref.replace('primitive.', 'Primitives/');
        if (ref.startsWith('semantic.')) ref = ref.replace('semantic.', 'Semantics/');
        ref = ref.replace(/\./g, '/'); // Remplace les derniers points par des slashes
        return `{${ref}}`;
    }
    return val;
};

// Fonction récursive pour aplatir l'arbre
const flatten = (obj, prefix = '', collection = '') => {
    for (const key in obj) {
        const val = obj[key];

        // Si on arrive sur une feuille (un token)
        if (val && val.$value !== undefined) {
            const path = prefix ? `${prefix}/${key}` : key;
            const figmaType = mapType(val.$type);

            let valuesObj = {};

            // On sépare la logique : Primitives (Valeur brute) vs Semantics (Light/Dark)
            if (collection === 'Primitives') {
                valuesObj = { Value: fixAlias(val.$value) };
            } else if (collection === 'Semantics') {
                // On prépare le Dark Mode par défaut en copiant la valeur
                valuesObj = {
                    Light: fixAlias(val.$value),
                    Dark: fixAlias(val.$value)
                };
            }

            output[collection][path] = { type: figmaType, values: valuesObj };

        } else if (typeof val === 'object') {
            // Si c'est un dossier, on continue de creuser
            flatten(val, prefix ? `${prefix}/${key}` : key, collection);
        }
    }
};

// On lance l'aplatissement
if (input.primitive) flatten(input.primitive, '', 'Primitives');
if (input.semantic) flatten(input.semantic, '', 'Semantics');

// On sauvegarde le nouveau fichier
fs.writeFileSync('./figma-tokens.json', JSON.stringify(output, null, 2));
console.log("✅ Conversion terminée ! Le fichier figma-tokens.json est prêt.");