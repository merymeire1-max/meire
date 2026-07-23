/**
 * voice-processor.js
 * Processa comandos de voz capturados do microfone
 */

import AudioCapture from "@managers/audio-capture.js";

class VoiceProcessor {
  constructor() {
    this.audioCapture = new AudioCapture();
    this.isListening = false;
    this.setupUI();
    this.setupListeners();
  }

  setupUI() {
    // Cria o container principal
    const container = document.createElement('div');
    container.id = 'voice-processor-container';
    container.innerHTML = `
      <div class="voice-processor-widget">
        <button id="voice-start-btn" class="voice-start-btn" title="Clique ou pressione V para iniciar reconhecimento de voz">
          🎤 Iniciar Voz
        </button>
        <div id="voice-indicator" class="voice-indicator">
          <span class="indicator-dot"></span>
          <span id="voice-indicator-text">Pronto</span>
        </div>
        <div id="voice-transcript-display" class="voice-transcript-display"></div>
      </div>
    `;
    document.body.appendChild(container);

    // Estilos CSS
    const styles = document.createElement('style');
    styles.textContent = `
      #voice-processor-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: 'Arial', sans-serif;
      }

      .voice-processor-widget {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      }

      .voice-start-btn {
        padding: 14px 28px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        font-size: 15px;
        font-weight: bold;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        white-space: nowrap;
      }

      .voice-start-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
      }

      .voice-start-btn:active {
        transform: translateY(-1px);
      }

      .voice-start-btn.recording {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        animation: recording-pulse 1s infinite;
        box-shadow: 0 0 25px rgba(245, 87, 108, 0.5);
      }

      @keyframes recording-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(245, 87, 108, 0.7); }
        50% { box-shadow: 0 0 0 15px rgba(245, 87, 108, 0); }
      }

      .voice-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(200, 200, 200, 0.2);
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        color: #333;
      }

      .indicator-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #90EE90;
        transition: all 0.2s;
      }

      .voice-indicator.listening .indicator-dot {
        background: #FF6B6B;
        animation: blink-dot 0.6s infinite;
      }

      @keyframes blink-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      .voice-transcript-display {
        width: 220px;
        min-height: 30px;
        max-height: 80px;
        padding: 10px;
        background: #1a1a1a;
        color: #00FF41;
        border: 2px solid #00FF41;
        border-radius: 8px;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        overflow-y: auto;
        text-align: center;
        display: none;
        line-height: 1.4;
      }

      .voice-transcript-display.active {
        display: block;
        animation: glow-green 0.5s ease-in-out;
      }

      @keyframes glow-green {
        0% { box-shadow: 0 0 0 rgba(0, 255, 65, 0.5); }
        50% { box-shadow: 0 0 15px rgba(0, 255, 65, 0.5); }
        100% { box-shadow: 0 0 0 rgba(0, 255, 65, 0.5); }
      }

      .voice-transcript-display::-webkit-scrollbar {
        width: 4px;
      }

      .voice-transcript-display::-webkit-scrollbar-track {
        background: #0a0a0a;
        border-radius: 2px;
      }

      .voice-transcript-display::-webkit-scrollbar-thumb {
        background: #00FF41;
        border-radius: 2px;
      }

      .voice-error {
        color: #FF6B6B;
        border-color: #FF6B6B;
      }

      @media (max-width: 480px) {
        #voice-processor-container {
          bottom: 10px;
          right: 10px;
        }

        .voice-processor-widget {
          gap: 8px;
          padding: 8px;
        }

        .voice-start-btn {
          padding: 12px 20px;
          font-size: 13px;
        }

        .voice-transcript-display {
          width: 150px;
          font-size: 10px;
        }
      }
    `;
    document.head.appendChild(styles);

    // Event listeners
    this.setupButtonListeners();
  }

  setupButtonListeners() {
    const btn = document.getElementById('voice-start-btn');
    
    btn.addEventListener('click', () => {
      this.toggleListening();
    });

    // Atalho de teclado: V
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'v') {
        if (document.activeElement.tagName !== 'INPUT' && 
            document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.toggleListening();
        }
      }
    });
  }

  setupListeners() {
    // Quando transcrição é completa
    document.addEventListener('transcriptionComplete', (e) => {
      const transcript = e.detail.transcript;
      this.displayTranscript(transcript);
      this.processCommand(transcript);
      this.updateStatus('Transcrição: ' + transcript);
    });

    // Quando há erro
    document.addEventListener('transcriptionError', (e) => {
      this.displayError('Erro: ' + e.detail.error);
      this.updateStatus('Erro na transcrição');
    });
  }

  async toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async startListening() {
    console.log('🎤 Iniciando captura de voz...');
    const started = await this.audioCapture.startRecording();
    
    if (started) {
      this.isListening = true;
      this.updateButton(true);
      this.updateIndicator('Escutando...', true);
      
      // Para a gravação automaticamente após 5 segundos
      setTimeout(() => {
        if (this.isListening) {
          this.stopListening();
        }
      }, 5000);
    }
  }

  stopListening() {
    console.log('🎤 Parando captura de voz...');
    this.audioCapture.stopRecording();
    this.isListening = false;
    this.updateButton(false);
    this.updateIndicator('Processando...', false);
  }

  processCommand(transcript) {
    const commands = {
      'usar slot um': 'usar slot 1',
      'usar slot 1': 'usar slot 1',
      'usar slot dois': 'usar slot 2',
      'usar slot 2': 'usar slot 2',
      'usar slot três': 'usar slot 3',
      'usar slot 3': 'usar slot 3',
      'guardar': 'guardar',
      'descartar': 'descartar',
      'passar': 'passar',
      'passar turno': 'passar',
    };

    let found = null;
    for (const [voice, gameCmd] of Object.entries(commands)) {
      if (transcript.includes(voice)) {
        found = gameCmd;
        break;
      }
    }

    if (found) {
      console.log(`🎮 Executando comando: ${found}`);
      this.executeGameCommand(found);
      this.displaySuccess(`Executado: ${found}`);
    } else {
      console.warn(`⚠️ Comando não reconhecido: "${transcript}"`);
      this.displayError(`Comando não reconhecido`);
    }
  }

  executeGameCommand(command) {
    // Se commandRegistry existe, usa ele
    if (window.commandRegistry) {
      window.commandRegistry.execute('player1', command);
      console.log('✅ Comando enviado para commandRegistry');
    } else {
      // Senão, dispara evento customizado
      document.dispatchEvent(new CustomEvent('voiceGameCommand', {
        detail: { command: command }
      }));
      console.log('✅ Comando enviado como evento');
    }
  }

  updateButton(isRecording) {
    const btn = document.getElementById('voice-start-btn');
    if (isRecording) {
      btn.classList.add('recording');
      btn.textContent = '⏹️ Parar';
    } else {
      btn.classList.remove('recording');
      btn.textContent = '🎤 Iniciar Voz';
    }
  }

  updateIndicator(text, isListening) {
    const indicator = document.getElementById('voice-indicator');
    const indicatorText = document.getElementById('voice-indicator-text');
    
    indicatorText.textContent = text;
    
    if (isListening) {
      indicator.classList.add('listening');
    } else {
      indicator.classList.remove('listening');
    }
  }

  displayTranscript(text) {
    const display = document.getElementById('voice-transcript-display');
    display.classList.add('active');
    display.textContent = `"${text}"`;
    display.classList.remove('error');
    
    setTimeout(() => {
      display.classList.remove('active');
    }, 3000);
  }

  displaySuccess(text) {
    const display = document.getElementById('voice-transcript-display');
    display.classList.add('active');
    display.textContent = `✅ ${text}`;
    display.classList.remove('error');
    
    setTimeout(() => {
      display.classList.remove('active');
    }, 3000);
  }

  displayError(text) {
    const display = document.getElementById('voice-transcript-display');
    display.classList.add('active', 'error');
    display.textContent = `❌ ${text}`;
    
    setTimeout(() => {
      display.classList.remove('active');
    }, 3000);
  }

  updateStatus(text) {
    console.log(`📊 Status: ${text}`);
  }
}

// Inicializa quando o jogo carrega
window.addEventListener('load', () => {
  if (!window.voiceProcessor) {
    window.voiceProcessor = new VoiceProcessor();
    console.log('✅ VoiceProcessor inicializado - Pressione V ou clique no botão 🎤');
  }
});

export default VoiceProcessor;
