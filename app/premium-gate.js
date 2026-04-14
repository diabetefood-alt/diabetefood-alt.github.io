// v4 — last update: 2026-04-14T15:22:36.737Z
/**
 * DiabeteFood Premium Gate — Sécurisation de l'accès Premium
 *
 * Ce script REMPLACE les fonctions premium existantes (unlockPremium, activatePremium)
 * par des versions sécurisées qui vérifient l'abonnement via Google Play Billing.
 *
 * IMPORTANT : Charger ce script APRÈS billing.js et APRÈS le script principal de l'app.
 * <script src="billing.js"></script>
 * <script src="premium-gate.js"></script>
 */

(function() {
  'use strict';

  // --- Configuration ---
  const SCAN_LIMIT_FREE = 3;
  const SCAN_RESET_HOURS = 24;
  const PREMIUM_CHECK_INTERVAL = 300000;
  const LS_KEY_PREMIUM = 'diabetefood_premium';
  const LS_KEY_UNLOCKED = 'premiumUnlocked';
  const LS_KEY_SCAN_COUNT = 'diabetefood_scan_count';
  const LS_KEY_SCAN_DATE = 'diabetefood_scan_date';
  const LS_KEY_VERIFIED = 'diabetefood_premium_verified';
  const LS_KEY_VERIFY_TIME = 'diabetefood_premium_verify_time';

  let _isPremium = false;
  let _billingAvailable = false;
  let _checkInterval = null;

  // --- Initialisation ---

  async function initPremiumGate() {
    console.log('[PremiumGate] Initialisation...');
    _isPremium = false;

    if (typeof Billing !== 'undefined' && Billing.isAvailable()) {
      console.log('[PremiumGate] Digital Goods API détecté');
      _billingAvailable = true;

      const ok = await Billing.init(onPremiumStatusChanged);
      if (ok) {
        const hasSub = await Billing.checkExistingPurchases();
        setPremiumStatus(hasSub);
      } else {
        checkCachedPremium();
      }

      _checkInterval = setInterval(async () => {
        if (Billing.isAvailable()) {
          const hasSub = await Billing.checkExistingPurchases();
          setPremiumStatus(hasSub);
        }
      }, PREMIUM_CHECK_INTERVAL);

    } else {
      console.log('[PremiumGate] Pas dans un TWA — vérification cache local');
      checkCachedPremium();
    }

    updateUI();
    setupScanLimit();
  }

  // --- Vérification du statut ---

  function onPremiumStatusChanged(isPremium, subscription) {
    console.log('[PremiumGate] Statut changé:', isPremium, subscription);
    setPremiumStatus(isPremium);
  }

  function checkCachedPremium() {
    try {
      const verified = localStorage.getItem(LS_KEY_VERIFIED);
      const verifyTime = parseInt(localStorage.getItem(LS_KEY_VERIFY_TIME) || '0');
      const now = Date.now();
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

      if (verified === 'true' && (now - verifyTime) < SEVEN_DAYS) {
        console.log('[PremiumGate] Cache premium valide');
        setPremiumStatus(true);
      } else {
        console.log('[PremiumGate] Cache expiré ou absent');
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
      } else {
        localStorage.removeItem(LS_KEY_VERIFIED);
        localStorage.removeItem(LS_KEY_VERIFY_TIME);
      }
    } catch (e) {}
    updateUI();
    }

  // --- Mise à jour de l'interface ---

  function updateUI() {
    const premiumPage = document.getElementById('page-premium');
    const scanCounter = document.getElementById('scan-counter');
    const overlay = document.getElementById('premium-overlay');

    if (_isPremium) {
      if (premiumPage) premiumPage.classList.add('prem-unlocked');
      if (scanCounter) {
        scanCounter.classList.add('premium-mode');
        scanCounter.innerHTML = '★Premium actif — Scans illimités';
      }
      if (overlay) overlay.classList.add('hidden');
    } else {
      if (premiumPage) premiumPage.classList.remove('prem-unlocked');
      if (scanCounter) {
        scanCounter.classList.remove('premium-mode');
        updateScanCounterDisplay();
      }
      // FIX: ne pas forcer overlay visible — laisser showScanLimitReached() le montrer
    }
  }

  // --- Limite de scans (utilisateurs gratuits) ---

  function setupScanLimit() {
    if (_isPremium) return;

    const originalLookup = window.lookupBarcode || window.fetchProductInfo || window.searchProduct;
    if (originalLookup) {
      const fnName = window.lookupBarcode ? 'lookupBarcode' : (window.fetchProductInfo ? 'fetchProductInfo' : 'searchProduct');
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
      scanCounter.innerHTML = '📷 ' + remaining + '/' + SCAN_LIMIT_FREE + ' scans gratuits restants';
    } catch (e) {
      scanCounter.innerHTML = '📷 ' + SCAN_LIMIT_FREE + ' scans gratuits par jour';
    }
  }

  // --- Alerte limite atteinte ---

  function showScanLimitReached() {
    const overlay = document.getElementById('premium-overlay');
    if (overlay) overlay.classList.remove('hidden');

    const existing = document.getElementById('scan-limit-alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.id = 'scan-limit-alert';
    alert.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    alert.innerHTML = '<div style="background:white;border-radius:20px;padding:32px 24px;max-width:360px;text-align:center;">' +
      '<div style="font-size:48px;margin-bottom:16px;">🔒<\/div>' +
      '<h2 style="font-size:20px;margin-bottom:8px;color:#1a1a2e;">Limite atteinte<\/h2>' +
      '<p style="color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:20px;">Vous avez utilisé vos ' + SCAN_LIMIT_FREE + ' scans gratuits aujourd\'hui. Passez à Premium pour des scans illimités !<\/p>' +
      '<button onclick="window.location.href=\'premium.html\'" style="width:100%;padding:14px;background:linear-gradient(135deg,#ff6b00,#e55d00);color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">Débloquer Premium<\/button>' +
      '<button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:12px;background:none;border:none;color:#6b7280;font-size:14px;cursor:pointer;margin-top:8px;">Plus tard<\/button>' +
      '<\/div>';
    document.body.appendChild(alert);
  }

  // --- Remplacement des fonctions existantes ---

  window.unlockPremium = function() {
    if (_billingAvailable && typeof Billing !== 'undefined') {
      window.location.href = 'premium.html';
    } else {
      showNotInTWA();
    }
  };

  window.activatePremium = function() {
    window.unlockPremium();
  };

  function showNotInTWA() {
    const existing = document.getElementById('not-twa-alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.id = 'not-twa-alert';
    alert.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    alert.innerHTML = '<div style="background:white;border-radius:20px;padding:32px 24px;max-width:360px;text-align:center;">' +
      '<div style="font-size:48px;margin-bottom:16px;">📱<\/div>' +
      '<h2 style="font-size:20px;margin-bottom:8px;color:#1a1a2e;">Abonnement via l\'app<\/h2>' +
      '<p style="color:#6b7280;font-size:14px;line-height:1.5;margin-bottom:20px;">Pour vous abonner à Premium, ouvrez DiabeteFood depuis le Google Play Store.<\/p>' +
      '<button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:14px;background:linear-gradient(135deg,#ff6b00,#e55d00);color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;">Compris<\/button>' +
      '<\/div>';
    document.body.appendChild(alert);
  }

  // --- Protection anti-triche ---

  function setupAntiTamper() {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === LS_KEY_UNLOCKED || key === LS_KEY_PREMIUM || key === LS_KEY_VERIFIED) {
        if (value === 'true' && !_isPremium) {
          console.warn('[PremiumGate] Tentative de modification premium bloquée');
          return;
        }
      }
      return originalSetItem.call(this, key, value);
    };

    setInterval(() => {
      try {
        const lsValue = localStorage.getItem(LS_KEY_UNLOCKED);
        if (lsValue === 'true' && !_isPremium) {
          console.warn('[PremiumGate] Détection de triche — verrouillage');
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
      } catch (e) { return SCAN_LIMIT_FREE; }
    },
    refresh: async function() {
      if (_billingAvailable && typeof Billing !== 'undefined') {
        const hasSub = await Billing.checkExistingPurchases();
        setPremiumStatus(hasSub);
      }
    }
  };

  // --- Démarrage ---

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initPremiumGate();
      setupAntiTamper();
    });
  } else {
    initPremiumGate();
    setupAntiTamper();
  }

  console.log('[PremiumGate] Script chargé — protection premium active');

})();
