// ==========================================================================
// GROOVE DECK // UI COORDINATION & INTERACTIONS
// ==========================================================================

// 全局錯誤捕獲並顯示於底部的 debug-log 區
window.onerror = function(msg, url, line, col, error) {
  const debugLog = document.getElementById('debug-log');
  if (debugLog) {
    debugLog.textContent = `SYSTEM ERROR: ${msg} (Line ${line})`;
  }
  return false;
};
window.onunhandledrejection = function(event) {
  const debugLog = document.getElementById('debug-log');
  if (debugLog) {
    debugLog.textContent = `SYSTEM PROMISE REJECTION: ${event.reason}`;
  }
};

// 初始化音訊引擎
const audio = new AudioEngine();

// 全局狀態
let currentBar = 0; // 0: Bar 1, 1: Bar 2, 2: Bar 3, 3: Bar 4
let autoFollow = true;
let grid = Array(6).fill(null).map(() => Array(64).fill(false)); // 6 rails, 64 steps

// UI 元素
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnClear = document.getElementById('btn-clear');
const btnTap = document.getElementById('btn-tap');
const bpmSlider = document.getElementById('bpm-slider');
const bpmDisplay = document.getElementById('bpm-display');
const presetSelect = document.getElementById('preset-select');
const labelPlatterBpm = document.getElementById('label-platter-bpm');
const vinylPlatter = document.getElementById('vinyl-platter');
const tonearm = document.getElementById('tonearm');
const barButtons = document.querySelectorAll('.btn-bar');
const chkFollow = document.getElementById('chk-follow');
const stepIndicatorsContainer = document.getElementById('step-indicators');
const sequencerRows = document.getElementById('sequencer-rows');
const visualizerCanvas = document.getElementById('visualizer-canvas');
const visualizerCtx = visualizerCanvas.getContext('2d');

// FX 元素
const knobFilter = document.getElementById('knob-filter');
const filterReadout = document.getElementById('filter-readout');
const delayTimeSlider = document.getElementById('delay-time');
const delayFeedbackSlider = document.getElementById('delay-feedback');
const masterVolumeSlider = document.getElementById('master-volume');
const btnStutter16 = document.getElementById('btn-stutter-16');
const btnStutter8 = document.getElementById('btn-stutter-8');
const btnTapeStop = document.getElementById('btn-tape-stop');

// ==========================================================================
// 預設節奏庫 (Presets Patterns)
// ==========================================================================
const presets = {
  // 1. Jazz Swing 爵士搖擺 (BPM 120 - 130)
  jazz: {
    bpm: 125,
    pattern: [
      // KICK: 四分音符點綴大鼓
      [0, 8, 16, 24, 32, 40, 48, 56],
      // SNARE: 爵士輕敲與切分
      [4, 10, 12, 20, 26, 28, 36, 42, 44, 52, 58, 60],
      // CLOSED HAT: 爵士搖擺三連音叮叮噠感覺 (Swing Hi-hat)
      [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48, 50, 51, 52, 54, 55, 56, 58, 59, 60, 62, 63],
      // OPEN HAT: 腳踏鈸踩合聲 (通常在 2 & 4 拍)
      [4, 12, 20, 28, 36, 44, 52, 60],
      // CLAP: 無
      [],
      // TOM/RIM: 邊音切分裝飾
      [2, 6, 9, 14, 18, 22, 25, 30, 34, 38, 41, 46, 50, 54, 57, 62]
    ]
  },
  // 2. Boom Bap 嘻哈經典 (BPM 85 - 95)
  hiphop: {
    bpm: 90,
    pattern: [
      // KICK: 重拍與切分
      [0, 8, 10, 18, 24, 26, 32, 40, 42, 50, 56, 58],
      // SNARE: 第2, 4拍重拍
      [4, 12, 20, 28, 36, 44, 52, 60],
      // CLOSED HAT: 直線8分音符，微帶搖擺
      [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62],
      // OPEN HAT: 裝飾開鈸
      [6, 14, 22, 30, 38, 46, 54, 62],
      // CLAP: 堆疊在 Snare 上
      [12, 28, 44, 60],
      // TOM: Rimshot 裝飾
      [15, 31, 47, 63]
    ]
  },
  // 3. House 浩室電子 (BPM 120 - 128)
  house: {
    bpm: 124,
    pattern: [
      // KICK: Four-to-the-floor
      [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
      // SNARE: 反拍
      [4, 12, 20, 28, 36, 44, 52, 60],
      // CLOSED HAT: 連續 16 分音符
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
      // OPEN HAT: Offbeat 反拍開鈸 (極度重要)
      [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54, 58, 62],
      // CLAP: 配合小鼓
      [4, 12, 20, 28, 36, 44, 52, 60],
      // TOM
      [14, 30, 46, 62]
    ]
  },
  // 4. Drum & Bass 疾風鼓打 (BPM 170 - 175)
  dnb: {
    bpm: 172,
    pattern: [
      // KICK
      [0, 10, 16, 26, 32, 42, 48, 58],
      // SNARE
      [4, 12, 20, 28, 36, 44, 52, 60],
      // CLOSED HAT
      [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62],
      // OPEN HAT
      [10, 22, 28, 42, 54, 60],
      // CLAP
      [12, 28, 44, 60],
      // TOM
      []
    ]
  },
  // 空白畫布
  empty: {
    bpm: 120,
    pattern: [[], [], [], [], [], []]
  }
};

// ==========================================================================
// INITIALIZATION & GENERATION
// ==========================================================================

// 初始化 UI
function initUI() {
  // 建立 16 個時間軸指示燈
  stepIndicatorsContainer.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const led = document.createElement('div');
    led.classList.add('led-indicator');
    led.dataset.step = i;
    stepIndicatorsContainer.appendChild(led);
  }

  // 建立每個樂器軌道的 16 個 Step 按鈕
  const gridRows = document.querySelectorAll('.steps-grid');
  gridRows.forEach((rowDiv) => {
    const rowIndex = parseInt(rowDiv.dataset.row);
    rowDiv.innerHTML = '';
    
    for (let s = 0; s < 16; s++) {
      const pad = document.createElement('div');
      pad.classList.add('step-pad');
      pad.dataset.step = s;
      
      // 點擊觸發 toggle
      pad.addEventListener('click', () => {
        toggleStep(rowIndex, s);
      });
      
      rowDiv.appendChild(pad);
    }
  });

  // 載入預設爵士鼓點
  loadPreset('jazz');
  updateGridUI();
  setupCanvas();
}

// 載入預設模式
function loadPreset(key) {
  const preset = presets[key];
  if (!preset) return;
  
  // 更新 BPM
  audio.bpm = preset.bpm;
  bpmSlider.value = preset.bpm;
  bpmDisplay.textContent = preset.bpm;
  labelPlatterBpm.textContent = preset.bpm;

  // 清空並重新寫入
  grid = Array(6).fill(null).map(() => Array(64).fill(false));
  for (let inst = 0; inst < 6; inst++) {
    const activeSteps = preset.pattern[inst];
    if (activeSteps) {
      activeSteps.forEach(step => {
        grid[inst][step] = true;
      });
    }
  }
  updateGridUI();
}

// 切換步進點狀態
function toggleStep(instIndex, localStep) {
  const globalStep = currentBar * 16 + localStep;
  grid[instIndex][globalStep] = !grid[instIndex][globalStep];
  
  // 觸發音效試聽 (僅在非播放狀態下，點擊時單發聲音)
  if (!audio.isPlaying) {
    audio.init();
    if (audio.audioCtx.state === 'suspended') audio.audioCtx.resume();
    audio.triggerInstrument(instIndex, audio.audioCtx.currentTime);
  }
  
  updateGridUI();
}

// 根據 currentBar 更新畫面上 16 個按鈕的 Active 狀態
function updateGridUI() {
  const gridRows = document.querySelectorAll('.steps-grid');
  gridRows.forEach((rowDiv) => {
    const rowIndex = parseInt(rowDiv.dataset.row);
    const pads = rowDiv.querySelectorAll('.step-pad');
    
    pads.forEach((pad, localStep) => {
      const globalStep = currentBar * 16 + localStep;
      if (grid[rowIndex][globalStep]) {
        pad.classList.add('active');
      } else {
        pad.classList.remove('active');
      }
    });
  });
}

// ==========================================================================
// TRANSPORT CONTROLS (播放/停止)
// ==========================================================================

// 播放與暫停
function togglePlayback() {
  audio.init();
  if (audio.isPlaying) {
    audio.stop();
    btnPlay.innerHTML = '<span class="icon">▶</span> PLAY';
    btnPlay.classList.remove('playing');
    vinylPlatter.classList.remove('spinning');
    // 回復唱臂
    tonearm.style.transform = 'rotate(5deg)';
  } else {
    audio.start();
    btnPlay.innerHTML = '<span class="icon">⏸</span> PAUSE';
    btnPlay.classList.add('playing');
    vinylPlatter.classList.add('spinning');
    
    // 馬達啟動，旋轉速率對應 BPM (以 33 RPM 為基礎縮放)
    const spinDuration = (60 / audio.bpm) * 4; // 1小節轉1圈
    vinylPlatter.style.animationDuration = `${spinDuration}s`;
    
    // 擺動唱臂到唱片上
    tonearm.style.transform = 'rotate(22deg)';
  }
}

btnPlay.addEventListener('click', togglePlayback);

btnStop.addEventListener('click', () => {
  audio.stop();
  btnPlay.innerHTML = '<span class="icon">▶</span> PLAY';
  btnPlay.classList.remove('playing');
  vinylPlatter.classList.remove('spinning');
  tonearm.style.transform = 'rotate(5deg)';
  
  // 重設視覺指針
  const leds = document.querySelectorAll('.led-indicator');
  leds.forEach(led => led.classList.remove('active'));
  
  // 回到 Bar 1
  switchBar(0);
});

btnClear.addEventListener('click', () => {
  grid = Array(6).fill(null).map(() => Array(64).fill(false));
  updateGridUI();
});

// BPM Slider
bpmSlider.addEventListener('input', (e) => {
  const bpm = parseInt(e.target.value);
  audio.bpm = bpm;
  bpmDisplay.textContent = bpm;
  labelPlatterBpm.textContent = bpm;
  
  // 動態修改旋轉動畫速度
  if (audio.isPlaying) {
    const spinDuration = (60 / bpm) * 4;
    vinylPlatter.style.animationDuration = `${spinDuration}s`;
  }
});

// Preset Select
presetSelect.addEventListener('change', (e) => {
  loadPreset(e.target.value);
});

// ==========================================================================
// BAR SELECTION & TIMING SYNCHRONIZATION
// ==========================================================================

function switchBar(barIndex) {
  currentBar = parseInt(barIndex);
  barButtons.forEach((btn, idx) => {
    if (idx === currentBar) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  updateGridUI();
}

barButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    switchBar(e.target.dataset.bar);
  });
});

chkFollow.addEventListener('change', (e) => {
  autoFollow = e.target.checked;
});

// Tap Tempo 功能
let tapTimes = [];
btnTap.addEventListener('click', () => {
  const now = performance.now();
  tapTimes.push(now);
  if (tapTimes.length > 4) {
    tapTimes.shift();
  }
  if (tapTimes.length > 1) {
    let deltas = [];
    for (let i = 1; i < tapTimes.length; i++) {
      deltas.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgDelta = deltas.reduce((a, b) => a + b) / deltas.length;
    const bpm = Math.round(60000 / avgDelta);
    if (bpm >= 60 && bpm <= 180) {
      audio.bpm = bpm;
      bpmSlider.value = bpm;
      bpmDisplay.textContent = bpm;
      labelPlatterBpm.textContent = bpm;
    }
  }
});

// ==========================================================================
// WEB AUDIO SCHEDULER CALLBACK (音訊與 UI 精確視覺同步)
// ==========================================================================

audio.onStepTrigger = (step, time) => {
  // 1. 在排程的未來時間，精確觸發聲音合成
  for (let i = 0; i < 6; i++) {
    if (grid[i][step]) {
      // 檢查是否包含 Tom/Rim 做點小動態音高變化，讓 Jazz 更有層次
      let pitchMod = 1.0;
      if (i === 5) {
        // Tom 鼓做點隨機音高，創造旋律感
        pitchMod = 0.8 + (step % 4) * 0.15;
      }
      audio.triggerInstrument(i, time, pitchMod);
      
      // 若是大鼓(Kick) 擊中，讓唱盤中心標籤跟著 pulsing 擴大
      if (i === 0) {
        const delayMs = Math.max(0, (time - audio.audioCtx.currentTime) * 1000);
        setTimeout(() => {
          pulsePlatter();
        }, delayMs);
      }
    }
  }

  // 2. 計算精確的時差，以便在音效播放的「那一刻」點亮 UI 指示燈
  const delayMs = Math.max(0, (time - audio.audioCtx.currentTime) * 1000);
  setTimeout(() => {
    updateVisualIndicators(step);
  }, delayMs);
};

// 唱片搏動特效
function pulsePlatter() {
  const label = document.querySelector('.vinyl-center-label');
  label.style.transform = 'translate(-50%, -50%) scale(1.08)';
  setTimeout(() => {
    label.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 100);
}

// UI 步進燈更新
function updateVisualIndicators(step) {
  const stepBar = Math.floor(step / 16);
  const localStep = step % 16;
  
  // 如果開啟自動跟隨，且小節切換了，更新當前小節面板
  if (autoFollow && stepBar !== currentBar) {
    switchBar(stepBar);
  }

  // 僅當 step 處於目前顯示的小節時，才點亮指示燈
  if (stepBar === currentBar) {
    const leds = document.querySelectorAll('.led-indicator');
    leds.forEach((led, idx) => {
      if (idx === localStep) {
        led.classList.add('active');
      } else {
        led.classList.remove('active');
      }
    });
  }
}

// ==========================================================================
// DJ MIXER & FX CONTROLS
// ==========================================================================

// Master Volume Slider
masterVolumeSlider.addEventListener('input', (e) => {
  audio.setMasterVolume(e.target.value);
});

// DJ Bi-directional Filter Knob
knobFilter.addEventListener('input', (e) => {
  const val = parseInt(e.target.value);
  audio.setFilter(val);
  
  if (val === 0) {
    filterReadout.textContent = "BYPASS";
    filterReadout.style.color = "var(--neon-cyan)";
  } else if (val < 0) {
    filterReadout.textContent = `LPF ${Math.abs(val)}%`;
    filterReadout.style.color = "var(--neon-orange)";
  } else {
    filterReadout.textContent = `HPF ${val}%`;
    filterReadout.style.color = "var(--neon-magenta)";
  }
});

// Delay FX
delayTimeSlider.addEventListener('input', (e) => {
  audio.setDelayTime(e.target.value);
});
delayFeedbackSlider.addEventListener('input', (e) => {
  audio.setDelayFeedback(e.target.value);
});

// Stutter Loop Roll (按住觸發)
function setupStutterButton(btn, type) {
  const startFx = (e) => {
    e.preventDefault();
    audio.init();
    audio.stutterType = type;
    btn.classList.add('active');
  };
  
  const endFx = (e) => {
    e.preventDefault();
    audio.stutterType = null;
    btn.classList.remove('active');
  };

  btn.addEventListener('mousedown', startFx);
  btn.addEventListener('touchstart', startFx, { passive: false });
  btn.addEventListener('mouseup', endFx);
  btn.addEventListener('mouseleave', endFx);
  btn.addEventListener('touchend', endFx);
}

setupStutterButton(btnStutter16, '16');
setupStutterButton(btnStutter8, '8');

// Tape Stop 按鈕
btnTapeStop.addEventListener('click', () => {
  audio.init();
  if (audio.isPlaying) {
    btnTapeStop.classList.add('active');
    audio.triggerTapeStop();
  }
});

// 當 Tape Stop 完成減速停止後，重置按鈕狀態
audio.onTapeStopComplete = () => {
  btnTapeStop.classList.remove('active');
  btnPlay.innerHTML = '<span class="icon">▶</span> PLAY';
  btnPlay.classList.remove('playing');
  vinylPlatter.classList.remove('spinning');
  tonearm.style.transform = 'rotate(5deg)';
};

// Mute & Solo 按鈕
function setupChannelStripControls() {
  const rows = document.querySelectorAll('.sequencer-row');
  rows.forEach((row, index) => {
    const btnMute = row.querySelector('.btn-mute');
    const btnSolo = row.querySelector('.btn-solo');
    
    btnMute.addEventListener('click', () => {
      audio.channels[index].mute = !audio.channels[index].mute;
      btnMute.classList.toggle('active', audio.channels[index].mute);
      audio.updateChannelVolumes();
    });

    btnSolo.addEventListener('click', () => {
      audio.channels[index].solo = !audio.channels[index].solo;
      btnSolo.classList.toggle('active', audio.channels[index].solo);
      audio.updateChannelVolumes();
    });
  });
}
setupChannelStripControls();

// ==========================================================================
// TURNTABLE DRAGGING (SCRATCHING 刮碟演算法)
// ==========================================================================

let isDragging = false;
let startAngle = 0;
let lastAngle = 0;
let platterRotation = 0; // 當前唱盤的旋轉累積弧度
let lastTime = 0;
let velocity = 0;

function getAngle(clientX, clientY) {
  const rect = vinylPlatter.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(clientY - cy, clientX - cx);
}

function handleStart(clientX, clientY) {
  if (!audio.isPlaying) return; // 播放時才能刮碟
  
  isDragging = true;
  vinylPlatter.classList.add('grabbing');
  vinylPlatter.classList.remove('spinning'); // 暫停 CSS spinning

  startAngle = getAngle(clientX, clientY);
  lastAngle = startAngle;
  lastTime = performance.now();
  velocity = 0;
  
  // 獲取當前轉盤在旋轉過程中的精確 transform 矩陣弧度
  const style = window.getComputedStyle(vinylPlatter);
  const transform = style.getPropertyValue('transform');
  if (transform && transform !== 'none') {
    const values = transform.split('(')[1].split(')')[0].split(',');
    const a = parseFloat(values[0]);
    const b = parseFloat(values[1]);
    platterRotation = Math.atan2(b, a);
  } else {
    platterRotation = 0;
  }
  
  audio.startScratch();
}

function handleMove(clientX, clientY) {
  if (!isDragging) return;
  
  const currentAngle = getAngle(clientX, clientY);
  const now = performance.now();
  const dt = Math.max(1, now - lastTime); // 避免除以 0

  // 計算角度差值，解決 -PI 到 PI 的突變邊界問題
  let dAngle = currentAngle - lastAngle;
  if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
  if (dAngle < -Math.PI) dAngle += 2 * Math.PI;

  // 更新轉盤物理旋轉角度
  platterRotation += dAngle;
  vinylPlatter.style.transform = `rotate(${platterRotation}rad)`;

  // 計算角速度 (速度 = 弧度差 / 時間毫秒 * 100)
  velocity = (dAngle / dt) * 120;
  
  // 送入音效引擎
  audio.scratch(velocity);

  lastAngle = currentAngle;
  lastTime = now;
}

function handleEnd() {
  if (!isDragging) return;
  isDragging = false;
  
  vinylPlatter.classList.remove('grabbing');
  audio.stopScratch();
  
  if (audio.isPlaying) {
    // 重新接回 CSS 旋轉動畫，從當前角度繼續
    vinylPlatter.classList.add('spinning');
    vinylPlatter.style.transform = 'none'; // 交給 CSS animation 控制
  }
}

// 綁定唱盤事件
vinylPlatter.addEventListener('mousedown', (e) => {
  handleStart(e.clientX, e.clientY);
});
window.addEventListener('mousemove', (e) => {
  handleMove(e.clientX, e.clientY);
});
window.addEventListener('mouseup', handleEnd);

// Touch 觸控支援
vinylPlatter.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    handleStart(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (isDragging && e.touches.length === 1) {
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: false });

window.addEventListener('touchend', handleEnd);

// ==========================================================================
// SCREEN LED VISUALIZER CANVAS LOOP (頻率視覺化)
// ==========================================================================

function setupCanvas() {
  // 自動適配畫布的高解析度模糊問題
  const dpr = window.devicePixelRatio || 1;
  const rect = visualizerCanvas.getBoundingClientRect();
  visualizerCanvas.width = rect.width * dpr;
  visualizerCanvas.height = rect.height * dpr;
  visualizerCtx.scale(dpr, dpr);
}

window.addEventListener('resize', setupCanvas);

function updateAudioStatus() {
  const badge = document.getElementById('audio-status');
  if (!badge) return;
  if (!audio.audioCtx) {
    badge.textContent = "AUDIO: OFFLINE";
    badge.className = "audio-status-badge offline";
  } else {
    const state = audio.audioCtx.state;
    badge.textContent = `AUDIO: ${state.toUpperCase()}`;
    badge.className = `audio-status-badge ${state}`;
  }
}

function renderVisualizer() {
  requestAnimationFrame(renderVisualizer);
  updateAudioStatus();
  
  const width = visualizerCanvas.width / (window.devicePixelRatio || 1);
  const height = visualizerCanvas.height / (window.devicePixelRatio || 1);
  
  // 清除背景 (加上微弱半透明黑色創造尾波效果)
  visualizerCtx.fillStyle = 'rgba(4, 4, 6, 0.2)';
  visualizerCtx.fillRect(0, 0, width, height);

  if (!audio.audioCtx || !audio.isPlaying) {
    // 未播放時，繪製一條亮綠色虛擬水平底線
    visualizerCtx.lineWidth = 2;
    visualizerCtx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
    visualizerCtx.beginPath();
    visualizerCtx.moveTo(0, height / 2);
    visualizerCtx.lineTo(width, height / 2);
    visualizerCtx.stroke();
    return;
  }

  // 取得音訊分析數據
  const bufferLength = audio.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  // 根據當前濾波狀態繪製不同圖形 (刮碟時用 Waveform，普通用 Frequency)
  if (audio.isScratching) {
    audio.analyser.getByteTimeDomainData(dataArray);
    
    // 繪製波形線 (Oscilloscope)
    visualizerCtx.lineWidth = 2.5;
    visualizerCtx.strokeStyle = 'var(--neon-magenta)';
    visualizerCtx.shadowBlur = 8;
    visualizerCtx.shadowColor = 'rgba(255, 0, 127, 0.8)';
    visualizerCtx.beginPath();
    
    const sliceWidth = width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0; // range 0 to 2
      const y = (v * height) / 2;
      
      if (i === 0) {
        visualizerCtx.moveTo(x, y);
      } else {
        visualizerCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    
    visualizerCtx.lineTo(width, height / 2);
    visualizerCtx.stroke();
    visualizerCtx.shadowBlur = 0; // 重置 shadow
  } else {
    audio.analyser.getByteFrequencyData(dataArray);
    
    // 繪製對稱式霓虹 LED 柱狀圖
    const barWidth = (width / (bufferLength / 2)) * 1.6;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < bufferLength / 2; i++) {
      barHeight = (dataArray[i] / 255) * height * 0.95;
      
      // 漸變顏色
      const gradient = visualizerCtx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, '#00f2fe');
      gradient.addColorStop(0.5, '#7209b7');
      gradient.addColorStop(1, '#ff007f');
      
      visualizerCtx.fillStyle = gradient;
      // 繪製發光圓角柱狀
      visualizerCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
      
      x += barWidth;
    }
  }
}

// TEST 按鈕繞過排程直接測試聲音與 AudioContext
const btnTest = document.getElementById('btn-test');
btnTest.addEventListener('click', (e) => {
  e.stopPropagation(); // 防止冒泡
  audio.init();
  if (audio.audioCtx.state === 'suspended') {
    audio.audioCtx.resume();
  }
  const now = audio.audioCtx.currentTime;
  
  // 直接連接一個振盪器至 Destination (繞過所有的 Mixer)
  const osc = audio.audioCtx.createOscillator();
  const gainNode = audio.audioCtx.createGain();
  
  osc.connect(gainNode);
  gainNode.connect(audio.audioCtx.destination);
  
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
  gainNode.gain.setValueAtTime(0.8, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
  
  osc.start(now);
  osc.stop(now + 0.25);
  
  const debugLog = document.getElementById('debug-log');
  if (debugLog) {
    debugLog.textContent = `🔊 TEST TONE SENT. Context State: ${audio.audioCtx.state.toUpperCase()}`;
    setTimeout(() => {
      debugLog.textContent = "";
    }, 3000);
  }
});

// 全局點擊防禦：隨時在點擊時嘗試恢復 suspended 的 Context
document.body.addEventListener('click', () => {
  if (audio.audioCtx && audio.audioCtx.state === 'suspended') {
    audio.audioCtx.resume();
  }
});

// 啟動 UI 與 Canvas
initUI();
renderVisualizer();
