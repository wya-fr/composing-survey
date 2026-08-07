/* survey-app.js */

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE & CONFIG ---
  let currentStep = 1;
  const totalSteps = 4;
  
  // Default Settings (if not in localStorage)
  const defaultSettings = {
    mode: 'apps-script', // 'json', 'apps-script', 'google', 'firebase'
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxATU3xIeUw749LyK8aJ-X3ctuihnhHSQR_tYmDL0i_EdxU1P5fCtqq6JMX3QIg6hU61Q/exec',
    googleUrl: '',
    googleEntries: {
      instrument: 'entry.1000001',
      method: 'entry.1000002',
      experience: 'entry.1000003',
      problems: 'entry.1000004',
      combo: 'entry.1000005',
      scenario: 'entry.1000006',
      solve: 'entry.1000007',
      support: 'entry.1000008',
      suggestions: 'entry.1000009'
    },
    firebaseConfig: ''
  };

  // Load Settings from LocalStorage (automatically apply new Web App URL if empty)
  let settings = JSON.parse(localStorage.getItem('survey_settings'));
  if (!settings || !settings.appsScriptUrl) {
    settings = { ...defaultSettings };
    localStorage.setItem('survey_settings', JSON.stringify(settings));
  }

  // --- ELEMENT REFERENCES ---
  const form = document.getElementById('survey-form');
  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4')
  ];
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-btn');
  const successScreen = document.getElementById('success-screen');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const stepNumberText = document.getElementById('step-number-text');
  const stepPercentage = document.getElementById('step-percentage');
  const restartSurveyBtn = document.getElementById('restart-survey-btn');

  // "Other" input bindings
  const instOtherCheckbox = document.getElementById('inst-other-checkbox');
  const instOtherInput = document.getElementById('inst-other-input');
  const methodOtherRadio = document.getElementById('method-other-radio');
  const methodOtherInput = document.getElementById('method-other-input');
  const comboOtherCheckbox = document.getElementById('combo-other-checkbox');
  const comboOtherInput = document.getElementById('combo-other-input');
  const solveOtherCheckbox = document.getElementById('solve-other-checkbox');
  const solveOtherInput = document.getElementById('solve-other-input');

  // Settings elements
  const adminSettingsBtn = document.getElementById('admin-settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const storageModeSelect = document.getElementById('storage-mode');
  
  // Storage settings panels
  const appsScriptSettingsDiv = document.getElementById('apps-script-settings');
  const appsScriptUrlInput = document.getElementById('apps-script-url');
  
  const googleSettingsDiv = document.getElementById('google-settings');
  const googleFormUrlInput = document.getElementById('google-form-url');
  
  const firebaseSettingsDiv = document.getElementById('firebase-settings');
  const firebaseConfigJsonTextarea = document.getElementById('firebase-config-json');
  
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const resetSettingsBtn = document.getElementById('reset-settings-btn');

  // Google entries inputs
  const gEntriesInputs = {
    instrument: document.getElementById('g-entry-instrument'),
    method: document.getElementById('g-entry-method'),
    experience: document.getElementById('g-entry-experience'),
    problems: document.getElementById('g-entry-problems'),
    combo: document.getElementById('g-entry-combo'),
    scenario: document.getElementById('g-entry-scenario'),
    solve: document.getElementById('g-entry-solve'),
    support: document.getElementById('g-entry-support'),
    suggestions: document.getElementById('g-entry-suggestions')
  };

  // Success Local Panel
  const localExportPanel = document.getElementById('local-export-panel');
  const copyJsonBtn = document.getElementById('copy-json-btn');
  const jsonPreview = document.getElementById('json-preview');

  // --- INITIALIZATION ---
  initSettingsUI();
  initLimits();
  loadDraft();
  updateStepUI();

  // Listen to changes to save drafts
  form.addEventListener('change', saveDraft);
  form.addEventListener('input', saveDraft);

  // --- NAVIGATION LOGIC ---
  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      updateStepUI();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (validateStep(currentStep)) {
      if (currentStep < totalSteps) {
        currentStep++;
        updateStepUI();
      }
    } else {
      triggerShake();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (validateStep(4)) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> 提交中...';
      try {
        const answers = collectAnswers();
        await handleSubmission(answers);
        showSuccess(answers);
      } catch (err) {
        alert('提交失敗，請檢查設定與網路連線！\n錯誤資訊：' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 提交問卷';
      }
    } else {
      triggerShake();
    }
  });

  restartSurveyBtn.addEventListener('click', () => {
    localStorage.removeItem('survey_draft');
    form.reset();
    
    // Hide other inputs
    instOtherInput.classList.add('hidden');
    methodOtherInput.classList.add('hidden');
    comboOtherInput.classList.add('hidden');
    solveOtherInput.classList.add('hidden');
    
    // Reset limits & disabled classes
    initLimits();

    currentStep = 1;
    successScreen.classList.add('hidden');
    form.classList.remove('hidden');
    document.querySelector('header').classList.remove('hidden');
    document.querySelector('.w-full.h-2').parentElement.classList.remove('hidden');
    updateStepUI();
  });

  // --- "OTHER" CHECKS LOGIC ---
  instOtherCheckbox.addEventListener('change', function() {
    toggleOtherInput(this, instOtherInput);
  });

  // Handle Radio Button "Other" toggle (special logic for radio group)
  document.querySelectorAll('input[name="method"]').forEach(radio => {
    radio.addEventListener('change', function() {
      if (methodOtherRadio.checked) {
        methodOtherInput.classList.remove('hidden');
        methodOtherInput.required = true;
        methodOtherInput.focus();
      } else {
        methodOtherInput.classList.add('hidden');
        methodOtherInput.required = false;
        methodOtherInput.value = '';
      }
    });
  });

  comboOtherCheckbox.addEventListener('change', function() {
    toggleOtherInput(this, comboOtherInput);
  });

  solveOtherCheckbox.addEventListener('change', function() {
    toggleOtherInput(this, solveOtherInput);
  });

  function toggleOtherInput(checkbox, inputElement) {
    if (checkbox.checked) {
      inputElement.classList.remove('hidden');
      inputElement.required = true;
      inputElement.focus();
    } else {
      inputElement.classList.add('hidden');
      inputElement.required = false;
      inputElement.value = '';
    }
  }

  // --- SELECTION LIMITS LOGIC ---
  function initLimits() {
    // Q4: Problems max 4
    setupCheckboxLimit('problems', 4);
    // Q5: Combo max 3
    setupCheckboxLimit('combo', 3);
  }

  function setupCheckboxLimit(name, limit) {
    const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
    const updateLimitState = () => {
      const checkedCount = document.querySelectorAll(`input[name="${name}"]:checked`).length;
      checkboxes.forEach(otherCb => {
        if (!otherCb.checked) {
          otherCb.disabled = checkedCount >= limit;
          if (checkedCount >= limit) {
            otherCb.parentElement.classList.add('opacity-40', 'cursor-not-allowed');
            otherCb.parentElement.classList.remove('hover:bg-slate-950/80');
          } else {
            otherCb.parentElement.classList.remove('opacity-40', 'cursor-not-allowed');
            otherCb.parentElement.classList.add('hover:bg-slate-950/80');
          }
        } else {
          otherCb.disabled = false;
          otherCb.parentElement.classList.remove('opacity-40', 'cursor-not-allowed');
        }
      });
    };
    
    checkboxes.forEach(cb => {
      cb.addEventListener('change', updateLimitState);
    });
    
    // Run once initially
    updateLimitState();
  }

  // --- VISUAL UI UPDATES ---
  function updateStepUI() {
    // Show/hide steps
    steps.forEach((step, index) => {
      if (index === currentStep - 1) {
        step.classList.remove('hidden');
      } else {
        step.classList.add('hidden');
      }
    });

    // Update buttons
    if (currentStep === 1) {
      prevBtn.classList.add('invisible');
    } else {
      prevBtn.classList.remove('invisible');
    }

    if (currentStep === totalSteps) {
      nextBtn.classList.add('hidden');
      submitBtn.classList.remove('hidden');
    } else {
      nextBtn.classList.remove('hidden');
      submitBtn.classList.add('hidden');
    }

    // Update progress bar
    const percent = Math.round((currentStep / totalSteps) * 100);
    progressBarFill.style.width = `${percent}%`;
    stepPercentage.innerText = `${percent}%`;
    
    const stepTitles = [
      '第一部分：社團背景與角色',
      '第二部分：練團合奏與編曲痛點',
      '第三部分：具體經歷與途徑',
      '第四部分：學習期望與回饋'
    ];
    stepNumberText.innerText = `${stepTitles[currentStep - 1]} (共 ${totalSteps} 步)`;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function triggerShake() {
    const activeStep = steps[currentStep - 1];
    activeStep.classList.add('shake-animation');
    setTimeout(() => {
      activeStep.classList.remove('shake-animation');
    }, 300);
  }

  // --- VALIDATION LOGIC ---
  function validateStep(step) {
    let isValid = true;
    clearErrors();

    if (step === 1) {
      // Q1: Instrument Role
      const instSelected = document.querySelectorAll('input[name="instrument"]:checked');
      if (instSelected.length === 0) {
        showError('instrument-role-group');
        isValid = false;
      }
      if (instOtherCheckbox.checked && !instOtherInput.value.trim()) {
        showError(instOtherInput);
        isValid = false;
      }

      // Q2: Method
      const methodSelected = document.querySelector('input[name="method"]:checked');
      if (!methodSelected) {
        showError('method-group');
        isValid = false;
      }
      if (methodOtherRadio.checked && !methodOtherInput.value.trim()) {
        showError(methodOtherInput);
        isValid = false;
      }

      // Q3: Experience
      const expSelected = document.querySelector('input[name="experience"]:checked');
      if (!expSelected) {
        showError('experience-group');
        isValid = false;
      }
    } 
    else if (step === 2) {
      // Q4: Problems
      const probSelected = document.querySelectorAll('input[name="problems"]:checked');
      if (probSelected.length === 0) {
        showError('problems-group');
        isValid = false;
      }

      // Q5: Combo
      const comboSelected = document.querySelectorAll('input[name="combo"]:checked');
      if (comboSelected.length === 0) {
        showError('combo-group');
        isValid = false;
      }
      if (comboOtherCheckbox.checked && !comboOtherInput.value.trim()) {
        showError(comboOtherInput);
        isValid = false;
      }
    } 
    else if (step === 3) {
      // Q6: Scenario
      const scenarioInput = document.getElementById('scenario-input');
      if (!scenarioInput.value.trim()) {
        showError(scenarioInput);
        isValid = false;
      }

      // Q7: Solve
      const solveSelected = document.querySelectorAll('input[name="solve"]:checked');
      if (solveSelected.length === 0) {
        showError('solve-group');
        isValid = false;
      }
      if (solveOtherCheckbox.checked && !solveOtherInput.value.trim()) {
        showError(solveOtherInput);
        isValid = false;
      }
    } 
    else if (step === 4) {
      // Q8: Support
      const supportSelected = document.querySelectorAll('input[name="support"]:checked');
      if (supportSelected.length === 0) {
        showError('support-group');
        isValid = false;
      }
    }

    return isValid;
  }

  function showError(elementOrId) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (el) {
      el.classList.add('error-border');
      const errText = el.parentElement.querySelector('.error-msg');
      if (errText) errText.classList.remove('hidden');
    }
  }

  function clearErrors() {
    document.querySelectorAll('.error-border').forEach(el => el.classList.remove('error-border'));
    document.querySelectorAll('.error-msg').forEach(el => el.classList.add('hidden'));
  }

  // --- DRAFT CACHING (localStorage) ---
  function saveDraft() {
    const data = collectAnswers();
    localStorage.setItem('survey_draft', JSON.stringify(data));
  }

  // Reload draft into DOM fields
  function loadDraft() {
    const draftStr = localStorage.getItem('survey_draft');
    if (!draftStr) return;

    try {
      const draft = JSON.parse(draftStr);

      // Restore Q1 (Instrument)
      if (draft.instrument && Array.isArray(draft.instrument)) {
        draft.instrument.forEach(val => {
          const cb = document.querySelector(`input[name="instrument"][value="${val}"]`);
          if (cb) {
            cb.checked = true;
          } else {
            instOtherCheckbox.checked = true;
            instOtherInput.value = val;
            instOtherInput.classList.remove('hidden');
          }
        });
      }

      // Restore Q2 (Method)
      if (draft.method) {
        const rad = document.querySelector(`input[name="method"][value="${draft.method}"]`);
        if (rad) {
          rad.checked = true;
        } else {
          methodOtherRadio.checked = true;
          methodOtherInput.value = draft.method;
          methodOtherInput.classList.remove('hidden');
        }
      }

      // Restore Q3 (Experience)
      if (draft.experience) {
        const rad = document.querySelector(`input[name="experience"][value="${draft.experience}"]`);
        if (rad) rad.checked = true;
      }

      // Restore Q4 (Problems)
      if (draft.problems && Array.isArray(draft.problems)) {
        draft.problems.forEach(val => {
          const cb = document.querySelector(`input[name="problems"][value="${val}"]`);
          if (cb) cb.checked = true;
        });
      }

      // Restore Q5 (Combo)
      if (draft.combo && Array.isArray(draft.combo)) {
        draft.combo.forEach(val => {
          const cb = document.querySelector(`input[name="combo"][value="${val}"]`);
          if (cb) {
            cb.checked = true;
          } else {
            comboOtherCheckbox.checked = true;
            comboOtherInput.value = val;
            comboOtherInput.classList.remove('hidden');
          }
        });
      }

      // Restore Q6
      if (draft.scenario) {
        document.getElementById('scenario-input').value = draft.scenario;
      }

      // Restore Q7
      if (draft.solve && Array.isArray(draft.solve)) {
        draft.solve.forEach(val => {
          const cb = document.querySelector(`input[name="solve"][value="${val}"]`);
          if (cb) {
            cb.checked = true;
          } else {
            solveOtherCheckbox.checked = true;
            solveOtherInput.value = val;
            solveOtherInput.classList.remove('hidden');
          }
        });
      }

      // Restore Q8
      if (draft.support && Array.isArray(draft.support)) {
        draft.support.forEach(val => {
          const cb = document.querySelector(`input[name="support"][value="${val}"]`);
          if (cb) cb.checked = true;
        });
      }

      // Restore Q9
      if (draft.suggestions) {
        document.getElementById('suggestions-input').value = draft.suggestions;
      }

      // Dispatch events to refresh limit states
      setTimeout(() => {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.dispatchEvent(new Event('change'));
        });
      }, 50);

    } catch (e) {
      console.warn("Failed to load survey draft:", e);
    }
  }

  // --- DATA COLLECTION ---
  function collectAnswers() {
    // Q1
    const instruments = [];
    document.querySelectorAll('input[name="instrument"]:checked').forEach(cb => {
      if (cb.id !== 'inst-other-checkbox') {
        instruments.push(cb.value);
      }
    });
    if (instOtherCheckbox.checked && instOtherInput.value.trim()) {
      instruments.push(instOtherInput.value.trim());
    }

    // Q2
    let method = '';
    const methodEl = document.querySelector('input[name="method"]:checked');
    if (methodEl) {
      if (methodEl.id === 'method-other-radio' && methodOtherInput.value.trim()) {
        method = methodOtherInput.value.trim();
      } else {
        method = methodEl.value;
      }
    }

    // Q3
    const expEl = document.querySelector('input[name="experience"]:checked');
    const experience = expEl ? expEl.value : '';

    // Q4
    const problems = Array.from(document.querySelectorAll('input[name="problems"]:checked')).map(cb => cb.value);

    // Q5
    const combos = [];
    document.querySelectorAll('input[name="combo"]:checked').forEach(cb => {
      if (cb.id !== 'combo-other-checkbox') {
        combos.push(cb.value);
      }
    });
    if (comboOtherCheckbox.checked && comboOtherInput.value.trim()) {
      combos.push(comboOtherInput.value.trim());
    }

    // Q6
    const scenario = document.getElementById('scenario-input').value.trim();

    // Q7
    const solves = [];
    document.querySelectorAll('input[name="solve"]:checked').forEach(cb => {
      if (cb.id !== 'solve-other-checkbox') {
        solves.push(cb.value);
      }
    });
    if (solveOtherCheckbox.checked && solveOtherInput.value.trim()) {
      solves.push(solveOtherInput.value.trim());
    }

    // Q8
    const support = Array.from(document.querySelectorAll('input[name="support"]:checked')).map(cb => cb.value);

    // Q9
    const suggestions = document.getElementById('suggestions-input').value.trim();

    return {
      timestamp: new Date().toISOString(),
      instrument: instruments,
      method,
      experience,
      problems,
      combo: combos,
      scenario,
      solve: solves,
      support,
      suggestions
    };
  }

  // --- SUBMISSION HANDLER ---
  async function handleSubmission(answers) {
    if (settings.mode === 'json') {
      // Local Download Mode
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(answers, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `社團合奏問卷回覆_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      return true;
    }

    if (settings.mode === 'apps-script') {
      // Google Sheets Apps Script Mode
      if (!settings.appsScriptUrl) {
        throw new Error('未設定 Google Apps Script Web App URL，請點擊右上角齒輪設定！');
      }

      const scriptUrl = settings.appsScriptUrl;

      // Send to Apps Script using no-cors to avoid pre-flight options redirect blocking
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(answers)
      });
      return true;
    }
    
    if (settings.mode === 'google') {
      // Google Forms Submit Mode
      if (!settings.googleUrl) {
        throw new Error('未設定 Google Form URL，請點擊右上角齒輪設定！');
      }

      const formUrl = settings.googleUrl;
      const data = new URLSearchParams();
      
      // Mapping fields
      data.append(settings.googleEntries.instrument, answers.instrument.join(', '));
      data.append(settings.googleEntries.method, translateMethodValue(answers.method));
      data.append(settings.googleEntries.experience, translateExpValue(answers.experience));
      data.append(settings.googleEntries.problems, answers.problems.join(', '));
      data.append(settings.googleEntries.combo, answers.combo.join(', '));
      data.append(settings.googleEntries.scenario, answers.scenario);
      data.append(settings.googleEntries.solve, answers.solve.join(', '));
      data.append(settings.googleEntries.support, answers.support.join(', '));
      data.append(settings.googleEntries.suggestions, answers.suggestions || '');

      // Send via CORS-free method
      await fetch(formUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: data
      });
      return true;
    }

    if (settings.mode === 'firebase') {
      // Firebase Firestore Mode
      if (!settings.firebaseConfig) {
        throw new Error('未設定 Firebase Config，請點擊右上角齒輪設定！');
      }
      
      // Dynamic load Firebase if not loaded yet
      if (typeof firebase === 'undefined') {
        await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
        await loadScript('https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js');
      }

      // Initialize Firebase App if not done
      if (firebase.apps.length === 0) {
        const config = JSON.parse(settings.firebaseConfig);
        firebase.initializeApp(config);
      }

      const db = firebase.firestore();
      await db.collection('survey_results').add(answers);
      return true;
    }
  }

  function translateMethodValue(val) {
    return val;
  }

  function translateExpValue(val) {
    return val;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // --- SUCCESS SCREEN ---
  function showSuccess(answers) {
    // Hide form & headers
    form.classList.add('hidden');
    document.querySelector('header').classList.add('hidden');
    document.querySelector('.w-full.h-2').parentElement.classList.add('hidden');
    
    // Show success panel
    successScreen.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 提交問卷';

    // Show JSON preview panel if mode is JSON
    if (settings.mode === 'json') {
      localExportPanel.classList.remove('hidden');
      jsonPreview.innerText = JSON.stringify(answers, null, 2);
    } else {
      localExportPanel.classList.add('hidden');
    }

    // Clear Draft
    localStorage.removeItem('survey_draft');
  }

  // Copy JSON Helper
  copyJsonBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(jsonPreview.innerText)
      .then(() => {
        copyJsonBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已複製';
        setTimeout(() => {
          copyJsonBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 複製 JSON';
        }, 2000);
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  });

  // --- ADMIN SETTINGS MODAL LOGIC ---
  adminSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  });

  function closeSettings() {
    settingsModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  closeSettingsBtn.addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  storageModeSelect.addEventListener('change', () => {
    toggleSettingsSections(storageModeSelect.value);
  });

  function toggleSettingsSections(mode) {
    appsScriptSettingsDiv.classList.add('hidden');
    googleSettingsDiv.classList.add('hidden');
    firebaseSettingsDiv.classList.add('hidden');

    if (mode === 'apps-script') {
      appsScriptSettingsDiv.classList.remove('hidden');
    } else if (mode === 'google') {
      googleSettingsDiv.classList.remove('hidden');
    } else if (mode === 'firebase') {
      firebaseSettingsDiv.classList.remove('hidden');
    }
  }

  function initSettingsUI() {
    storageModeSelect.value = settings.mode;
    appsScriptUrlInput.value = settings.appsScriptUrl || '';
    googleFormUrlInput.value = settings.googleUrl || '';
    
    // Fill Google Entry values
    for (const key in settings.googleEntries) {
      if (gEntriesInputs[key]) {
        gEntriesInputs[key].value = settings.googleEntries[key] || '';
      }
    }

    // Fill Firebase Config
    firebaseConfigJsonTextarea.value = settings.firebaseConfig || '';

    toggleSettingsSections(settings.mode);
  }

  saveSettingsBtn.addEventListener('click', () => {
    const mode = storageModeSelect.value;
    const appsScriptUrl = appsScriptUrlInput.value.trim();
    const googleUrl = googleFormUrlInput.value.trim();
    
    // Validate firebase JSON config if mode is firebase
    let firebaseConfig = firebaseConfigJsonTextarea.value.trim();
    if (mode === 'firebase' && firebaseConfig) {
      try {
        JSON.parse(firebaseConfig);
      } catch (e) {
        alert('Firebase Config 格式錯誤，必須是有效的 JSON！');
        return;
      }
    }

    // Read Google Form entries
    const googleEntries = {};
    for (const key in gEntriesInputs) {
      googleEntries[key] = gEntriesInputs[key].value.trim() || defaultSettings.googleEntries[key];
    }

    settings = {
      mode,
      appsScriptUrl,
      googleUrl,
      googleEntries,
      firebaseConfig
    };

    localStorage.setItem('survey_settings', JSON.stringify(settings));
    alert('設定已儲存！');
    closeSettings();
  });

  resetSettingsBtn.addEventListener('click', () => {
    if (confirm('確定要將設定還原為預設嗎？')) {
      settings = { ...defaultSettings };
      localStorage.setItem('survey_settings', JSON.stringify(settings));
      initSettingsUI();
    }
  });

});
