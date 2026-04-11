// ── Page view tracker (feeds admin dashboard) ──────────────
(function trackVisit() {
  try {
    // Server-side tracking (shared between partners)
    fetch('/api/track-view', { method: 'POST' }).catch(() => {});
    // Local fallback if server not reachable
    const today = new Date().toISOString().slice(0, 10);
    const views = JSON.parse(localStorage.getItem('udream-views') || '{}');
    views[today] = (views[today] || 0) + 1;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    Object.keys(views).forEach(k => { if (k < cutoffStr) delete views[k]; });
    localStorage.setItem('udream-views', JSON.stringify(views));
  } catch (e) { /* ignore */ }
})();

const chatWidget = document.getElementById('chat-widget');
const openChatButtons = [document.getElementById('open-chat'), document.getElementById('open-chat-2'), document.getElementById('chat-toggle')];
const closeChatButton = document.getElementById('close-chat');
const chatForm = document.getElementById('chat-form');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');

const cartWidget = document.getElementById('cart-widget');
const openCartButton = document.getElementById('open-cart');
const closeCartButton = document.getElementById('close-cart');
const cartBody = document.getElementById('cart-body');
const cartTotal = document.getElementById('cart-total');
const cartCount = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout-btn');

// Load cart from localStorage if available
let cart = JSON.parse(localStorage.getItem('udream-cart')) || [];
let chatHistory = [];
let isTyping = false;
let notificationQueue = []; // Queue for stacking notifications

// Update cart display on load (in case cart was saved)
setTimeout(() => updateCartDisplay(), 0);

function updateCartDisplay() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  // Save cart to localStorage
  localStorage.setItem('udream-cart', JSON.stringify(cart));
  cartCount.textContent = totalItems;

  if (cart.length === 0) {
    cartBody.innerHTML = '<p>سلتك فارغة.</p>';
    cartTotal.textContent = '0.00';
  } else {
    cartBody.innerHTML = '';
    let total = 0;
    cart.forEach((item, index) => {
      const itemTotal = parseFloat(item.price) * item.quantity;
      total += itemTotal;
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-name">${item.name}</span>
          <span class="cart-item-quantity">×${item.quantity}</span>
        </div>
        <div class="cart-item-price-controls">
          <span class="cart-item-price">${itemTotal.toFixed(2)} ر.س</span>
          <div class="quantity-controls">
            <button class="quantity-btn minus" data-index="${index}">−</button>
            <span class="quantity-display">${item.quantity}</span>
            <button class="quantity-btn plus" data-index="${index}">+</button>
          </div>
          <button class="cart-item-remove" data-index="${index}">×</button>
        </div>
      `;
      cartBody.appendChild(itemEl);
    });
    cartTotal.textContent = total.toFixed(2);

    // Attach event listeners to quantity buttons and remove buttons
    document.querySelectorAll('.quantity-btn.minus').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = e.target.dataset.index;
        updateQuantity(index, -1);
      });
    });

    document.querySelectorAll('.quantity-btn.plus').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = e.target.dataset.index;
        updateQuantity(index, 1);
      });
    });

    document.querySelectorAll('.cart-item-remove').forEach(button => {
      button.addEventListener('click', (e) => {
        const index = e.target.dataset.index;
        removeFromCart(index);
      });
    });
  }
}

function addToCart(product, price) {
  // Check if item already exists in cart
  const existingItem = cart.find(item => item.name === product && item.price === price);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ name: product, price: price, quantity: 1 });
  }

  updateCartDisplay();
  showAddToCartFeedback(product);
}

function updateQuantity(index, change) {
  const item = cart[index];
  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(index);
  } else {
    updateCartDisplay();
  }
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartDisplay();
}

function showAddToCartFeedback(product) {
  // Find existing notification for this product
  const existingNotification = notificationQueue.find(n => n.product === product);

  if (existingNotification) {
    // Update existing notification
    existingNotification.quantity += 1;
    existingNotification.timestamp = Date.now();
    updateNotificationDisplay(existingNotification.element, product, existingNotification.quantity);
  } else {
    // Create new notification
    const notificationData = {
      product: product,
      quantity: 1,
      timestamp: Date.now(),
      element: null
    };

    notificationQueue.push(notificationData);
    createNotification(product, notificationData);
  }

  // Clean up old notifications
  cleanupNotifications();
}

function createNotification(product, notificationData) {
  const toast = document.createElement('div');
  toast.className = 'cart-feedback';
  notificationData.element = toast;

  updateNotificationDisplay(toast, product, notificationData.quantity);

  document.body.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    removeNotification(notificationData);
  }, 4000);
}

function updateNotificationDisplay(toast, product, quantity) {
  const quantityText = quantity > 1 ? ` (${quantity})` : '';
  toast.textContent = `تم إضافة ${product} إلى السلة!${quantityText}`;
  toast.style.transform = `translateY(-${(notificationQueue.length - 1) * 70}px)`;
}

function removeNotification(notificationData) {
  const index = notificationQueue.indexOf(notificationData);
  if (index > -1) {
    notificationQueue.splice(index, 1);
    if (notificationData.element && notificationData.element.parentNode) {
      notificationData.element.parentNode.removeChild(notificationData.element);
    }
    // Update positions of remaining notifications
    updateNotificationPositions();
  }
}

function updateNotificationPositions() {
  notificationQueue.forEach((notification, index) => {
    if (notification.element) {
      notification.element.style.transform = `translateY(-${index * 70}px)`;
    }
  });
}

function cleanupNotifications() {
  const now = Date.now();
  const toRemove = [];

  notificationQueue.forEach((notification, index) => {
    if (now - notification.timestamp > 4000) {
      toRemove.push(index);
    }
  });

  // Remove from end to beginning to maintain indices
  toRemove.reverse().forEach(index => {
    removeNotification(notificationQueue[index]);
  });
}

function showCheckout() {
  if (cart.length === 0) {
    alert('أضف منتجات للسلة أولاً!');
    return;
  }
  // Create checkout data
  const checkoutData = {
    items: cart,
    total: cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0),
    timestamp: new Date().toISOString()
  };

  // Store checkout data in sessionStorage for the new tab
  sessionStorage.setItem('udream-checkout', JSON.stringify(checkoutData));

  // Store theme preference
  if (document.body.classList.contains('light-mode')) {
    sessionStorage.setItem('theme', 'light');
  } else {
    sessionStorage.setItem('theme', 'dark');
  }

  // Open checkout page in new tab
  window.open('checkout.html', '_blank');
}

function openCart() {
  const isVisible = cartWidget.style.display === 'flex';
  cartWidget.style.display = isVisible ? 'none' : 'flex';
}

function closeCart() {
  cartWidget.style.display = 'none';
}

function openChat() {
  const isVisible = chatWidget.style.display === 'flex';
  chatWidget.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) {
    chatInput.focus();
  }
}

function closeChat() {
  chatWidget.style.display = 'none';
}

openChatButtons.forEach(button => {
  if (button) {
    button.addEventListener('click', openChat);
  }
});

closeChatButton.addEventListener('click', closeChat);

chatForm.addEventListener('submit', event => {
  event.preventDefault();
  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  addChatMessage(userMessage, 'user');
  chatInput.value = '';

  showTypingIndicator();

  setTimeout(() => {
    hideTypingIndicator();
    const aiResponse = generateAIResponse(userMessage);
    addChatMessage(aiResponse, 'bot');
  }, 1500 + Math.random() * 1000); // Random delay between 1.5-2.5 seconds
});

function addChatMessage(message, type) {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${type}`;
  messageEl.textContent = message;
  chatBody.appendChild(messageEl);
  chatBody.scrollTop = chatBody.scrollHeight;

  // Add to chat history
  chatHistory.push({ message, type, timestamp: Date.now() });
}

function showTypingIndicator() {
  if (isTyping) return;

  isTyping = true;
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message bot typing';
  typingEl.innerHTML = `
    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <span>يكتب مساعد Udream...</span>
  `;
  chatBody.appendChild(typingEl);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function hideTypingIndicator() {
  const typingEl = document.querySelector('.typing');
  if (typingEl) {
    typingEl.remove();
  }
  isTyping = false;
}

function generateAIResponse(userMessage) {
  const msg = userMessage.toLowerCase().replace(/[؟?!.,،]/g, '').trim();

  // --- Language Detection ---
  const arabicChars = (msg.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (msg.match(/[a-zA-Z]/g) || []).length;
  const isEnglish = latinChars > arabicChars;

  // --- Knowledge Base ---
  const products = [
    {
      id: 'lamp',
      nameAr: 'مصباح مكتب RGB ذكي',
      nameEn: 'Smart RGB Desk Lamp',
      price: 187,
      keywords: ['مصباح', 'لمبه', 'لمبة', 'lamp', 'rgb', 'اضاءة', 'إضاءة', 'نور', 'ضوء', 'ليد', 'led', 'light', 'lighting', 'desk lamp'],
      descAr: 'إضاءة محيطية ذكية بـ 16 مليون لون، تحكم عبر التطبيق، مثالي للدراسة والبث والاسترخاء.',
      descEn: 'Smart ambient lighting with 16 million colors, app-controlled, perfect for study, streaming & relaxation.',
      specsAr: 'يدعم WiFi وبلوتوث، 10 واط، عمر افتراضي 25,000 ساعة، ضمان سنة.',
      specsEn: 'WiFi & Bluetooth, 10W, 25,000 hour lifespan, 1-year warranty.'
    },
    {
      id: 'earbuds',
      nameAr: 'سماعات لاسلكية',
      nameEn: 'Wireless Earbuds',
      price: 112,
      keywords: ['سماعات', 'سماعه', 'سماعة', 'earbuds', 'headphones', 'ايربودز', 'بلوتوث', 'bluetooth', 'earphone', 'wireless', 'airpods', 'audio'],
      descAr: 'عازلة للضوضاء مع بطارية تدوم 8 ساعات، مثالية للمكالمات والموسيقى والألعاب.',
      descEn: 'Noise-cancelling with 8-hour battery life, perfect for calls, music & gaming.',
      specsAr: 'بلوتوث 5.3، مقاومة للماء IPX5، ميكروفون مزدوج، شحن سريع 10 دقائق = ساعة استخدام.',
      specsEn: 'Bluetooth 5.3, IPX5 water resistant, dual mic, quick charge: 10 min = 1 hour use.'
    },
    {
      id: 'dock',
      nameAr: 'محطة شحن شاملة',
      nameEn: 'All-in-one Charging Dock',
      price: 150,
      keywords: ['شاحن', 'شحن', 'محطة', 'dock', 'charging', 'charge', 'باور', 'charger', 'power', 'station', 'wireless charging'],
      descAr: 'شحن الهواتف والساعات والسماعات من قاعدة أنيقة واحدة.',
      descEn: 'Charge your phone, watch & earbuds from one sleek base.',
      specsAr: 'يدعم شحن Qi اللاسلكي حتى 15W، منفذ USB-C، متوافق مع iPhone وSamsung وApple Watch.',
      specsEn: 'Qi wireless up to 15W, USB-C port, compatible with iPhone, Samsung & Apple Watch.'
    },
    {
      id: 'organizer',
      nameAr: 'مجموعة منظم مكتب',
      nameEn: 'Desk Organizer Set',
      price: 94,
      keywords: ['منظم', 'مكتب', 'ترتيب', 'organizer', 'desk', 'تنظيم', 'كابلات', 'organize', 'cable', 'tidy', 'storage', 'setup'],
      descAr: 'حاملات كابلات وأدراج وأقسام لتنظيم الأدوات، مثالية لغرف الدراسة والمكاتب.',
      descEn: 'Cable holders, drawers & compartments to organize your tools. Perfect for study rooms & offices.',
      specsAr: 'خامة خشب MDF عالي الجودة، 5 أقسام، متوفر بلون أسود وبيج.',
      specsEn: 'High-quality MDF wood, 5 compartments, available in black & beige.'
    }
  ];

  const storeInfo = {
    name: 'Udream',
    currency: 'SAR',
    currencyAr: 'ر.س',
    freeShippingMin: 250,
    shippingDaysAr: '1-3 أيام عمل',
    shippingDaysEn: '1-3 business days',
    returnDays: 7,
    warrantyYears: 1,
    paymentMethods: ['Mada', 'Visa', 'Mastercard', 'Apple Pay', 'Cash on Delivery'],
    paymentMethodsAr: ['مدى', 'فيزا', 'ماستر كارد', 'Apple Pay', 'الدفع عند الاستلام'],
    countryAr: 'المملكة العربية السعودية',
    countryEn: 'Saudi Arabia'
  };

  const cur = isEnglish ? storeInfo.currency : storeInfo.currencyAr;
  const shipDays = isEnglish ? storeInfo.shippingDaysEn : storeInfo.shippingDaysAr;
  const country = isEnglish ? storeInfo.countryEn : storeInfo.countryAr;
  const pName = (p) => isEnglish ? p.nameEn : p.nameAr;
  const pDesc = (p) => isEnglish ? p.descEn : p.descAr;
  const pSpecs = (p) => isEnglish ? p.specsEn : p.specsAr;

  // --- Intent Detection ---
  function detectIntent(m) {
    const intents = [];

    // Greetings
    if (/^(مرحبا|هلا|اهلا|أهلا|السلام|سلام|هاي|مساء|صباح|hello|hi|hey|yo|اهلين|هلو|كيفك|كيف حالك|شلون|الو|good morning|good evening|howdy|sup|what'?s up|greetings)/i.test(m))
      intents.push('greeting');

    // Farewell
    if (/(باي|مع السلامه|مع السلامة|وداعا|الله يسلمك|bye|goodbye|see you|take care|later|شكرا.*باي|يعطيك العافية|good ?night|cya|farewell)/i.test(m))
      intents.push('farewell');

    // Thanks
    if (/(شكرا|شكر|thank|thanks|thx|appreciate|مشكور|يعطيك العافيه|يعطيك العافية|الله يعطيك|تسلم|يسلمو|ty)/i.test(m))
      intents.push('thanks');

    // Product inquiry
    for (const p of products) {
      if (p.keywords.some(k => m.includes(k))) {
        intents.push('product_' + p.id);
      }
    }

    // Price / cost
    if (/(سعر|اسعار|أسعار|price|كم سعر|بكم|تكلفة|غالي|رخيص|ارخص|أرخص|خصم|تخفيض|عرض|كوبون|كود|خصومات|how much|cost|expensive|cheap|discount|coupon|deal|offer|sale|pricing)/i.test(m))
      intents.push('pricing');

    // Shipping / delivery
    if (/(شحن|توصيل|delivery|shipping|يوصل|موعد|متى يوصل|تتبع|tracking|أرامكس|سمسا|زاجل|ناقل|deliver|ship|track|when.*arrive|how long|estimated|eta)/i.test(m))
      intents.push('shipping');

    // Payment
    if (/(دفع|payment|فيزا|مدى|ماستر|apple pay|تحويل|بنك|كاش|نقد|استلام|pay|visa|mastercard|mada|credit card|debit|cod|cash on delivery|how.*pay)/i.test(m))
      intents.push('payment');

    // Returns / refunds
    if (/(استرجاع|ارجاع|إرجاع|استبدال|refund|return|مرتجع|ترجيع|فلوس|استرداد|exchange|money back|send back|give back)/i.test(m))
      intents.push('returns');

    // Warranty
    if (/(ضمان|warranty|guarantee|كفالة|عيب|خراب|مكسور|تالف|صيانة|broken|defect|damaged|repair|fix|faulty)/i.test(m))
      intents.push('warranty');

    // Order status / tracking
    if (/(طلب|order|رقم الطلب|اين طلبي|أين طلبي|وين طلبي|حالة الطلب|تتبع الطلب|my order|order status|where.*order|track.*order|order number)/i.test(m))
      intents.push('order');

    // How to buy / checkout
    if (/(كيف اشتري|كيف أشتري|طريقة الشراء|اشتري|شراء|اطلب|أطلب|checkout|اضيف|أضيف|سلة|cart|how.*buy|how.*order|how.*purchase|add to cart|place.*order|purchase)/i.test(m))
      intents.push('how_to_buy');

    // Contact / complain
    if (/(تواصل|اتصل|رقم|هاتف|جوال|واتساب|whatsapp|ايميل|email|بريد|شكوى|شكاوي|مشكلة|مشكله|contact|phone|call|reach|complain|complaint|issue|problem)/i.test(m))
      intents.push('contact');

    // Store info
    if (/(من انتم|من أنتم|وش المتجر|ايش هو|عن المتجر|about|معلومات|وين موقعكم|فرع|محل|who are you|what is udream|tell me about|your store|your company|where.*located)/i.test(m))
      intents.push('about');

    // Product comparison / recommendation
    if (/(افضل|أفضل|انصحني|أنصحني|وش تنصح|ايش احسن|أيش أحسن|مقارنة|compare|الفرق|recommend|best|suggest|which one|what should|top pick|favorite|popular)/i.test(m))
      intents.push('recommend');

    // All products
    if (/(منتجات|products|المنتجات|وش عندكم|ايش عندكم|ماذا تبيعون|كتالوج|catalog|catalogue|what.*sell|show.*products|all products|inventory|collection|items|what do you have)/i.test(m))
      intents.push('all_products');

    // Privacy / terms
    if (/(خصوصية|privacy|شروط|terms|سياسة|احكام|أحكام|policy|conditions|legal|data protection)/i.test(m))
      intents.push('policies');

    // Help
    if (/(مساعدة|مساعده|help|ساعدني|ساعدوني|support|دعم|assist|assistance|can you help|i need help|what can you do)/i.test(m))
      intents.push('help');

    // Availability / stock
    if (/(متوفر|متاح|موجود|available|stock|مخزون|نفذ|خلص|in stock|out of stock|sold out|availability)/i.test(m))
      intents.push('availability');

    // Gift
    if (/(هدية|هديه|gift|تغليف|باقة|present|gift wrap|surprise)/i.test(m))
      intents.push('gift');

    return intents.length > 0 ? intents : ['unknown'];
  }

  // --- Response Generation ---
  const intents = detectIntent(msg);
  const responses = [];
  const handled = new Set();

  for (const intent of intents) {
    if (handled.has(intent)) continue;
    handled.add(intent);

    // Product-specific
    if (intent.startsWith('product_')) {
      const pid = intent.replace('product_', '');
      const p = products.find(x => x.id === pid);
      if (p) {
        const variants = isEnglish ? [
          `${p.nameEn} — ${p.descEn}\n💰 Price: ${p.price} ${cur}\n📋 Specs: ${p.specsEn}`,
          `We have the ${p.nameEn} for only ${p.price} ${cur}!\n${p.descEn}\nSpecs: ${p.specsEn}`,
          `${p.nameEn} is one of our best sellers! 🔥\n${p.descEn}\nPrice: ${p.price} ${cur} with ${storeInfo.warrantyYears}-year warranty.`
        ] : [
          `${p.nameAr} — ${p.descAr}\n💰 السعر: ${p.price} ${cur}\n📋 المواصفات: ${p.specsAr}`,
          `عندنا ${p.nameAr} بسعر ${p.price} ${cur} فقط!\n${p.descAr}\nالمواصفات: ${p.specsAr}`,
          `${p.nameAr} من أكثر المنتجات طلبًا! 🔥\n${p.descAr}\nالسعر ${p.price} ${cur} مع ضمان ${storeInfo.warrantyYears} سنة.`
        ];
        responses.push(pickRandom(variants));
      }
      continue;
    }

    switch (intent) {
      case 'greeting': {
        const hour = new Date().getHours();
        if (isEnglish) {
          const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
          const variants = [
            `${timeGreet}! 👋 Welcome to Udream. How can I help you today?`,
            `Hey there! 😊 I'm the Udream smart assistant. Ask me anything about our products, prices, shipping & more!`,
            `${timeGreet}! Welcome to Udream ✨ Feel free to ask about products, pricing, shipping, or anything else!`,
            `Hi! 🙌 How can I assist you today? Whether it's products, prices, or support — I'm here to help!`
          ];
          responses.push(pickRandom(variants));
        } else {
          const timeGreet = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';
          const variants = [
            `${timeGreet}! 👋 أهلاً بك في Udream. كيف أقدر أساعدك اليوم؟`,
            `هلا وغلا! 😊 أنا مساعد Udream الذكي، تحت أمرك. اسأل عن أي شيء!`,
            `${timeGreet}! نورت متجر Udream ✨ تقدر تسألني عن المنتجات، الأسعار، الشحن، أو أي شيء ثاني!`,
            `أهلين حبيبي! 🙌 كيف أقدر أفيدك اليوم؟ سواء منتجات، أسعار، أو أي استفسار!`
          ];
          responses.push(pickRandom(variants));
        }
        break;
      }

      case 'farewell': {
        const variants = isEnglish ? [
          'Goodbye! Thanks for visiting Udream 🙏 Hope to see you again soon!',
          'Take care! If you ever need anything, I\'m always here 💚',
          'Bye bye! Happy shopping, and don\'t hesitate to reach out anytime 🛍️'
        ] : [
          'مع السلامة! شكرًا لزيارتك Udream 🙏 نتمنى نشوفك قريب!',
          'الله يسعدك! إذا احتجت أي شيء ثاني، أنا هنا دائمًا 💚',
          'باي باي! تسوق سعيد وإذا عندك أي سؤال مستقبلاً لا تتردد 🛍️'
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'thanks': {
        const variants = isEnglish ? [
          'You\'re welcome! Happy I could help 😊 If you have any other questions, I\'m here!',
          'Anytime! That\'s what I\'m here for 💚 Don\'t hesitate to ask anything.',
          'Glad to help! ✨ Is there anything else I can assist you with?'
        ] : [
          'العفو! سعيد إني قدرت أساعدك 😊 إذا عندك أي سؤال ثاني أنا جاهز!',
          'تسلم! ما سوينا إلا الواجب 💚 لا تتردد تسأل في أي وقت.',
          'الله يعافيك! خدمتك شرف لنا ✨ هل فيه شيء ثاني أقدر أساعدك فيه؟'
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'pricing': {
        const allPrices = products.map(p => `• ${pName(p)}: ${p.price} ${cur}`).join('\n');
        const variants = isEnglish ? [
          `Our prices are transparent & competitive! 💰\n\n${allPrices}\n\n🚚 Free shipping on orders over ${storeInfo.freeShippingMin} ${cur}`,
          `Here's our price list:\n\n${allPrices}\n\nFree shipping on orders above ${storeInfo.freeShippingMin} ${cur} 🎉`,
          `All prices in Saudi Riyals:\n\n${allPrices}\n\n💡 Tip: Order above ${storeInfo.freeShippingMin} ${cur} for free shipping!`
        ] : [
          `أسعارنا شفافة وتنافسية! 💰\n\n${allPrices}\n\n🚚 شحن مجاني للطلبات فوق ${storeInfo.freeShippingMin} ${cur}`,
          `تفضل قائمة الأسعار:\n\n${allPrices}\n\nوفيه شحن مجاني فوق ${storeInfo.freeShippingMin} ${cur} 🎉`,
          `كل أسعارنا بالريال السعودي:\n\n${allPrices}\n\n💡 نصيحة: اطلب فوق ${storeInfo.freeShippingMin} ${cur} وتحصل شحن مجاني!`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'shipping': {
        const variants = isEnglish ? [
          `🚚 Shipping Info:\n• Delivery within ${shipDays}\n• Free for orders over ${storeInfo.freeShippingMin} ${cur}\n• We deliver across all of ${country}\n• Tracking number for every order\n\nNeed more details?`,
          `We deliver everywhere in Saudi Arabia! 📦\nTime: ${shipDays}\nFree shipping above ${storeInfo.freeShippingMin} ${cur}\nYou'll get a tracking number right after shipping.`,
          `Fast & secure shipping! 🚀\n${shipDays} and your order is at your door.\nAbove ${storeInfo.freeShippingMin} ${cur}? Shipping is on us! 🎁`
        ] : [
          `🚚 معلومات الشحن:\n• التوصيل خلال ${shipDays}\n• مجاني للطلبات فوق ${storeInfo.freeShippingMin} ${cur}\n• نوصل لجميع مناطق ${country}\n• رقم تتبع لكل طلب\n\nهل تحتاج تفاصيل أكثر؟`,
          `نوصل لكل مكان في السعودية! 📦\nالمدة: ${shipDays}\nالشحن مجاني فوق ${storeInfo.freeShippingMin} ${cur}\nتحصل رقم تتبع فوري بعد الشحن.`,
          `شحننا سريع وآمن! 🚀\n${shipDays} وطلبك عندك.\nفوق ${storeInfo.freeShippingMin} ${cur}؟ الشحن علينا! 🎁`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'payment': {
        const methods = isEnglish ? storeInfo.paymentMethods.join(', ') : storeInfo.paymentMethodsAr.join('، ');
        const variants = isEnglish ? [
          `💳 Available payment methods:\n${methods}\n\nAll transactions are encrypted & secure 🔒`,
          `We support multiple payment options:\n${methods}\n\nEverything is protected with top security standards 🔐`,
          `Pay however you prefer:\n${methods}\n\n100% safe & guaranteed ✅`
        ] : [
          `💳 طرق الدفع المتاحة:\n${methods}\n\nجميع المعاملات مشفرة وآمنة 🔒`,
          `ندعم عدة طرق دفع:\n${methods}\n\nوكل شيء محمي بأعلى معايير الأمان 🔐`,
          `تقدر تدفع بالطريقة اللي تناسبك:\n${methods}\n\n100% آمن ومضمون ✅`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'returns': {
        const variants = isEnglish ? [
          `🔄 Return Policy:\n• Returns accepted within ${storeInfo.returnDays} days of delivery\n• Product must be in original condition & unused\n• Manufacturing defect? Shipping is on us!\n• Refund processed in 3-5 business days`,
          `Flexible return policy:\n${storeInfo.returnDays} days to return, product must be in original condition.\nManufacturing defect? We cover all costs! 💚`,
          `No worries! You can return within ${storeInfo.returnDays} days.\nJust make sure it's in original condition.\nIf there's a product defect — return & shipping are free ✅`
        ] : [
          `🔄 سياسة الاسترجاع:\n• يحق لك الاسترجاع خلال ${storeInfo.returnDays} أيام من الاستلام\n• المنتج لازم يكون بحالته الأصلية وغير مستخدم\n• في حال عيب مصنعي، الشحن علينا!\n• المبلغ يرجع خلال 3-5 أيام عمل`,
          `عندنا سياسة استرجاع مرنة:\n${storeInfo.returnDays} أيام للإرجاع، المنتج يكون بحالته الأصلية.\nعيب مصنعي؟ نتحمل كل التكاليف! 💚`,
          `لا تقلق! تقدر ترجع المنتج خلال ${storeInfo.returnDays} أيام.\nبس تأكد إنه بحالته الأصلية.\nإذا فيه مشكلة بالمنتج نفسه — الاسترجاع والشحن مجاني ✅`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'warranty': {
        const variants = isEnglish ? [
          `🛡️ All our products come with a ${storeInfo.warrantyYears}-year warranty against manufacturing defects.\nIf you face any issue, contact us and we'll resolve it ASAP!`,
          `${storeInfo.warrantyYears}-year warranty on all products!\nManufacturing defect? Free replacement or repair.\nYour satisfaction is our guarantee 💚`,
          `Every product is warranted for a full year ✅\nCovers: Manufacturing defects & quality issues.\nDoes not cover: Misuse or external damage.`
        ] : [
          `🛡️ جميع منتجاتنا تجي مع ضمان ${storeInfo.warrantyYears} سنة ضد العيوب الصناعية.\nإذا واجهت أي مشكلة، تواصل معنا وراح نحلها بأسرع وقت!`,
          `ضمان ${storeInfo.warrantyYears} سنة على جميع المنتجات!\nعيب صناعي؟ استبدال أو إصلاح مجاني.\nرضاكم ضماننا 💚`,
          `كل منتج مضمون لمدة سنة كاملة ✅\nتشمل: العيوب الصناعية ومشاكل التصنيع.\nما تشمل: سوء الاستخدام أو الأضرار الخارجية.`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'order': {
        const variants = isEnglish ? [
          `📦 About your order:\n• After payment, you get an instant confirmation\n• Shipping within 24 hours\n• Tracking number sent via message\n\nHave a specific order number? Contact us through the "Contact Us" page and we'll help!`,
          `After ordering, we prepare & ship within 1 business day.\nYou'll get a tracking number to follow your order.\nNeed help with a specific order? Give us the details! 📋`,
          `Your order goes through 3 stages:\n1️⃣ Payment confirmation\n2️⃣ Prep & shipping (within 24 hours)\n3️⃣ Delivery (${shipDays})\n\nTrack every step with your tracking number!`
        ] : [
          `📦 بخصوص طلبك:\n• بعد إتمام الدفع، تحصل رقم تأكيد فوري\n• يتم الشحن خلال 24 ساعة\n• رقم التتبع يوصلك برسالة\n\nإذا عندك رقم طلب محدد، تواصل معنا عبر صفحة "اتصل بنا" وراح نفيدك بالتفاصيل!`,
          `بعد ما تطلب، نجهز طلبك ونشحنه خلال يوم عمل.\nتحصل رقم تتبع تقدر تتابع فيه طلبك.\nمحتاج مساعدة بطلب معين؟ أعطنا التفاصيل! 📋`,
          `طلبك يمر بـ 3 مراحل:\n1️⃣ تأكيد الدفع\n2️⃣ تجهيز وشحن (خلال 24 ساعة)\n3️⃣ توصيل (${shipDays})\n\nتقدر تتابع كل خطوة برقم التتبع!`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'how_to_buy': {
        const variants = isEnglish ? [
          `🛒 Buying is super easy:\n1. Browse products and pick what you like\n2. Click "Add to Cart"\n3. Open the cart and click "Checkout"\n4. Enter your info & address\n5. Choose payment method & confirm ✅\n\nDone! Your order is on its way 🚀`,
          `Shopping with us is simple:\n• Choose product → Add to Cart → Checkout\n• Enter your address on the map\n• Pay your way\n• And your order is coming! 📦`,
          `Want to buy? Easy! 😊\nClick "Add to Cart" on any product, then open the cart and complete your order. Takes less than 2 minutes!`
        ] : [
          `🛒 طريقة الشراء سهلة جداً:\n1. تصفح المنتجات واختر اللي يعجبك\n2. اضغط "أضف إلى السلة"\n3. افتح السلة واضغط "إتمام الشراء"\n4. أدخل بياناتك وعنوانك\n5. اختر طريقة الدفع وأكد الطلب ✅\n\nوبس! طلبك في الطريق 🚀`,
          `الشراء عندنا بسيط:\n• اختر المنتج → أضف للسلة → إتمام الشراء\n• أدخل عنوانك على الخريطة\n• ادفع بالطريقة اللي تناسبك\n• وطلبك يوصلك! 📦`,
          `تبي تشتري؟ سهالت! 😊\nاضغط "أضف إلى السلة" على المنتج اللي تبيه، بعدين افتح السلة وأكمل الطلب. العملية ما تاخذ دقيقتين!`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'contact': {
        const variants = isEnglish ? [
          `📞 You can reach us:\n• Through the "Contact Us" form on the website\n• Or right here in the chat!\n\nI'm available 24/7 ✨`,
          `Get in touch however you prefer:\n• Smart chat (I'm right here! 🤖)\n• "Contact Us" form at the bottom of the page\n\nWe'll respond as fast as possible!`,
          `I'm always here! And for official inquiries, use the "Contact Us" form 📝\nWe typically respond within a few hours.`
        ] : [
          `📞 تقدر تتواصل معنا:\n• عبر نموذج "اتصل بنا" في الموقع\n• أو مباشرة من هنا في المحادثة!\n\nأنا متاح 24/7 لخدمتك ✨`,
          `تواصل معنا بالطريقة اللي تناسبك:\n• المحادثة الذكية (أنا هنا! 🤖)\n• نموذج اتصل بنا في أسفل الصفحة\n\nراح نرد عليك بأسرع وقت!`,
          `أنا موجود هنا دائمًا! وإذا تبي تواصل رسمي، استخدم نموذج "اتصل بنا" 📝\nنرد عادةً خلال ساعات قليلة.`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'about': {
        const variants = isEnglish ? [
          `✨ Udream — A Saudi store specializing in electronics & room accessories.\nWe offer practical, high-quality products at competitive prices.\nWe ship across all of ${country} 🇸🇦`,
          `Udream is your destination for everything smart & stylish for your desk & room! 🚀\nCarefully selected products, fast shipping, and warranty on everything.\nA shopping experience you deserve!`,
          `We're Udream — we believe your space deserves the best! ✨\nElectronic & desk accessories with modern designs.\n100% Saudi store 🇸🇦`
        ] : [
          `✨ Udream — متجر سعودي متخصص في إكسسوارات الإلكترونيات والغرف.\nنوفر لك منتجات عملية بجودة عالية وأسعار منافسة.\nنشحن لكل مناطق المملكة 🇸🇦`,
          `Udream هو وجهتك لكل ما هو ذكي وأنيق للمكتب والغرفة! 🚀\nمنتجات مختارة بعناية، شحن سريع، وضمان على كل شيء.\nتجربة تسوق تستاهلها!`,
          `نحن Udream — نؤمن إن مكانك يستاهل الأفضل! ✨\nإكسسوارات إلكترونية ومكتبية بتصاميم عصرية.\nمتجر سعودي 100% 🇸🇦`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'recommend': {
        const cartItems = cart.map(c => c.name);
        let rec;
        if (cartItems.length > 0) {
          const notInCart = products.filter(p => !cartItems.includes(p.nameEn));
          if (notInCart.length > 0) {
            const pick = notInCart[Math.floor(Math.random() * notInCart.length)];
            rec = isEnglish
              ? `Based on your cart, I recommend the "${pick.nameEn}" for ${pick.price} ${cur} — it complements what you have! 🔥\n${pick.descEn}`
              : `بناءً على سلتك، أنصحك بـ "${pick.nameAr}" بسعر ${pick.price} ${cur} — يكمل اللي عندك! 🔥\n${pick.descAr}`;
          } else {
            rec = isEnglish
              ? 'Mashallah, you have all our products in cart! 😄 Excellent choices — go ahead and checkout, they\'ll arrive ASAP!'
              : 'ماشاء الله عندك كل منتجاتنا في السلة! 😄 اختيارات ممتازة، أكمل الطلب وراح توصلك بأسرع وقت!';
          }
        } else {
          const variants = isEnglish ? [
            `Our most popular product: "${products[0].nameEn}" at ${products[0].price} ${cur} 🔥\nWant great audio? "${products[1].nameEn}" at ${products[1].price} ${cur}\n\nWhat do you use most so I can recommend the right one?`,
            `All our products are excellent, but let me help:\n🎮 Gamer or streamer? → RGB Lamp + Earbuds\n💼 Work & study? → Desk Organizer + Charging Dock\n🎁 Gift? → Charging Dock is a safe bet!\n\nWhat's your main use?`,
            `I recommend checking out:\n⭐ "${products[2].nameEn}" — customer favorite\n⭐ "${products[0].nameEn}" — adds an amazing vibe to your desk\n\nTell me what you need and I'll help more!`
          ] : [
            `أكثر منتج مطلوب عندنا: "${products[0].nameAr}" بـ ${products[0].price} ${cur} 🔥\nوإذا تبي صوت ممتاز: "${products[1].nameAr}" بـ ${products[1].price} ${cur}\n\nوش تستخدم أكثر عشان أنصحك بالمناسب؟`,
            `كل منتجاتنا ممتازة، بس خلني أساعدك:\n🎮 قيمر أو بث؟ → المصباح RGB + السماعات\n💼 شغل ودراسة؟ → منظم المكتب + محطة الشحن\n🎁 هدية؟ → محطة الشحن خيار مضمون!\n\nايش استخدامك الأساسي؟`,
            `أنصحك تشوف:\n⭐ "${products[2].nameAr}" — أكثر منتج يحبه عملائنا\n⭐ "${products[0].nameAr}" — يضيف لمسة رهيبة لمكتبك\n\nقولي وش تحتاج بالضبط وأساعدك أكثر!`
          ];
          rec = pickRandom(variants);
        }
        responses.push(rec);
        break;
      }

      case 'all_products': {
        const list = products.map(p => `• ${pName(p)} — ${p.price} ${cur}`).join('\n');
        const variants = isEnglish ? [
          `📦 Our current products:\n\n${list}\n\nAll in stock & ready to ship! Want details on a specific one?`,
          `We have an awesome collection:\n\n${list}\n\n🛒 Pick what you like and I can give you more details!`,
          `Here's our product list:\n\n${list}\n\nAll with ${storeInfo.warrantyYears}-year warranty + free shipping above ${storeInfo.freeShippingMin} ${cur} 🎉`
        ] : [
          `📦 منتجاتنا الحالية:\n\n${list}\n\nكلها متوفرة وجاهزة للشحن! هل تبي تفاصيل عن منتج معين؟`,
          `عندنا مجموعة مميزة:\n\n${list}\n\n🛒 اختر اللي يعجبك وأقدر أعطيك تفاصيل أكثر!`,
          `تفضل قائمة المنتجات:\n\n${list}\n\nكلها بضمان سنة + شحن مجاني فوق ${storeInfo.freeShippingMin} ${cur} 🎉`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'policies': {
        responses.push(isEnglish
          ? '📋 You can check out:\n• Terms & Conditions: click the link at the bottom of the page\n• Privacy Policy: also at the bottom of the page\n\nYour data is protected and never shared with third parties 🔒'
          : '📋 تقدر تطلع على:\n• الشروط والأحكام: اضغط على الرابط في أسفل الصفحة\n• سياسة الخصوصية: موجودة أيضًا في أسفل الصفحة\n\nبياناتك محمية عندنا ولا نشاركها مع أي طرف ثالث 🔒');
        break;
      }

      case 'help': {
        const variants = isEnglish ? [
          `I'm the Udream smart assistant! I can help you with:\n\n🛍️ Product info & pricing\n🚚 Shipping & delivery\n💳 Payment methods\n🔄 Returns & exchanges\n🛡️ Warranty\n📦 Order status\n💡 Recommendations & deals\n\nAsk me anything!`,
          `Hi! I'm here to help 😊\nAsk me about: products, prices, shipping, payment, returns, or anything!\nTry typing: "What's the best product?" or "How do I order?"`,
          `How can I help? 🤔\n\nI can assist with:\n• Choosing the right product\n• Prices & deals\n• Shipping & payment details\n• Any other question!\n\nJust type your question and I'm ready 💪`
        ] : [
          `أنا مساعد Udream الذكي! أقدر أساعدك في:\n\n🛍️ معلومات المنتجات والأسعار\n🚚 الشحن والتوصيل\n💳 طرق الدفع\n🔄 الاسترجاع والاستبدال\n🛡️ الضمان\n📦 حالة الطلب\n💡 توصيات وعروض\n\nاسألني أي شيء!`,
          `أهلاً! أنا هنا عشان أخدمك 😊\nاسألني عن: المنتجات، الأسعار، الشحن، الدفع، الإرجاع، أو أي شيء!\nجرب تكتب مثلاً: "ايش أفضل منتج؟" أو "كيف أشتري؟"`,
          `كيف أقدر أفيدك؟ 🤔\n\nممكن أساعدك في:\n• اختيار المنتج المناسب\n• معرفة الأسعار والعروض\n• تفاصيل الشحن والدفع\n• أي سؤال ثاني!\n\nبس اكتب سؤالك وأنا جاهز 💪`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'availability': {
        responses.push(isEnglish
          ? 'All listed products are currently in stock & ready to ship! ✅\nIf a product sells out, we remove it from the site immediately.\nAsking about a specific product?'
          : 'جميع المنتجات المعروضة متوفرة حاليًا وجاهزة للشحن! ✅\nإذا نفذ منتج معين، نشيله من الموقع مباشرة.\nهل تسأل عن منتج محدد؟');
        break;
      }

      case 'gift': {
        const variants = isEnglish ? [
          `🎁 Looking for a gift? We have great options:\n• Charging Dock (${products[2].price} ${cur}) — practical & elegant\n• Smart RGB Lamp (${products[0].price} ${cur}) — will surprise anyone!\n\nAll products arrive in neat packaging 📦`,
          `A tech gift always makes people happy! 🎉\nI recommend the Charging Dock or Smart RGB Lamp — nobody says no to those!\nAll delivered in gift-ready packaging.`
        ] : [
          `🎁 تدور هدية؟ عندنا خيارات رهيبة:\n• محطة الشحن (${products[2].price} ${cur}) — هدية عملية ومميزة\n• المصباح الذكي (${products[0].price} ${cur}) — يفاجئ أي شخص!\n\nكل المنتجات توصل بتغليف أنيق 📦`,
          `هدية تقنية دايم تفرح! 🎉\nأنصحك بمحطة الشحن أو المصباح الذكي — ما أحد يرفضها!\nكلها توصل بشكل مرتب ومناسب كهدية.`
        ];
        responses.push(pickRandom(variants));
        break;
      }

      case 'unknown':
      default: {
        const cartCount = cart.length;
        let context = '';
        if (cartCount > 0) {
          context = isEnglish
            ? `\n\n💡 By the way, you have ${cartCount} item(s) in your cart. Ready to checkout?`
            : `\n\n💡 بالمناسبة، عندك ${cartCount} منتج في السلة. تبي تكمل الطلب؟`;
        }

        const variants = isEnglish ? [
          `I didn't quite get that 😅 But I can help you with:\n• Products & prices\n• Shipping & delivery\n• Payment methods\n• Returns & warranty\n\nTry asking in a different way!${context}`,
          `Good question! But let me understand better 🤔\nCould you clarify what you need?\nFor example: "How much are the earbuds?" or "How do I order?"${context}`,
          `Sorry, I couldn't understand your request 😊\nNo worries — try asking about:\n🛍️ A specific product\n💰 Prices\n🚚 Shipping\n\nAnd I'll be happy to help!${context}`,
          `Hmm 🤔 I might have misunderstood.\nI'm specialized in:\n• Udream products\n• Orders & shipping\n• Payment & returns\n\nTry rephrasing and I'll help you out!${context}`
        ] : [
          `ما فهمت سؤالك بالضبط 😅 بس أنا أقدر أساعدك في:\n• المنتجات والأسعار\n• الشحن والتوصيل\n• طرق الدفع\n• الاسترجاع والضمان\n\nجرب تسألني بطريقة ثانية!${context}`,
          `سؤال حلو! بس خلني أفهمك أكثر 🤔\nممكن توضح لي ايش تبي بالضبط؟\nمثلاً: "كم سعر السماعات؟" أو "كيف أطلب؟"${context}`,
          `أعتذر، ما قدرت أفهم طلبك 😊\nبس لا تقلق — جرب تسأل عن:\n🛍️ منتج معين\n💰 الأسعار\n🚚 الشحن\n\nوأنا جاهز أفيدك!${context}`,
          `هممم 🤔 ممكن أكون ما فهمت صح.\nأنا مساعد متخصص في:\n• منتجات Udream\n• الطلبات والشحن\n• الدفع والاسترجاع\n\nاكتب لي سؤالك بشكل ثاني وراح أساعدك!${context}`
        ];
        responses.push(pickRandom(variants));
        break;
      }
    }
  }

  // Combine multiple intent responses
  return responses.join('\n\n─────────\n\n');
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

openCartButton.addEventListener('click', openCart);
closeCartButton.addEventListener('click', closeCart);

document.addEventListener('click', event => {
  if (event.target.classList.contains('add-to-cart')) {
    const product = event.target.dataset.product;
    const price = event.target.dataset.price;
    addToCart(product, price);
  }
  // Removed cart-item-remove listener since it's now attached directly in updateCartDisplay
});

checkoutBtn.addEventListener('click', () => {
  if (cart.length === 0) {
    alert('سلتك فارغة! أضف بعض المنتجات أولاً.');
    return;
  }
  showCheckout();
});

// ===== Coupon Newsletter Form =====
const couponForm = document.getElementById('coupon-form');
if (couponForm) {
  couponForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('coupon-email');
    const btn = document.getElementById('coupon-btn');
    const msg = document.getElementById('coupon-msg');
    const email = emailInput.value.trim();

    if (!email) return;

    btn.disabled = true;
    btn.textContent = '⏳ جاري الإرسال...';
    msg.style.display = 'none';

    try {
      const res = await fetch('/api/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      msg.style.display = 'block';
      if (data.success) {
        msg.style.color = '#0d9669';
        msg.textContent = '🎉 ' + data.message;
        emailInput.value = '';
      } else {
        msg.style.color = '#ef4444';
        msg.textContent = data.error;
      }
    } catch (err) {
      msg.style.display = 'block';
      msg.style.color = '#ef4444';
      msg.textContent = 'حدث خطأ، حاول مرة أخرى لاحقاً';
    }

    btn.disabled = false;
    btn.textContent = '🎉 احصل على الخصم';
  });
}
