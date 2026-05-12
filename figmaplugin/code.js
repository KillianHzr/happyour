figma.showUI(__html__, { width: 450, height: 600, themeColors: true });

figma.clientStorage.getAsync('githubConfig').then(config => {
    figma.ui.postMessage({ type: 'LOAD_CONFIG', config: config || {} });
    sendCurrentStateToUI();
});

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'SAVE_CONFIG') await figma.clientStorage.setAsync('githubConfig', msg.config);
    if (msg.type === 'REQUEST_CURRENT_STATE') await sendCurrentStateToUI();
    if (msg.type === 'IMPORT_TOKENS') {
        try {
            await importTokens(msg.tokens);
            await sendCurrentStateToUI();
        } catch (e) {
            console.error(e);
            figma.ui.postMessage({ type: 'ERROR', message: e.message });
        }
    }
};

// ==========================================
// 2. EXPORT (PUSH)
// ==========================================
async function sendCurrentStateToUI() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    const textStyles = await figma.getLocalTextStylesAsync();
    const effectStyles = await figma.getLocalEffectStylesAsync();
    const paintStyles = await figma.getLocalPaintStylesAsync();

    const state = {
        "Primitives": {}, "-> Color": {}, "-> Size": {}, "-> Typography": {},
        "Styles": { "Color styles": {}, "Text styles": {}, "Effect styles": {} }
    };

    const targetColNames = ["Primitives", "-> Color", "-> Size", "-> Typography"];

    function getAliasValue(val) {
        if (val && val.type === 'VARIABLE_ALIAS') {
            const target = variables.find(x => x.id === val.id);
            if (target) {
                const targetCol = collections.find(c => c.id === target.variableCollectionId);
                return `{${targetCol.name}/${target.name}}`;
            }
        }
        return null;
    }

    for (const col of collections) {
        if (targetColNames.includes(col.name)) {
            const colVars = variables.filter(v => v.variableCollectionId === col.id);
            for (const v of colVars) {
                state[col.name][v.name] = { type: v.resolvedType, values: {} };
                for (const mode of col.modes) {
                    let val = v.valuesByMode[mode.modeId];
                    const alias = getAliasValue(val);
                    if (alias) val = alias;
                    else if (v.resolvedType === 'COLOR' && val !== undefined) val = rgbToHex(val);
                    state[col.name][v.name].values[mode.name] = val;
                }
            }
        }
    }

    for (const style of paintStyles) {
        if (style.paints.length > 0) {
            const paint = style.paints[0];
            if (paint.type === 'SOLID') {
                let colorVal = rgbToHex(paint.color);
                if (paint.boundVariables && paint.boundVariables.color) {
                    colorVal = getAliasValue(paint.boundVariables.color) || colorVal;
                }
                state.Styles["Color styles"][style.name] = { color: colorVal, opacity: paint.opacity };
            } else if (paint.type === 'IMAGE') {
                state.Styles["Color styles"][style.name] = { type: 'IMAGE', url: 'Mettre_une_URL_ici_si_besoin' };
            }
        }
    }

    // --- TEXT STYLES (Corrigé pour intégrer fontWeight numérique) ---
    for (const style of textStyles) {
        const textData = {
            fontFamily: style.fontName.family,
            fontStyle: style.fontName.style,
            fontWeight: style.fontWeight, // AJOUT CRUCIAL
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            paragraphSpacing: style.paragraphSpacing,
            paragraphIndent: style.paragraphIndent
        };

        if (style.boundVariables) {
            // On vérifie désormais toutes les variables possibles
            for (const prop of ['fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent']) {
                if (style.boundVariables[prop]) {
                    textData[prop] = getAliasValue(style.boundVariables[prop]) || textData[prop];
                }
            }
        }
        state.Styles["Text styles"][style.name] = textData;
    }

    for (const style of effectStyles) {
        const effect = style.effects[0];
        if (!effect) continue;
        const effectData = { type: effect.type, visible: effect.visible };
        if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
            effectData.color = rgbToHex(effect.color);
            effectData.opacity = effect.color.a;
            effectData.x = effect.offset.x;
            effectData.y = effect.offset.y;
            effectData.blur = effect.radius;
            effectData.spread = effect.spread || 0;
            if (effect.boundVariables) {
                if (effect.boundVariables.color) effectData.color = getAliasValue(effect.boundVariables.color) || effectData.color;
                if (effect.boundVariables.radius) effectData.blur = getAliasValue(effect.boundVariables.radius) || effectData.blur;
                if (effect.boundVariables.spread) effectData.spread = getAliasValue(effect.boundVariables.spread) || effectData.spread;
                if (effect.boundVariables.offsetX) effectData.x = getAliasValue(effect.boundVariables.offsetX) || effectData.x;
                if (effect.boundVariables.offsetY) effectData.y = getAliasValue(effect.boundVariables.offsetY) || effectData.y;
            }
        } else {
            effectData.blur = effect.radius;
            if (effect.boundVariables && effect.boundVariables.radius) effectData.blur = getAliasValue(effect.boundVariables.radius) || effectData.blur;
        }
        state.Styles["Effect styles"][style.name] = effectData;
    }

    figma.ui.postMessage({ type: 'CURRENT_STATE', data: state });
}

// ==========================================
// 3. IMPORT (PULL)
// ==========================================
async function importTokens(tree) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const existingVars = await figma.variables.getLocalVariablesAsync();
    const targetColNames = ["Primitives", "-> Color", "-> Size", "-> Typography"];
    let stats = { varCreated: 0, varUpdated: 0, styleCreated: 0, styleUpdated: 0, errors: 0 };

    function findVariableByFullName(fullName) {
        if (typeof fullName !== 'string' || !fullName.startsWith('{')) return null;
        const cleanName = fullName.replace(/[{}]/g, '');
        const parts = cleanName.split('/');
        const col = collections.find(c => c.name === parts[0]);
        if (!col) return null;
        return existingVars.find(v => v.name === parts.slice(1).join('/') && v.variableCollectionId === col.id);
    }

    function resolveVariableValue(variable) {
        if (!variable) return null;
        const modes = Object.keys(variable.valuesByMode);
        if (modes.length === 0) return null;
        let val = variable.valuesByMode[modes[0]];
        if (val && val.type === 'VARIABLE_ALIAS') {
            const aliasVar = existingVars.find(v => v.id === val.id);
            return resolveVariableValue(aliasVar);
        }
        return val;
    }

    // --- VARIABLES ---
    for (const colName of targetColNames) {
        if (!tree[colName]) continue;
        let collection = collections.find(c => c.name === colName) || figma.variables.createVariableCollection(colName);
        if (!collections.includes(collection)) collections.push(collection);

        const jsonVars = tree[colName];
        if (Object.keys(jsonVars).length === 0) continue;
        const firstVarValues = Object.values(jsonVars)[0].values;
        const modesInJson = Object.keys(firstVarValues);
        for (let i = 0; i < modesInJson.length; i++) {
            if (i === 0 && collection.modes.length === 1) collection.renameMode(collection.modes[0].modeId, modesInJson[i]);
            else if (!collection.modes.find(m => m.name === modesInJson[i])) collection.addMode(modesInJson[i]);
        }
        for (const varName in jsonVars) {
            let figmaVar = existingVars.find(v => v.name === varName && v.variableCollectionId === collection.id);
            if (!figmaVar) {
                figmaVar = figma.variables.createVariable(varName, collection, jsonVars[varName].type);
                existingVars.push(figmaVar);
                stats.varCreated++;
            } else stats.varUpdated++;
        }
    }

    // --- VALEURS & ALIAS ---
    for (const colName of targetColNames) {
        if (!tree[colName]) continue;
        const collection = collections.find(c => c.name === colName);
        for (const [varName, varData] of Object.entries(tree[colName])) {
            const figmaVar = existingVars.find(v => v.name === varName && v.variableCollectionId === collection.id);
            for (const [modeName, rawValue] of Object.entries(varData.values)) {
                const mode = collection.modes.find(m => m.name === modeName);
                if (!mode || rawValue === undefined || rawValue === null) continue;
                const targetVar = findVariableByFullName(rawValue);
                if (targetVar) figmaVar.setValueForMode(mode.modeId, figma.variables.createVariableAlias(targetVar));
                else if (figmaVar.resolvedType === 'COLOR') figmaVar.setValueForMode(mode.modeId, parseColor(rawValue));
                else figmaVar.setValueForMode(mode.modeId, rawValue);
            }
        }
    }

    // --- COLOR STYLES ---
    if (tree.Styles && tree.Styles["Color styles"]) {
        const paintStyles = await figma.getLocalPaintStylesAsync();
        for (const [name, data] of Object.entries(tree.Styles["Color styles"])) {
            let style = paintStyles.find(s => s.name === name);
            if (!style) {
                style = figma.createPaintStyle();
                style.name = name;
                stats.styleCreated++;
            } else stats.styleUpdated++;

            if (data.type === 'IMAGE' && data.url && data.url !== 'Mettre_une_URL_ici_si_besoin') {
                try {
                    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(data.url)}`;
                    const image = await figma.createImageAsync(proxyUrl);
                    style.paints = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
                } catch (e) {
                    console.error(`Erreur d'image pour ${name}:`, e);
                    stats.errors++;
                }
            } else if (data.color) {
                const targetVar = findVariableByFullName(data.color);
                const paint = { type: 'SOLID', color: targetVar ? { r: 0, g: 0, b: 0 } : parseColor(data.color), opacity: data.opacity !== undefined ? data.opacity : 1 };
                if (targetVar) paint.boundVariables = { color: figma.variables.createVariableAlias(targetVar) };
                style.paints = [paint];
            }
        }
    }

    // --- TEXT STYLES ---
    if (tree.Styles && tree.Styles["Text styles"]) {
        const textStyles = await figma.getLocalTextStylesAsync();
        for (const [name, data] of Object.entries(tree.Styles["Text styles"])) {
            try {
                const rawFamily = data.fontFamily;
                const rawStyle = data.fontStyle || "Regular";

                const familyVar = findVariableByFullName(rawFamily);
                const styleVar = findVariableByFullName(rawStyle);

                let resolvedFamily = familyVar ? resolveVariableValue(familyVar) : rawFamily;
                let resolvedStyleName = styleVar ? resolveVariableValue(styleVar) : rawStyle;

                resolvedFamily = typeof resolvedFamily === 'string' ? resolvedFamily : "Inter";
                resolvedStyleName = typeof resolvedStyleName === 'string' ? resolvedStyleName : "Regular";

                await figma.loadFontAsync({ family: resolvedFamily, style: resolvedStyleName });

                let style = textStyles.find(s => s.name === name);
                if (!style) {
                    style = figma.createTextStyle();
                    style.name = name;
                    stats.styleCreated++;
                } else stats.styleUpdated++;

                style.fontName = { family: resolvedFamily, style: resolvedStyleName };

                // La liste complète incluant fontWeight
                const propsToBind = ['fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent'];

                for (const prop of propsToBind) {
                    const val = data[prop];
                    if (val === undefined) continue;

                    const targetVar = findVariableByFullName(val);
                    if (targetVar) {
                        try {
                            style.setBoundVariable(prop, targetVar);
                        }
                        catch (e) { console.error(`Error linking ${name} ${prop}:`, e); stats.errors++; }
                    } else {
                        if (prop === 'fontSize') style.fontSize = val;
                        else if (prop === 'fontWeight') style.fontWeight = val;
                        else if (prop === 'paragraphSpacing') style.paragraphSpacing = val;
                        else if (prop === 'paragraphIndent') style.paragraphIndent = val;
                        else if (prop === 'lineHeight') {
                            if (typeof val === 'object') style.lineHeight = val;
                            else if (typeof val === 'number') style.lineHeight = { unit: 'PIXELS', value: val };
                            else if (val === 'auto') style.lineHeight = { unit: 'AUTO' };
                        }
                        else if (prop === 'letterSpacing') {
                            if (typeof val === 'object') style.letterSpacing = val;
                            else if (typeof val === 'number') style.letterSpacing = { unit: 'PIXELS', value: val };
                        }
                    }
                }
            } catch(e) { console.error(`Font error for ${name}:`, e); stats.errors++; }
        }
    }

    // --- EFFECT STYLES ---
    if (tree.Styles && tree.Styles["Effect styles"]) {
        const effectStyles = await figma.getLocalEffectStylesAsync();
        for (const [name, data] of Object.entries(tree.Styles["Effect styles"])) {
            let style = effectStyles.find(s => s.name === name);
            if (!style) {
                style = figma.createEffectStyle();
                style.name = name;
                stats.styleCreated++;
            } else stats.styleUpdated++;

            const type = data.type || "DROP_SHADOW";
            let effect = { type, visible: data.visible !== false };
            if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
                effect.blendMode = "NORMAL";
                effect.color = !String(data.color).startsWith('{') ? parseColor(data.color) : { r:0, g:0, b:0, a:1 };
                if (effect.color) effect.color.a = data.opacity !== undefined ? data.opacity : 1;
                effect.offset = { x: typeof data.x === 'number' ? data.x : 0, y: typeof data.y === 'number' ? data.y : 0 };
                effect.radius = typeof data.blur === 'number' ? data.blur : 0;
                effect.spread = typeof data.spread === 'number' ? data.spread : 0;
            } else effect.radius = typeof data.blur === 'number' ? data.blur : 0;

            const bindings = { 'color': 'color', 'blur': 'radius', 'spread': 'spread', 'x': 'offsetX', 'y': 'offsetY' };
            for (const [k, fk] of Object.entries(bindings)) {
                const v = findVariableByFullName(data[k]);
                if (v) try { effect = figma.variables.setBoundVariableForEffect(effect, fk, v); } catch(e) { console.error(`Binding error ${name} ${fk}:`, e); }
            }
            style.effects = [effect];
        }
    }

    console.log(`--- IMPORT COMPLETE ---
Variables: ${stats.varCreated} créées, ${stats.varUpdated} mises à jour
Styles: ${stats.styleCreated} créés, ${stats.styleUpdated} mis à jour
Erreurs: ${stats.errors}`);
    figma.ui.postMessage({ type: 'IMPORT_SUCCESS', stats });
}

function parseColor(colorStr) {
    const str = String(colorStr).trim().toLowerCase();
    if (str.startsWith('rgb')) {
        const parts = str.match(/[\d.]+/g);
        if(parts && parts.length >= 3) return { r: Math.min(255, Math.max(0, parseFloat(parts[0]))) / 255, g: Math.min(255, Math.max(0, parseFloat(parts[1]))) / 255, b: Math.min(255, Math.max(0, parseFloat(parts[2]))) / 255, a: parts.length > 3 ? Math.min(1, Math.max(0, parseFloat(parts[3]))) : 1 };
    }
    let hex = str.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) hex += 'ff';
    if (hex.length === 8) return { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255, a: parseInt(hex.slice(6, 8), 16) / 255 };
    return { r: 0, g: 0, b: 0, a: 1 };
}

function rgbToHex({r, g, b}) {
    const toH = n => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`.toUpperCase();
}