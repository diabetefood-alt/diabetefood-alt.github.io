/**
 * DiabeteFood Scanner — Google Play Billing Module
 *
 * Utilise le Digital Goods API + Payment Request API pour gérer
 * les abonnements premium depuis un TWA (Trusted Web Activity).
 *
 * Produits :
 *   - diabetefood_premium_monthly  → 2.99 €/mois
 *   - diabetefood_premium_yearly   → 19.99 €/an
 */

const Billing = (() => {
  const MONTHLY_ID = 'diabetefood_premium_monthly';
  const YEARLY_ID  = 'diabetefood_premium_yearly';
  const PRODUCT_IDS = [MONTHLY_ID, YEARLY_ID];
  const PAYMENT_METHOD = 'https://play.google.com/billing';

  let _dgService = null;
  let _products = {};
  let _entitlements = [];
  let _onStatusChange = null;

  function isAvailable() {
    return 'getDigitalGoodsService' in window;
  }

  async function init(onStatusChange) {
    _onStatusChange = onStatusChange || (() => {});
    if (!isAvailable()) {
      console.log('[Billing] Digital Goods API non disponible');
      return false;
    }
    try {
      _dgService = await window.getDigitalGoodsService(PAYMENT_METHOD);
      if (!_dgService) { return false; }
      await Promise.all([loadProducts(), checkExistingPurchases()]);
      return true;
    } catch (err) {
      console.error('[Billing] Erreur init:', err);
      return false;
    }
  }

  async function loadProducts() {
    if (!_dgService) return;
    try {
      const details = await _dgService.getDetails(PRODUCT_IDS);
      _products = {};
      for (const item of details) {
        _products[item.itemId] = {
          id: item.itemId, title: item.title, description: item.description,
          price: item.price, formattedPrice: _formatPrice(item.price),
          subscriptionPeriod: item.subscriptionPeriod || null,
          freeTrialPeriod: item.freeTrialPeriod || null,
          introductoryPrice: item.introductoryPrice || null,
        };
      }
    } catch (err) { console.error('[Billing] Erreur chargement produits:', err); }
  }

  function getProduct(id) { return _products[id] || null; }
  function getMonthly() { return getProduct(MONTHLY_ID); }
  function getYearly() { return getProduct(YEARLY_ID); }

  async function subscribe(productId) {
    if (!_dgService) return { success: false, error: 'Service non initialisé' };
    const product = _products[productId];
    if (!product) return { success: false, error: 'Produit non trouvé: ' + productId };
    try {
      const paymentDetails = { total: { label: product.title || 'DiabeteFood Premium', amount: product.price } };
      const paymentMethod = { supportedMethods: PAYMENT_METHOD, data: { sku: productId } };
      const request = new PaymentRequest([paymentMethod], paymentDetails);
      const response = await request.show();
      const { purchaseToken } = response.details;
      await _dgService.acknowledge(purchaseToken, 'repeatable');
      await response.complete('success');
      await checkExistingPurchases();
      return { success: true, token: purchaseToken };
    } catch (err) {
      if (err.name === 'AbortError') return { success: false, error: 'cancelled' };
      return { success: false, error: err.message };
    }
  }

  function subscribeMonthly() { return subscribe(MONTHLY_ID); }
  function subscribeYearly() { return subscribe(YEARLY_ID); }

  async function checkExistingPurchases() {
    if (!_dgService) { _notifyStatus(false); return false; }
    try {
      _entitlements = await _dgService.listPurchases();
      const isPremium = _entitlements.some(p => PRODUCT_IDS.includes(p.itemId));
      try {
        localStorage.setItem('diabetefood_premium', isPremium ? '1' : '0');
        if (isPremium) {
          const sub = _entitlements.find(p => PRODUCT_IDS.includes(p.itemId));
          localStorage.setItem('diabetefood_premium_product', sub?.itemId || '');
          localStorage.setItem('diabetefood_premium_token', sub?.purchaseToken || '');
        }
      } catch (e) {}
      _notifyStatus(isPremium);
      return isPremium;
    } catch (err) { return _getCachedStatus(); }
  }

  function isPremium() {
    if (_entitlements.length > 0) return _entitlements.some(p => PRODUCT_IDS.includes(p.itemId));
    return _getCachedStatus();
  }

  function getActiveSubscription() {
    const active = _entitlements.find(p => PRODUCT_IDS.includes(p.itemId));
    return active ? active.itemId : null;
  }

  function _formatPrice(price) {
    if (!price) return '';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: price.currency }).format(price.value); }
    catch { return price.value + ' ' + price.currency; }
  }

  function _getCachedStatus() {
    try { return localStorage.getItem('diabetefood_premium') === '1'; } catch { return false; }
  }

  function _notifyStatus(isPremium) {
    if (_onStatusChange) _onStatusChange(isPremium, getActiveSubscription());
    window.dispatchEvent(new CustomEvent('premiumStatusChanged', { detail: { isPremium, subscription: getActiveSubscription() } }));
  }

  return {
    MONTHLY_ID, YEARLY_ID, isAvailable, init, loadProducts, getProduct, getMonthly, getYearly,
    subscribe, subscribeMonthly, subscribeYearly, checkExistingPurchases, isPremium, getActiveSubscription,
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Billing; }
