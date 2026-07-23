/**
 * audio-capture.js
 * Captura áudio do microfone e envia para processamento
 */

class AudioCapture {
  constructor() {
    this.audioContext = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.analyser = null;
    this.canvas = null;
    this.init();
  }

  async init() {
    try {
      // Inicializa AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ AudioContext inicializado');
    } catch (err) {
      console.error('❌ Erro ao inicializar AudioContext:', err);
    }
  }

  async requestMicrophoneAccess() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Acesso ao microfone concedido');
      return true;
    } catch (err) {
      console.error('❌ Acesso ao microfone negado:', err);
      return false;
    }
  }

  async startRecording() {
    if (!this.stream) {
      const granted = await this.requestMicrophoneAccess();
      if (!granted) return false;
    }

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    this.mediaRecorder.onstop = () => {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
      this.processAudio(audioBlob);
    };

    this.mediaRecorder.start();
    this.isRecording = true;
    console.log('🎤 Começou a gravar');
    return true;
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('🎤 Parou de gravar');
    }
  }

  async processAudio(audioBlob) {
    console.log('📊 Processando áudio...');
    
    // Converte blob para base64 para enviar para a API
    const reader = new FileReader();
    reader.onload = async () => {
      const audioData = reader.result.split(',')[1];
      
      // Aqui você pode enviar para um serviço de transcrição
      // Por enquanto, usaremos um modelo local
      this.transcribeLocally(audioBlob);
    };
    reader.readAsDataURL(audioBlob);
  }

  async transcribeLocally(audioBlob) {
    try {
      // Usa a Web Speech API como fallback ou Whisper.js
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Dispara evento de processamento
      document.dispatchEvent(new CustomEvent('audioProcessing', {
        detail: { status: 'processando' }
      }));

      // Aqui você integraria com Whisper.js ou similar
      // Por enquanto, vamos usar a API do navegador novamente como fallback
      this.recognizeWithWebSpeechAPI(audioBlob);
    } catch (err) {
      console.error('❌ Erro ao transcrever áudio:', err);
    }
  }

  recognizeWithWebSpeechAPI(audioBlob) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'pt-BR';
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      
      console.log(`📢 Transcrito: "${transcript}"`);
      document.dispatchEvent(new CustomEvent('transcriptionComplete', {
        detail: { transcript: transcript.toLowerCase() }
      }));
    };

    recognition.onerror = (event) => {
      console.error('❌ Erro na transcrição:', event.error);
      document.dispatchEvent(new CustomEvent('transcriptionError', {
        detail: { error: event.error }
      }));
    };

    // Reconstrói áudio do blob e passa para reconhecimento
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    recognition.start();
  }

  getAudioLevel() {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray.reduce((a, b) => a + b) / dataArray.length;
  }
}

export default AudioCapture;
