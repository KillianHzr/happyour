figma.showUI(__html__, { width: 400, height: 500, themeColors: true });

// --- GESTION DE LA SAUVEGARDE DES CHAMPS ---
// Au lancement, on lit les données sauvegardées et on les envoie à l'UI
figma.clientStorage.getAsync('githubConfig').then(config => {
    figma.ui.postMessage({ type: 'LOAD_CONFIG', config: config || {} });
});

// On écoute les messages venant de l'UI pour sauvegarder les champs
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'SAVE_CONFIG') {
        await figma.clientStorage.setAsync('githubConfig', msg.config);
    }
};
// -------------------------------------------

function rgbToHex(rgba) {
    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
    let hex = `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
    if (rgba.a !== undefined && rgba.a < 1) hex += toHex(rgba.a);
    return hex;
}

async function extractVariables() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();

    const exportedData = {};

    for (const collection of collections) {
        exportedData[collection.name] = {};
        const colVars = variables.filter(v => v.variableCollectionId === collection.id);

        for (const v of colVars) {
            exportedData[collection.name][v.name] = {};
            for (const mode of collection.modes) {
                let value = v.valuesByMode[mode.modeId];
                if (v.resolvedType === 'COLOR' && value !== undefined) {
                    value = rgbToHex(value);
                }
                exportedData[collection.name][v.name][mode.name] = value;
            }
        }
    }

    figma.ui.postMessage({ type: 'VARIABLES_EXTRACTED', data: exportedData });
}

extractVariables();