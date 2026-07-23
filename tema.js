/**
 * tema.js - Comando /game tema
 *
 * Uso:
 *   /game tema fundo <arquivo.jpg>   — Muda imagem de fundo do jogo
 *   /game tema verso <arquivo.jpg>   — Muda verso de todas as cartas
 *   /game tema reset                 — Restaura fundo e verso padrões
 *
 * @module TemaCommand
 */

import { effectApplicator } from "@systems/cards/interativa/interactive-card-effects.js";
import { notificationManager } from "@interface/notification-manager.js";

export const temaCommand = {
  id: "tema",
  name: "tema",
  aliases: ["theme"],
  description: "Altera o tema visual do jogo (fundo ou verso das cartas)",
  usage: "/game tema fundo|verso|reset [arquivo]",
  minArgs: 1,
  maxArgs: 2,

  async execute(playerId, args) {
    const subCmd = (args[0] || "").toLowerCase();
    const arquivo = args[1] || null;

    if (subCmd === "fundo") {
      if (!arquivo) {
        notificationManager?.show({ type: playerId, text: "⚠️ Informe o arquivo de fundo", duration: 3000 });
        return false;
      }
      effectApplicator.applyBackground(arquivo);
      console.log(`🎨 [tema] Fundo → ${arquivo}`);
      return true;
    }

    if (subCmd === "verso") {
      if (!arquivo) {
        notificationManager?.show({ type: playerId, text: "⚠️ Informe o arquivo de verso", duration: 3000 });
        return false;
      }
      effectApplicator.applyCardBack(arquivo);
      console.log(`🃏 [tema] Verso → ${arquivo}`);
      return true;
    }

    if (subCmd === "reset") {
      effectApplicator.resetTheme();
      console.log("🔄 [tema] Visual resetado");
      return true;
    }

    notificationManager?.show({
      type: playerId,
      text: `❌ Subcomando inválido: "${subCmd}"<br><small>Use: fundo | verso | reset</small>`,
      duration: 4000,
    });
    return false;
  },
};

console.log("✅ Comando 'tema' carregado");
