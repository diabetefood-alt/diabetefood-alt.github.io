// v5 — last update: 2026-04-14T15:58:27.333Z
/**
 * DiabeteFood Premium Gate — Scan limiting + anti-tamper
 *
 * IMPORTANT: Ce script ne remplace PAS activatePremium().
 * La fonction inline dans index.html gère le paiement via Digital Goods API.
 * Ce script gère uniquement la limite de scans et la protection anti-triche.
 */
(function() {
  'use strict';

  // --- Configuration ---
  const SCAN_LIMIT_FREE = 3;
  const PREMIUM_CHECK_INTERVAL = 300000;
  const LS_KEY_PREMIUM = 'diabetefood_premium';
  const LS_KEY_UNLOCKED = 'premiumUnlocked';
  const LS_KEY_SCAN_COUNT = 'diabetefood_scan_count';
  const LS_KEY_SCAN_DATE = 'diabetefood_scan_date';
  const LS_KEY_VERIFIED = 'diabetefood_premium_verified';
  const LS_KEY_VERIFY_TIME = 'diabetefood_premium_verify_time';

  let _isPremium = false;
  let _billingAvailable = false;

  // --- Initialisation ---
  async function initPremiumGate() {
    console.log('[PremiumGate] Initialisation v5...');
    _isPremium = false;

    // Vérifier si Digital Goods API disponible (TWA)
    if ('getDigitalGoodsService' in window) {
      console.log('[PremiumGate] Digital Goods API détecté (TWA)');
      _billingAvailable = true;

      // Vérifier achats existants via la fonction inline
      if (typeof checkExistingPurchases === 'function') {
        try {
          const hasSub = await checkExistingPurchases();
          setPremiumStatus(!!hasSub);
        } catch(e) {
          checkCachedPremium();
        }
      } else if (typeof Billing !== 'undefined' && Billing.isAvailable()) {
        try {
          await Billing.init();
          const hasSub = await Billing.checkExistingPurchases();
          setPremiumStatus(!!hasSub);
        } catch(e) {
          checkCachedPremium();
        }
      } else {
        checkCachedPremium();
      }
    } else {
      console.log('[PremiumGate] Pas dans un TWA');
      checkCachedPremium();
    }

    updateUI();
    setupScanLimit();
  }

  // --- Cache premium ---
  function checkCachedPremium() {
    try {
      const verified = localStorage.getItem(LS_KEY_VERIFIED);
      const verifyTime = parseInt(localStorage.getItem(LS_KEY_VERIFY_TIME) || '0');
      const now = Date.now();
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      if (verified === 'true' && (now - verifyTime) < SEVEN_DAYS) {
        setPremiumStatus(true);
      } else {
        setPremiumStatus(false);
      }
    } catch (e) {
      setPremiumStatus(false);
    }
  }

  function setPremiumStatus(isPremium) {
    _isPremium = isPremium;
    try {
      localStorage.setItem(LS_KEY_PREMIUM, isPremium ? 'true' : 'false');
      localStorage.setItem(LS_KEY_UNLOCKED, isPremium ? 'true' : 'false');
      if (isPremium) {
        localStorage.setItem(LS_KEY_VERIFIED, 'true');
        localStorage.setItem(LS_KEY_VERIFY_TIME, Date.now().toString());
      }
    } catch (e) {}
    updateUI();
  }

  // --- UI ---
  function updateUI() {
    const scanCounter = document.getElementById('scan-counter');
    const overlay = document.getElementById('premium-overlay');

    if (_isPremium) {
      if (scanCounter) {
        scanCounter.classList.add('premium-mode');
        scanCounter.innerHTML = '\u2605 Premium actif \u2014 Scans illimit\u00e9s';
      }
      if (overlay) overlay.classList.add('hidden');
    } else {
      if (scanCounter) {
        scanCounter.classList.remove('premium-mode');
        updateScanCounterDisplay();
      }
      // NE PAS forcer overlay visible — laisser le code principal le g\u00e9rer
    }
  }

  // --- Scan limiting ---
  function setupScanLimit() {
    if (_isPremium) return;

    const originalLookup = window.lookupBarcode || window.fetchProductInfo || window.searchProduct;
    if (originalLookup) {
      const fnName = window.lookupBarcode ? 'lookupBarcode' :
        (window.fetchProductInfo ? 'fetchProductInfo' : 'searchProduct');
      window['_original_' + fnName] = originalLookup;
      window[fnName] = function() {
        if (!_isPremium && !canScan()) {
          showScanLimitReached();
          return;
        }
        incrementScanCount();
        return window['_original_' + fnName].apply(this, arguments);
      };
    }
  }

  function canScan() {
    if (_isPremium) return true;
    try {
      const today = new Date().toDateString();
      const savedDate = localStorage.getItem(LS_KEY_SCAN_DATE);
      const count = parseInt(localStorage.getItem(LS_KEY_SCAN_COUNT) || '0');
      if (savedDate !== today) {
        localStorage.setItem(LS_KEY_SCAN_DATE, today);
        localStorage.setItem(LS_KEY_SCAN_COUNT, '0');
        return true;
      }
      return count < SCAN_LIMIT_FREE;
    } catch (e) {
      return true;
    }
  }

  function incrementScanCount() {
    if (_isPremium) return;
    try {
      const today = new Date().toDateString();
      const savedDate = localStorage.getItem(LS_KEY_SCAN_DATE);
      if (savedDate !== today) {
        localStorage.setItem(LS_KEY_SCAN_DATE, today);
        localStorage.setItem(LS_KEY_SCAN_COUNT, '1');
      } else {
        const count = parseInt(localStorage.getItem(LS_KEY_SCAN_COUNT) || '0');
        localStorage.setItem(LS_KEY_SCAN_COUNT, (count + 1).toString());
      }
      updateScanCounterDisplay();
    } catch (e) {}
  }

  function updateScanCounterDisplay() {
    if (_isPremium) return;
    const scanCounter = document.getElementById('scan-counter');
    if (!scanCounter) return;
    try {
      const count = parseInt(localStorage.getItem(LS_KEY_SCAN_COUNT) || '0');
      const remaining = Math.max(0, SCAN_LIMIT_FREE - count);
      scanCounter.innerHTML = '\ud83d\udcf7 ' + remaining + '/' + SCAN_LIMIT_FREE + ' scans gratuits restants';
    } catch (e) {
      scanCounter.innerHTML = '\ud83d\udcf7 ' + SCAN_LIMIT_FREE + ' scans gratuits par jour';
    }
  }

  function showScanLimitReached() {
    const overlay = document.getElementById('premium-overlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  // --- Anti-tamper ---
  function setupAntiTamper() {
    setInterval(() => {
      try {
        const lsValue = localStorage.getItem(LS_KEY_UNLOCKED);
        if (lsValue === 'true' && !_isPremium) {
          localStorage.setItem(LS_KEY_UNLOCKED, 'false');
          localStorage.setItem(LS_KEY_PREMIUM, 'false');
          updateUI();
        }
      } catch (e) {}
    }, 5000);
  }

  // --- API publique ---
  window.PremiumGate = {
    isPremium: function() { return _isPremium; },
    canScan: canScan,
    getRemainingScans: function() {
      if (_isPremium) return Infinity;
      try {
        const today = new Date().toDateString();
        const savedDate = localStorage.getItem(LS_KEY_SCAN_DATE);
        if (savedDate !== today) return SCAN_LIMIT_FREE;
        const count = parseInt(localStorage.getItem(LS_KEY_SCAN_COUNT) || '0');
        return Math.max(0, SCAN_LIMIT_FREE - count);
      } catch (e) {
        return SCAN_LIMIT_FREE;
      }
    }
  };

  // --- D\u00e9marrage ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initPremiumGate();
      setupAntiTamper();
    });
  } else {
    initPremiumGate();
    setupAntiTamper();
  }

  console.log('[PremiumGate] v5 charg\u00e9 — PAS d\'override de activatePremium');
})();
