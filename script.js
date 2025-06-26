document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const productDisplayArea = document.getElementById('product-display-area');
    const chatSpinner = document.getElementById('chat-spinner');
    const productSpinner = document.getElementById('product-spinner');
    const productErrorMessage = document.getElementById('product-error-message');

    // === TUS CLAVES API ESTÁN INSERTADAS AQUÍ. TEN EN CUENTA LA ADVERTENCIA DE SEGURIDAD ANTERIOR. ===
    const DEEPSEEK_API_KEY = "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";
    const RAPIDAPI_KEY = "fc3af22cc3msh41c305ad918e17cp1659e4jsnbb9ff6802d24";
    // ==============================================================================================

    // Direct API Endpoints
    const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
    const RAPIDAPI_SEARCH_URL = "https://real-time-product-search.p.rapidapi.com/search";
    const RAPIDAPI_HOST = "real-time-product-search.p.rapidapi.com";


    let conversationHistory = []; // Stores messages for AI context

    // --- Helper Functions ---
    /**
     * Displays a message in the chat window.
     * @param {string} sender - 'user' or 'ai'.
     * @param {string} message - The message content.
     */
    function displayMessage(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', sender === 'user' ? 'user-message' : 'ai-message');

        const tempDiv = document.createElement('div');
        tempDiv.textContent = message;
        messageElement.innerHTML = tempDiv.innerHTML.replace(/\n/g, '<br>'); // Replace newlines with <br> for HTML display

        chatWindow.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight; // Auto-scroll to bottom
    }

    /**
     * Shows/hides the chat loading spinner.
     * @param {boolean} show - true to show, false to hide.
     */
    function showChatSpinner(show) {
        chatSpinner.style.display = show ? 'block' : 'none';
    }

    /**
     * Shows/hides the product search loading spinner.
     * @param {boolean} show - true to show, false to hide.
     */
    function showProductSpinner(show) {
        productSpinner.style.display = show ? 'block' : 'none';
    }

    /**
     * Displays an error message in the product display area.
     * @param {string} message - The error message.
     */
    function showProductError(message) {
        productErrorMessage.textContent = message;
        productErrorMessage.style.display = 'block';
        productDisplayArea.innerHTML = ''; // Clear any existing products
    }

    /**
     * Hides the product error message.
     */
    function hideProductError() {
        productErrorMessage.style.display = 'none';
    }

    /**
     * Extracts a user-friendly source name from a product URL.
     * @param {string} productUrl - The URL of the product.
     * @returns {string} The name of the source (e.g., "Amazon", "eBay", or "Other").
     */
    function extractSource(productUrl) {
        if (!productUrl) return 'Other';
        try {
            const url = new URL(productUrl);
            const hostname = url.hostname.toLowerCase();
            if (hostname.includes('amazon.')) return 'Amazon';
            if (hostname.includes('ebay.')) return 'eBay';
            if (hostname.includes('walmart.')) return 'Walmart';
            if (hostname.includes('target.')) return 'Target';
            if (hostname.includes('bestbuy.')) return 'Best Buy';
            if (hostname.includes('shopee.')) return 'Shopee';
            if (hostname.includes('aliexpress.')) return 'AliExpress';
            const domainParts = hostname.replace(/^www\./, '').split('.');
            return domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
        } catch (e) {
            return 'Other';
        }
    }

    // --- Core API Interaction Logic ---
    async function handleSendMessage() {
        const userMessageText = userInput.value.trim();
        if (!userMessageText) return;

        displayMessage('user', userMessageText);
        conversationHistory.push({ role: 'user', content: userMessageText });
        userInput.value = '';
        showChatSpinner(true);
        hideProductError();
        productDisplayArea.innerHTML = '';

        if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === "TU_KEY_DEEPSEEK_AQUI") {
            displayMessage('ai', "Error: La clave API de Deepseek no está configurada. Abre script.js y añade tu clave.");
            showChatSpinner(false);
            return;
        }

        try {
            // System prompt to guide Deepseek's behavior
            const systemPrompt = {
                "role": "system",
                "content": (
                    "You are a friendly and helpful AI product assistant. "
                    "Your main goal is to understand the user's product needs through conversation. "
                    "Ask clarifying questions to gather enough detail (e.g., purpose, budget, specific features). "
                    "Once you have sufficient information to initiate a product search, you MUST respond "
                    "ONLY with a JSON object in the exact format: "
                    "{\"action\": \"search\", \"keywords\": [\"keyword1\", \"keyword2\", \"feature\"]}. "
                    "The 'keywords' array should contain relevant search terms based on user's request. "
                    "Do NOT include any extra text or explanation before or after this JSON object when issuing a search. "
                    "If you need more details, simply continue the conversation naturally without outputting JSON. "
                    "Do not explicitly ask 'Are you ready to search?', just provide the JSON when ready."
                )
            };

            const payload = {
                "model": "deepseek-chat",
                "messages": [systemPrompt].concat(conversationHistory),
                "max_tokens": 1024,
                "temperature": 0.7,
            };

            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error desconocido de Deepseek." }));
                throw new Error(errorData.message || `Error de la API de Deepseek: ${response.status}`);
            }

            const data = await response.json();
            const aiMessageContent = data.choices[0].message.content;

            let action = null;
            let userDisplayReply = aiMessageContent;

            // Attempt to parse AI's message as JSON for a search action
            try {
                if (aiMessageContent.trim().startsWith("{") && aiMessageContent.trim().endsWith("}")) {
                    const parsedAction = JSON.parse(aiMessageContent);
                    if (parsedAction.action === 'search' && Array.isArray(parsedAction.keywords) && parsedAction.keywords.length > 0) {
                        action = parsedAction;
                        userDisplayReply = "¡De acuerdo, estoy buscando productos según tu solicitud ahora!";
                    }
                }
            } catch (e) {
                // Not valid JSON, continue with text reply
            }

            displayMessage('ai', userDisplayReply);
            conversationHistory.push({ role: 'assistant', content: aiMessageContent }); // Store original AI content for context

            if (action && action.action === 'search' && action.keywords) {
                await searchProducts(action.keywords);
            }

        } catch (error) {
            console.error('Error en la interacción con Deepseek:', error);
            displayMessage('ai', `Lo siento, encontré un error con la IA: ${error.message}. Por favor, inténtalo de nuevo.`);
            conversationHistory.push({ role: 'assistant', content: `Error: ${error.message}` });
        } finally {
            showChatSpinner(false);
        }
    }

    async function searchProducts(keywords) {
        if (!keywords || keywords.length === 0) {
            showProductError("La IA no proporcionó palabras clave válidas para buscar.");
            return;
        }

        if (!RAPIDAPI_KEY || RAPIDAPI_KEY === "TU_KEY_RAPIDAPI_AQUI") {
            showProductError("Error: La clave API de RapidAPI no está configurada. Abre script.js y añade tu clave.");
            showProductSpinner(false);
            return;
        }

        showProductSpinner(true);
        productDisplayArea.innerHTML = '';
        hideProductError();

        const query = keywords.join(' ');
        const url = new URL(RAPIDAPI_SEARCH_URL);
        url.searchParams.append('q', query);
        url.searchParams.append('country', 'us');
        url.searchParams.append('language', 'en');
        url.searchParams.append('page', '1');

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': RAPIDAPI_HOST,
                    'x-rapidapi-key': RAPIDAPI_KEY
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Error desconocido de RapidAPI." }));
                throw new Error(errorData.message || `Error de la API de RapidAPI: ${response.status}`);
            }

            const rapidapiData = await response.json();
            // RapidAPI returns products nested under 'data' key
            const products = rapidapiData.data && Array.isArray(rapidapiData.data.products) ? rapidapiData.data.products : [];

            displayProducts(products);

        } catch (error) {
            console.error('Error al buscar productos:', error);
            showProductError(`No se pudieron buscar productos: ${error.message}. Intenta una consulta diferente.`);
        } finally {
            showProductSpinner(false);
        }
    }

    // --- Product Display ---
    function displayProducts(products) {
        productDisplayArea.innerHTML = '';
        hideProductError();

        if (!products || products.length === 0) {
            showProductError('No se encontraron productos que coincidan con tus criterios. Intenta reformular tu solicitud o ser más específico.');
            return;
        }

        products.forEach(product => {
            const productTitle = product.product_title || 'No Title Available';
            const imageUrl = (product.product_photos && product.product_photos[0]) || 'https://via.placeholder.com/200x150.png?text=No+Image';
            const productPrice = (product.offer && product.offer.price) || 'Price Not Available';
            const productUrl = (product.offer && product.offer.offer_page_url) || product.product_url || '#';
            const sourceName = extractSource(productUrl);

            const productCardHtml = `
                <div class="col-md-4 col-sm-6 mb-4">
                    <div class="card product-card h-100">
                        <img src="${imageUrl}" class="card-img-top" alt="${productTitle}">
                        <div class="card-body">
                            <h5 class="card-title" title="${productTitle}">${productTitle}</h5>
                            <p class="card-text price">${productPrice}</p>
                            <p class="card-text source">Fuente: ${sourceName}</p>
                        </div>
                        <div class="card-footer text-center">
                             <a href="${productUrl}" target="_blank" class="btn btn-success w-100">Ver Producto</a>
                        </div>
                    </div>
                </div>
            `;
            productDisplayArea.insertAdjacentHTML('beforeend', productCardHtml);
        });
    }

    // --- Event Listeners ---
    sendButton.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // --- Initial AI Greeting ---
    function initialGreeting() {
        const greeting = "¡Hola! Soy tu asistente de productos con IA. Dime, ¿qué tipo de producto estás buscando hoy y cuáles son tus necesidades?";
        conversationHistory.push({ role: 'assistant', content: greeting });
        displayMessage('ai', greeting);
    }

    initialGreeting();
});
