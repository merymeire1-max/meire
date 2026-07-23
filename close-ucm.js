/**
 * close-ucm.js - Comando para forçar fechamento do UCM via chat
 *
 * Uso: /game fechar ucm
 *
 * Correções:
 * - Registra o comando diretamente no commandRegistry global quando disponível,
 *   tentando novamente por um período caso o registry seja inicializado depois.
 * - Mantém compatibilidade ESM + CommonJS e proteção em ambientes sem DOM.
 */

import { notificationManager } from "@interface/notification-manager.js";

let closeUCMManager = null;
let triedDynamicImport = false;

async function ensureCloseUCMManager() {
  if (closeUCMManager || triedDynamicImport) return;
  triedDynamicImport = true;

  const importPaths = [
    "./open-card.js",
    "../open-card.js",
    "./commands/open-card.js",
    "../commands/open-card.js",
    "/open-card.js",
    "@/open-card.js",
  ];

  for (const p of importPaths) {
    try {
      const mod = await import(p);
      if (mod?.closeUCMManager) {
        closeUCMManager = mod.closeUCMManager;
        return;
      }
      if (mod?.default?.closeUCMManager) {
        closeUCMManager = mod.default.closeUCMManager;
        return;
      }
    } catch (e) {
      // continua tentando outros caminhos
    }
  }

  try {
    if (typeof globalThis !== "undefined") {
      closeUCMManager =
        globalThis.closeUCMManager ?? globalThis.window?.closeUCMManager ?? null;
    }
  } catch (e) {
    // ignora
  }
}

async function doForceClose() {
  await ensureCloseUCMManager();

  if (closeUCMManager && typeof closeUCMManager.forceClose === "function") {
    try {
      await closeUCMManager.forceClose();
      return;
    } catch (e) {
      console.warn("close-ucm: closeUCMManager.forceClose falhou:", e);
    }
  }

  try {
    if (typeof globalThis !== "undefined") {
      const g = globalThis;
      const candidate = (g.window && g.window.universalCardModal) || g.universalCardModal;
      if (candidate && typeof candidate.close === "function") {
        try {
          candidate.close();
          return;
        } catch (e) {
          console.warn("close-ucm: universalCardModal.close() lançou:", e);
        }
      }
    }
  } catch (e) {
    // ignora
  }

  if (typeof document === "undefined") {
    console.warn("close-ucm: document não disponível — não foi possível executar fallback DOM");
    return;
  }

  try {
    try {
      document.dispatchEvent(new CustomEvent("close-universal-card-modal"));
    } catch (e) {
      // ignora
    }

    try {
      const overlays = document.querySelectorAll(".ucm-target-overlay, .ucm-slot-overlay");
      overlays.forEach((el) => {
        try {
          if (el && typeof el.remove === "function") el.remove();
        } catch (e) {
          // ignora
        }
      });
    } catch (e) {
      // ignora
    }

    const selector =
      "#ucmStage, .ucm-stage, #ucmInfoPanel, .ucm-info-panel, .ucm, #user-card-menu, .user-card-menu, [data-ucm], .card-menu, [role='dialog'][class*='card']";
    const u = document.querySelector(selector);

    if (u) {
      try {
        if (typeof u.close === "function") {
          try {
            u.close();
          } catch (e) {
            // ignora
          }
        }
      } catch (e) {
        // ignora
      }

      try {
        if (u.classList) {
          u.classList.remove("active", "closing");
        }
      } catch (e) {
        // ignora
      }

      try {
        u.style.display = "none";
        u.setAttribute("aria-hidden", "true");
      } catch (e) {
        // ignora
      }
    } else {
      try {
        document.querySelectorAll(".ucm-stage, .ucm-info-panel, .ucm, .user-card-menu").forEach((el) => {
          try {
            if (el.classList) el.classList.remove("active", "closing");
            if (typeof el.remove === "function") el.remove();
          } catch (e) {
            // ignora
          }
        });
      } catch (e) {
        // ignora
      }
    }
  } catch (e) {
    console.warn("close-ucm: fallback DOM falhou:", e);
  }
}

export const closeUCMCommand = {
  id: "fechar",
  name: "fechar",
  aliases: ["fechar", "fechar-ucm", "closeucm", "close-ucm", "ucmclose", "fecharucm"],
  description: "Força o fechamento do UCM (User Card Menu)",
  usage: "/game fechar ucm",
  minArgs: 0,
  maxArgs: 3,
  cooldown: 1000,

  async execute(playerId, args, metadata) {
    try {
      if (notificationManager) {
        try {
          notificationManager.show({
            type: playerId,
            text: "🔒 Fechando UCM...",
            duration: 1000,
          });
        } catch (e) {
          // ignora falha na notificação
        }
      }

      await doForceClose();

      if (notificationManager) {
        try {
          notificationManager.show({
            type: playerId,
            text: "✅ UCM fechado",
            duration: 2000,
          });
        } catch (e) {
          // ignora
        }
      }

      return true;
    } catch (err) {
      console.error("Erro ao executar closeUCMCommand:", err);
      if (notificationManager) {
        try {
          notificationManager.show({
            type: playerId,
            text: "❌ Não foi possível fechar o UCM",
            duration: 3000,
          });
        } catch (e) {
          // ignora
        }
      }
      return false;
    }
  },
};

export default closeUCMCommand;

// Compatibilidade CommonJS
try {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = closeUCMCommand;
  }
} catch (e) {
  // ignora
}

/**
 * Registro ativo: tenta registrar imediatamente; se não houver registry ainda,
 * tenta repetidamente por alguns segundos (quando o registry é inicializado depois).
 */
function attemptRegisterOnce() {
  try {
    const g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null;
    if (!g) return false;

    const candidates = [
      g.commandRegistry,
      g.CommandRegistry,
      (g.window && g.window.commandRegistry) || null,
      (g.window && g.window.CommandRegistry) || null,
      g.commands,
      (g.window && g.window.commands) || null,
    ];

    for (const reg of candidates) {
      if (!reg) continue;

      try {
        if (typeof reg.register === "function") {
          reg.register(closeUCMCommand);
          console.log("✅ closeUCMCommand registrado via registry.register()");
          return true;
        } else if (typeof reg.add === "function") {
          reg.add(closeUCMCommand);
          console.log("✅ closeUCMCommand registrado via registry.add()");
          return true;
        } else if (typeof reg.registerCommand === "function") {
          reg.registerCommand(closeUCMCommand);
          console.log("✅ closeUCMCommand registrado via registry.registerCommand()");
          return true;
        } else if (Array.isArray(reg)) {
          reg.push(closeUCMCommand);
          console.log("✅ closeUCMCommand empurrado para array global commands");
          return true;
        }
      } catch (e) {
        // ignora e tenta próximo candidato
      }
    }
  } catch (e) {
    // ignora
  }

  return false;
}

// Tenta registro imediato
if (!attemptRegisterOnce()) {
  // tenta por alguns segundos (500ms interval, até 20 tentativas = 10s)
  let tries = 0;
  const maxTries = 20;
  const iv = setInterval(() => {
    tries++;
    if (attemptRegisterOnce()) {
      clearInterval(iv);
      return;
    }
    if (tries >= maxTries) {
      clearInterval(iv);
      console.warn("close-ucm: não foi possível registrar o comando automaticamente (commandRegistry não disponível).");
    }
  }, 500);
}

console.log("✅ close-ucm.js carregado (comando 'fechar')");