figma.showUI(__html__, { width: 450, height: 600, themeColors: true });

// ==========================================
// 1. INITIALISATION ET SAUVEGARDE
// ==========================================
figma.clientStorage.getAsync('githubConfig').then(config => {
    figma.ui.postMessage({ type: 'LOAD_CONFIG', config: config || {} });
    sendCurrentStateToUI();
});

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'SAVE_CONFIG') {
        await figma.clientStorage.setAsync('githubConfig', msg.config);
    }
    if (msg.type === 'REQUEST_CURRENT_STATE') {
        await sendCurrentStateToUI();
    }
    if (msg.type === 'IMPORT_TOKENS') {
        try {
            await importTokens(msg.tokens);
            figma.ui.postMessage({ type: 'IMPORT_SUCCESS' });
            await sendCurrentStateToUI();
        } catch (e) {
            figma.ui.postMessage({ type: 'ERROR', message: e.message });
        }
    }
};

// ==========================================
// 2. EXPORT (PUSH VERS GITHUB)
// ==========================================
async function sendCurrentStateToUI() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();
    const effectStyles = await figma.getLocalEffectStylesAsync();
    const paintStyles = await figma.getLocalPaintStylesAsync();

    // On prépare l'état avec les collections à la racine
    const state = { 
        "Primitives": {},
        "-> Color": {},
        "-> Size": {},
        "-> Typography": {},
        "Styles": { 
            "Color styles": {}, 
            "Text styles": {}, 
            "Effect styles": {} 
        } 
    };

    const targetColNames = ["Primitives", "-> Color", "-> Size", "-> Typography"];

    // --- Export des Variables ---
    for (const col of collections) {
        if (targetColNames.includes(col.name)) {
            const colVars = variables.filter(v => v.variableCollectionId === col.id);
            for (const v of colVars) {
                state[col.name][v.name] = { type: v.resolvedType, values: {} };

                for (const mode of col.modes) {
                    let val = v.valuesByMode[mode.modeId];

                    if (val && val.type === 'VARIABLE_ALIAS') {
                        const target = variables.find(x => x.id === val.id);
                        if (target) {
                            const targetCol = collections.find(c => c.id === target.variableCollectionId);
                            // Alias format: {CollectionName/VariableName}
                            val = `{${targetCol.name}/${target.name}}`;
                        }
                    } else if (v.resolvedType === 'COLOR' && val !== undefined) {
                        val = rgbToHex(val);
                    }

                    state[col.name][v.name].values[mode.name] = val;
                }
            }
        }
    }

    // --- Export des Styles de Couleur ---
    for (const style of paintStyles) {
        if (style.paints.length > 0) {
            const paint = style.paints[0];
            if (paint.type === 'SOLID') {
                state.Styles["Color styles"][style.name] = {
                    color: rgbToHex(paint.color),
                    opacity: paint.opacity
                };
            } else if (paint.type === 'IMAGE') {
                state.Styles["Color styles"][style.name] = {
                    type: 'IMAGE'
                };
            }
        }
    }

    // --- Export des Styles de Texte ---
    for (const style of textStyles) {
        state.Styles["Text styles"][style.name] = {
            fontFamily: style.fontName.family,
            fontWeight: style.fontName.style,
            fontSize: style.fontSize,
            lineHeight: style.lineHeight.unit === 'PIXELS' ? style.lineHeight.value : (style.lineHeight.unit === 'PERCENT' ? style.lineHeight.value / 100 : 'auto')
        };
    }

    // --- Export des Styles d'Effets (Ombres) ---
    for (const style of effectStyles) {
        const shadow = style.effects.find(e => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW");
        if (shadow) {
            state.Styles["Effect styles"][style.name] = {
                type: shadow.type,
                color: rgbToHex(shadow.color),
                opacity: shadow.color.a,
                x: shadow.offset.x,
                y: shadow.offset.y,
                blur: shadow.radius,
                spread: shadow.spread || 0
            };
        }
    }

    figma.ui.postMessage({ type: 'CURRENT_STATE', data: state });
}

// ==========================================
// 3. IMPORT (PULL DEPUIS GITHUB)
// ==========================================
async function importTokens(tree) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existingVars = await figma.variables.getLocalVariablesAsync();
    const targetColNames = ["Primitives", "-> Color", "-> Size", "-> Typography"];

    // --- PASSE 1 : Créer les collections, les modes et les variables ---
    for (const colName of targetColNames) {
        if (!tree[colName]) continue;

        let collection = collections.find(c => c.name === colName);
        if (!collection) {
            collection = figma.variables.createVariableCollection(colName);
            collections.push(collection);
        }

        const jsonVars = tree[colName];
        if (Object.keys(jsonVars).length === 0) continue;

        const firstVarValues = Object.values(jsonVars)[0].values;
        const modesInJson = Object.keys(firstVarValues);

        for (let i = 0; i < modesInJson.length; i++) {
            const modeName = modesInJson[i];
            if (i === 0 && collection.modes.length === 1) {
                collection.renameMode(collection.modes[0].modeId, modeName);
            } else if (!collection.modes.find(m => m.name === modeName)) {
                collection.addMode(modeName);
            }
        }

        for (const varName in jsonVars) {
            const varData = jsonVars[varName];
            let figmaVar = existingVars.find(v => v.name === varName && v.variableCollectionId === collection.id);

            if (!figmaVar) {
                figmaVar = figma.variables.createVariable(varName, collection, varData.type);
                existingVars.push(figmaVar);
            }
        }
    }

    // Fonction pour résoudre {CollectionName/VariableName}
    function findVariableByFullName(fullName) {
        const cleanName = fullName.replace(/[{}]/g, '');
        const parts = cleanName.split('/');
        const colName = parts[0];
        const varName = parts.slice(1).join('/');

        const col = collections.find(c => c.name === colName);
        if (!col) return null;
        return existingVars.find(v => v.name === varName && v.variableCollectionId === col.id);
    }

    // --- PASSE 2 : Appliquer les valeurs et relier les Alias ---
    for (const colName of targetColNames) {
        if (!tree[colName]) continue;
        const collection = collections.find(c => c.name === colName);
        const jsonVars = tree[colName];

        for (const varName in jsonVars) {
            const varData = jsonVars[varName];
            const figmaVar = existingVars.find(v => v.name === varName && v.variableCollectionId === collection.id);

            for (const modeName in varData.values) {
                const mode = collection.modes.find(m => m.name === modeName);
                if (!mode) continue;

                let rawValue = varData.values[modeName];
                if (rawValue === undefined || rawValue === null) continue;

                if (typeof rawValue === 'string' && rawValue.startsWith('{') && rawValue.endsWith('}')) {
                    const targetVar = findVariableByFullName(rawValue);
                    if (targetVar) {
                        figmaVar.setValueForMode(mode.modeId, figma.variables.createVariableAlias(targetVar));
                    }
                } else if (figmaVar.resolvedType === 'COLOR' && typeof rawValue === 'string') {
                    figmaVar.setValueForMode(mode.modeId, parseColor(rawValue));
                } else {
                    figmaVar.setValueForMode(mode.modeId, rawValue);
                }
            }
        }
    }

    // --- PASSE 3 : COLOR STYLES ---
    if (tree.Styles && tree.Styles["Color styles"]) {
        for (const [name, data] of Object.entries(tree.Styles["Color styles"])) {
            let style = (await figma.getLocalPaintStylesAsync()).find(s => s.name === name) || figma.createPaintStyle();
            style.name = name;
            if (data.color) {
                const color = parseColor(data.color);
                style.paints = [{
                    type: 'SOLID',
                    color: { r: color.r, g: color.g, b: color.b },
                    opacity: data.opacity !== undefined ? data.opacity : 1
                }];
            }
        }
    }

    // --- PASSE 4 : TEXT STYLES ---
    if (tree.Styles && tree.Styles["Text styles"]) {
        for (const [name, data] of Object.entries(tree.Styles["Text styles"])) {
            try {
                await figma.loadFontAsync({ family: data.fontFamily, style: data.fontWeight });
                let style = (await figma.getLocalTextStylesAsync()).find(s => s.name === name) || figma.createTextStyle();
                style.name = name;
                style.fontName = { family: data.fontFamily, style: data.fontWeight };
                style.fontSize = data.fontSize;
                if (data.lineHeight && data.lineHeight !== 'auto') {
                    style.lineHeight = { unit: 'PIXELS', value: data.lineHeight };
                } else {
                    style.lineHeight = { unit: 'AUTO' };
                }
            } catch(e) {
                console.warn(`Impossible de charger la font ${data.fontFamily} - ${data.fontWeight}`);
            }
        }
    }

    // --- PASSE 5 : EFFECT STYLES ---
    if (tree.Styles && tree.Styles["Effect styles"]) {
        for (const [name, data] of Object.entries(tree.Styles["Effect styles"])) {
            let style = (await figma.getLocalEffectStylesAsync()).find(s => s.name === name) || figma.createEffectStyle();
            style.name = name;

            const color = parseColor(data.color);
            color.a = data.opacity !== undefined ? data.opacity : 1;

            const effectType = data.type || (name.toLowerCase().startsWith('inner') ? "INNER_SHADOW" : "DROP_SHADOW");

            style.effects = [{
                type: effectType,
                color,
                offset: { x: data.x || 0, y: data.y || 0 },
                radius: data.blur || 0,
                spread: data.spread || 0,
                visible: true,
                blendMode: "NORMAL"
            }];
        }
    }
}

// ==========================================
// 4. HELPERS DE CONVERSION DE COULEURS
// ==========================================
function parseColor(colorStr) {
    const str = String(colorStr).trim().toLowerCase();

    if (str.startsWith('rgb')) {
        const parts = str.match(/[\d.]+/g);
        if(parts && parts.length >= 3) {
            return {
                r: Math.min(255, Math.max(0, parseFloat(parts[0]))) / 255,
                g: Math.min(255, Math.max(0, parseFloat(parts[1]))) / 255,
                b: Math.min(255, Math.max(0, parseFloat(parts[2]))) / 255,
                a: parts.length > 3 ? Math.min(1, Math.max(0, parseFloat(parts[3]))) : 1
            };
        }
    }

    let hex = str.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) hex += 'ff'; // Ajoute l'opacité

    if (hex.length === 8) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: parseInt(hex.slice(6, 8), 16) / 255
        };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
}

function rgbToHex({r, g, b}) {
    const toH = n => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`.toUpperCase();
}