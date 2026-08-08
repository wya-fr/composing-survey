// ==========================================================================
// GROOVE DECK // AUDIO ENGINE (WEB AUDIO API SYNTHESIZER) - BUGFIX FOR CALLBACK RESET
// ==========================================================================

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    
    // 預設參數
    this.bpm = 120;
    this.currentStep = 0; // 0 到 63 (4 小節，每小節 16 步)
    this.tempoPitched = 1.0; // 唱盤刮碟影響的播放速度倍率
    
    // 排程 Clock 變數
    this.schedulerTimerId = null;
    this.nextNoteTime = 0.0;
    this.scheduleAheadTime = 0.1; // 預排 100ms
    this.lookahead = 25.0; // 每 25ms 檢查一次是否要排程
    
    // 效果器參數
    this.filterKnobVal = 0; // -100 (LPF) 到 100 (HPF)
    this.delayTimeVal = 0.3; // 0.0 到 0.95 秒
    this.delayFeedbackVal = 0.2; // 0.0 到 0.9
    this.masterVolumeVal = 0.8; // 0.0 到 1.0
    
    // Performance FX 狀態
    this.stutterType = null; // null, '16', '8'
    this.isTapeStopping = false;
    this.tapeStopProgress = 1.0; // 1.0 down to 0.0
    
    // 樂器軌道設置
    // 軌道索引: 0: Kick, 1: Snare, 2: C.Hat, 3: O.Hat, 4: Clap, 5: Tom/Rim
    this.channels = [
      { name: 'kick', mute: false, solo: false, volume: 0.9 },
      { name: 'snare', mute: false, solo: false, volume: 0.85 },
      { name: 'ch', mute: false, solo: false, volume: 0.7 },
      { name: 'oh', mute: false, solo: false, volume: 0.6 },
      { name: 'clap', mute: false, solo: false, volume: 0.75 },
      { name: 'tom', mute: false, solo: false, volume: 0.8 }
    ];
    
    // 永久管道 Gain 節點，防止 GC (垃圾回收)
    this.channelGains = [];
    this.scratchOsc = null;
    this.scratchGain = null;
    this.isScratching = false;
    
    // 外部回調函式 (放在 Constructor 防止 init() 時被重設為 null)
    this.onStepTrigger = null;
    this.onTapeStopComplete = null;
  }

  // 初始化音訊內容 (需要使用者互動觸發)
  init() {
    if (this.audioCtx) return;
    
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    
    // 建立 Master FX 節點鏈
    this.masterVolumeNode = this.audioCtx.createGain();
    this.masterVolumeNode.gain.value = this.masterVolumeVal;
    
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    
    // DJ Filters (Lowpass & Highpass)
    this.lpfNode = this.audioCtx.createBiquadFilter();
    this.lpfNode.type = 'lowpass';
    this.lpfNode.frequency.value = 22000;
    this.lpfNode.Q.value = 1.0;

    this.hpfNode = this.audioCtx.createBiquadFilter();
    this.hpfNode.type = 'highpass';
    this.hpfNode.frequency.value = 10;
    this.hpfNode.Q.value = 1.0;

    // Delay FX Node
    this.delayNode = this.audioCtx.createDelay(2.0);
    this.delayNode.delayTime.value = this.delayTimeVal;
    
    this.delayFeedbackNode = this.audioCtx.createGain();
    this.delayFeedbackNode.gain.value = this.delayFeedbackVal;
    
    this.delayWetNode = this.audioCtx.createGain();
    this.delayWetNode.gain.value = 0.2; // 預設 Wet 程度
    
    this.dryNode = this.audioCtx.createGain();
    this.dryNode.gain.value = 0.8;

    // 連接 Delay 反饋迴路
    this.delayNode.connect(this.delayFeedbackNode);
    this.delayFeedbackNode.connect(this.delayNode);

    // 主路由通道 (Pre-FX -> Filters -> Split into Dry/Wet -> Mixer -> Analyser -> Output)
    this.preFxNode = this.audioCtx.createGain();
    
    // 連接 PreFX -> 濾波器
    this.preFxNode.connect(this.lpfNode);
    this.lpfNode.connect(this.hpfNode);
    
    // 濾波器後分流為 Dry 和 Wet
    this.hpfNode.connect(this.dryNode);
    this.hpfNode.connect(this.delayNode);
    this.delayNode.connect(this.delayWetNode);
    
    // 乾濕信號匯流至 MasterVolume
    this.dryNode.connect(this.masterVolumeNode);
    this.delayWetNode.connect(this.masterVolumeNode);
    
    // MasterVolume -> 分析器 -> 輸出
    this.masterVolumeNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    // 建立 6 個永久 Gain 節點來防止 Garbage Collection 並即時靜音/單獨播放
    this.channelGains = [];
    for (let i = 0; i < 6; i++) {
      const chGain = this.audioCtx.createGain();
      chGain.connect(this.preFxNode);
      this.channelGains.push(chGain);
    }
    this.updateChannelVolumes(); // 初始化音量與靜音狀態
    
    // 建立噪訊 Buffer (用於 Snare, Hat, Clap)
    this.noiseBuffer = this.createNoiseBuffer();
  }

  // 建立白雜訊 Buffer
  createNoiseBuffer() {
    const bufferSize = this.audioCtx.sampleRate * 2; // 2秒雜訊
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 即時更新所有軌道的音量與 Solo/Mute
  updateChannelVolumes() {
    if (!this.audioCtx || !this.channelGains.length) return;
    
    const hasSolo = this.channels.some(c => c.solo);
    const now = this.audioCtx.currentTime;
    
    for (let i = 0; i < 6; i++) {
      const channel = this.channels[i];
      let targetVolume = channel.volume;
      
      if (channel.mute) {
        targetVolume = 0;
      } else if (hasSolo && !channel.solo) {
        targetVolume = 0;
      }
      
      // 使用平滑轉折以防爆音
      this.channelGains[i].gain.setTargetAtTime(targetVolume, now, 0.01);
    }
  }

  // ==========================================================================
  // 鼓聲合成器 (Web Audio API Synthesizers) - 改為連入永久軌道 Gain Node
  // ==========================================================================
  
  // 1. Kick Drum (大鼓)
  synthesizeKick(time, destinationNode, customPitchMultiplier = 1.0) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(destinationNode);
    
    // 音高掃描 (快速向下折射，創造衝擊感)
    const startFreq = 150 * customPitchMultiplier * this.tapeStopProgress;
    const endFreq = 40 * customPitchMultiplier * this.tapeStopProgress;
    
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.1);
    
    // 音量 Envelope (快啟、指數型衰減)
    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.22);
    
    osc.start(time);
    osc.stop(time + 0.23);
  }

  // 2. Snare Drum (小鼓)
  synthesizeSnare(time, destinationNode, customPitchMultiplier = 1.0) {
    // A. 鼓框/鼓皮震動的基音 (Sine Sweep)
    const osc = this.audioCtx.createOscillator();
    const oscGain = this.audioCtx.createGain();
    osc.type = 'triangle';
    osc.connect(oscGain);
    oscGain.connect(destinationNode);
    
    const snareFreq = 180 * customPitchMultiplier * this.tapeStopProgress;
    osc.frequency.setValueAtTime(snareFreq, time);
    osc.frequency.exponentialRampToValueAtTime(80 * this.tapeStopProgress, time + 0.1);
    
    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.12);
    
    // B. 響弦雜訊 (Filtered White Noise)
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const noiseFilter = this.audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000 * customPitchMultiplier * this.tapeStopProgress;
    noiseFilter.Q.value = 1.5;
    
    const noiseGain = this.audioCtx.createGain();
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(destinationNode);
    
    noiseGain.gain.setValueAtTime(0.65, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.18);
    
    osc.start(time);
    noise.start(time);
    
    osc.stop(time + 0.2);
    noise.stop(time + 0.2);
  }

  // 3. Closed Hi-hat (閉合鈸)
  synthesizeClosedHat(time, destinationNode) {
    const source = this.audioCtx.createBufferSource();
    source.buffer = this.noiseBuffer;
    
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500 * this.tapeStopProgress;
    
    const gain = this.audioCtx.createGain();
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destinationNode);
    
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    
    source.start(time);
    source.stop(time + 0.06);
  }

  // 4. Open Hi-hat (開鈸)
  synthesizeOpenHat(time, destinationNode) {
    const source = this.audioCtx.createBufferSource();
    source.buffer = this.noiseBuffer;
    
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000 * this.tapeStopProgress;
    
    const gain = this.audioCtx.createGain();
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destinationNode);
    
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.35);
    
    source.start(time);
    source.stop(time + 0.38);
  }

  // 5. Hand Clap (鼓掌聲)
  synthesizeClap(time, destinationNode) {
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1300 * this.tapeStopProgress;
    filter.Q.value = 1.0;
    
    const gain = this.audioCtx.createGain();
    filter.connect(gain);
    gain.connect(destinationNode);

    // 模擬鼓掌的多次微弱反射 (3次短促的脈衝 + 1次長尾音)
    const bursts = [0.0, 0.015, 0.03];
    bursts.forEach((delay) => {
      const source = this.audioCtx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.connect(filter);
      
      gain.gain.setValueAtTime(0.4, time + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, time + delay + 0.02);
      
      source.start(time + delay);
      source.stop(time + delay + 0.03);
    });
    
    // 主釋放尾音
    const mainSource = this.audioCtx.createBufferSource();
    mainSource.buffer = this.noiseBuffer;
    mainSource.connect(filter);
    
    gain.gain.setValueAtTime(0.5, time + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.16);
    
    mainSource.start(time + 0.045);
    mainSource.stop(time + 0.17);
  }

  // 6. Tom Drum / Rimshot (中鼓/邊音)
  synthesizeTom(time, destinationNode, customPitchMultiplier = 1.0) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = 'sine';
    
    osc.connect(gain);
    gain.connect(destinationNode);
    
    const startFreq = 260 * customPitchMultiplier * this.tapeStopProgress;
    const endFreq = 120 * customPitchMultiplier * this.tapeStopProgress;
    
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + 0.15);
    
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
    
    osc.start(time);
    osc.stop(time + 0.26);
  }

  // 觸發特定通道的聲音
  triggerInstrument(index, time, customPitch = 1.0) {
    this.init();
    
    const hasSolo = this.channels.some(c => c.solo);
    const channel = this.channels[index];
    
    if (channel.mute) return;
    if (hasSolo && !channel.solo) return;

    const dest = this.channelGains[index];
    if (!dest) return;

    switch(index) {
      case 0: this.synthesizeKick(time, dest, customPitch); break;
      case 1: this.synthesizeSnare(time, dest, customPitch); break;
      case 2: this.synthesizeClosedHat(time, dest); break;
      case 3: this.synthesizeOpenHat(time, dest); break;
      case 4: this.synthesizeClap(time, dest); break;
      case 5: this.synthesizeTom(time, dest, customPitch); break;
    }
  }

  // ==========================================================================
  // SCHEDULER CLOCK & SEQUENCER RUNTIME
  // ==========================================================================
  
  // 啟動步進器排程
  scheduler() {
    // 預排未來 scheduleAheadTime (100ms) 內的音符
    while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);
      this.advanceNote();
    }
  }

  // 排定某一時間要發出的聲音與步進指示
  scheduleNote(step, time) {
    if (this.onStepTrigger) {
      this.onStepTrigger(step, time);
    }
  }

  // 前進到下一個音符時間點
  advanceNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    const secondsPerStep = (secondsPerBeat / 4.0) / this.tempoPitched;
    
    this.nextNoteTime += secondsPerStep;
    
    // Performance FX: Stutter 效果控制
    if (this.stutterType === '16') {
      // 1/16 重複：當前 Step 不前進
    } else if (this.stutterType === '8') {
      // 1/8 重複：只在 2 個 steps 之間來回
      const baseStep = Math.floor(this.currentStep / 2) * 2;
      const sub = this.currentStep % 2;
      this.currentStep = baseStep + ((sub + 1) % 2);
    } else {
      // 正常前進
      this.currentStep = (this.currentStep + 1) % 64;
    }
  }

  // 啟動排程定時器
  start() {
    if (this.isPlaying) return;
    this.init();
    
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.isPlaying = true;
    // 為了安全起見，將第一個音符時間稍微偏置 +0.05 秒，給予瀏覽器音訊線程足夠的啟動反應時間
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;
    
    this.schedulerTimerId = setInterval(() => {
      this.scheduler();
    }, this.lookahead);
  }

  // 停止排程
  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    clearInterval(this.schedulerTimerId);
    this.schedulerTimerId = null;
    this.currentStep = 0;
  }

  // ==========================================================================
  // DJ EFFECTS CONTROL
  // ==========================================================================

  // 主音量調整
  setMasterVolume(val) {
    this.masterVolumeVal = val / 100;
    if (this.masterVolumeNode) {
      this.masterVolumeNode.gain.setValueAtTime(this.masterVolumeVal, this.audioCtx ? this.audioCtx.currentTime : 0);
    }
  }

  // DJ 濾波器旋鈕控制
  setFilter(val) {
    this.filterKnobVal = parseFloat(val);
    if (!this.audioCtx) return;
    
    const now = this.audioCtx.currentTime;
    
    if (this.filterKnobVal === 0) {
      this.lpfNode.frequency.setValueAtTime(22000, now);
      this.hpfNode.frequency.setValueAtTime(10, now);
    } else if (this.filterKnobVal < 0) {
      // LPF 低通
      const pct = (100 + this.filterKnobVal) / 100;
      const freq = 120 + (22000 - 120) * Math.pow(pct, 3);
      this.lpfNode.frequency.setValueAtTime(freq, now);
      this.hpfNode.frequency.setValueAtTime(10, now);
    } else {
      // HPF 高通
      const pct = this.filterKnobVal / 100;
      const freq = 10 + 4000 * Math.pow(pct, 2);
      this.hpfNode.frequency.setValueAtTime(freq, now);
      this.lpfNode.frequency.setValueAtTime(22000, now);
    }
  }

  // 設置延遲效果
  setDelayTime(val) {
    this.delayTimeVal = (val / 100) * 0.8;
    if (this.delayNode) {
      this.delayNode.delayTime.setValueAtTime(this.delayTimeVal, this.audioCtx ? this.audioCtx.currentTime : 0);
    }
  }

  setDelayFeedback(val) {
    this.delayFeedbackVal = (val / 100) * 0.85;
    if (this.delayFeedbackNode) {
      this.delayFeedbackNode.gain.setValueAtTime(this.delayFeedbackVal, this.audioCtx ? this.audioCtx.currentTime : 0);
    }
  }

  // ==========================================================================
  // TAPE STOP & SCRATCH 效果實作
  // ==========================================================================

  triggerTapeStop() {
    if (!this.isPlaying || this.isTapeStopping) return;
    this.isTapeStopping = true;
    
    const stopDuration = 1.2;
    const steps = 30;
    let stepCount = 0;
    
    const interval = setInterval(() => {
      stepCount++;
      const pct = 1.0 - (stepCount / steps);
      
      this.tapeStopProgress = Math.max(0.01, pct);
      this.tempoPitched = Math.max(0.05, pct);
      
      if (stepCount >= steps) {
        clearInterval(interval);
        this.stop();
        this.tapeStopProgress = 1.0;
        this.tempoPitched = 1.0;
        this.isTapeStopping = false;
        
        if (this.onTapeStopComplete) {
          this.onTapeStopComplete();
        }
      }
    }, (stopDuration * 1000) / steps);
  }

  startScratch() {
    if (!this.isPlaying) return;
    this.isScratching = true;
    this.init();
    
    const now = this.audioCtx.currentTime;
    this.scratchOsc = this.audioCtx.createOscillator();
    this.scratchGain = this.audioCtx.createGain();
    
    this.scratchOsc.type = 'sawtooth';
    
    const scratchFilter = this.audioCtx.createBiquadFilter();
    scratchFilter.type = 'bandpass';
    scratchFilter.Q.value = 4.0;
    scratchFilter.frequency.value = 600;
    
    this.scratchOsc.connect(scratchFilter);
    scratchFilter.connect(this.scratchGain);
    this.scratchGain.connect(this.preFxNode);
    
    this.scratchGain.gain.setValueAtTime(0, now);
    this.scratchOsc.start(now);
  }

  scratch(speed) {
    if (!this.isScratching || !this.scratchOsc) return;
    
    const now = this.audioCtx.currentTime;
    const absSpeed = Math.abs(speed);
    
    if (absSpeed < 0.05) {
      this.scratchGain.gain.setTargetAtTime(0, now, 0.03);
    } else {
      const targetVolume = Math.min(0.4, absSpeed * 0.15);
      const targetFreq = Math.min(1800, 150 + absSpeed * 450);
      
      this.scratchGain.gain.setTargetAtTime(targetVolume, now, 0.02);
      this.scratchOsc.frequency.setTargetAtTime(targetFreq, now, 0.02);
    }

    this.tempoPitched = Math.max(0.1, Math.min(2.5, absSpeed * 0.8));
    
    if (absSpeed > 1.2 && Math.random() > 0.7) {
      const randomPitch = 0.5 + Math.random() * 0.8;
      if (Math.random() > 0.5) {
        this.synthesizeKick(now, this.channelGains[0], randomPitch);
      } else {
        this.synthesizeTom(now, this.channelGains[5], randomPitch);
      }
    }
  }

  stopScratch() {
    if (!this.isScratching) return;
    this.isScratching = false;
    
    const now = this.audioCtx.currentTime;
    if (this.scratchGain) {
      this.scratchGain.gain.setValueAtTime(this.scratchGain.gain.value, now);
      this.scratchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    }
    
    setTimeout(() => {
      if (this.scratchOsc) {
        try {
          this.scratchOsc.stop();
        } catch(e) {}
        this.scratchOsc.disconnect();
        this.scratchOsc = null;
      }
      this.scratchGain = null;
    }, 150);

    this.tempoPitched = 1.0;
  }
}
