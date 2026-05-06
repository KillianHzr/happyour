# Configuration MCP pour Design Tokens

Ce projet utilise une architecture "Design System As Code". Les tokens sont centralisés dans `design-tokens.json` et consommés par `lib/theme.ts`.

## Lancer le serveur MCP Filesystem

Pour exposer ces tokens de manière bidirectionnelle (permettant à Figma ou d'autres outils via MCP de lire/modifier les styles), lancez la commande suivante :

```bash
npx -y @modelcontextprotocol/server-filesystem $(pwd)/design-tokens.json $(pwd)/lib/
```

## Structure des Fichiers
- `design-tokens.json` : Source de vérité unique (W3C Standard).
- `lib/theme.ts` : Pont entre le JSON et React Native.
- `components/` : Composants atomiques utilisant les tokens via `lib/theme.ts`.
