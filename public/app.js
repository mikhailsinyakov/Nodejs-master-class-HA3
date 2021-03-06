const app = {};

app.config = {
    sessionToken: null,
    currentPage: null,
    pagesForAllUsers: ['index', 'accountCreate', 'sessionCreate', 'sessionDeleted', 'accountDeleted']
};

app.stripeElements = {
    stripe: null,
    card: null
};

app.getCurrentPageName = () => {
    let bodyId = document.querySelector('body').id;
    if (typeof bodyId == 'string' && bodyId.length > 0) {
        app.config.currentPage = bodyId;
    }
};

// Get the token object from localStorage
app.getToken = () => {

    let token;
    try {
        token = JSON.parse(localStorage.getItem('token'));
    } catch(e) {
        token = null;
    }
    if (!token) {
        app.removeTokenAndRedirect('/');
    } else {
        app.config.sessionToken = token;

        const queryStringObject = { id: token.tokenId };
        app.client.request(undefined, '/api/tokens', 'GET', queryStringObject, undefined)
            .then(response => {
                const { statusCode, responsePayload } = response;
                if (statusCode != 200) {
                    app.removeTokenAndRedirect('/');
                    return;
                }
                app.showNeededNavItems('loggedIn');
                app.renewalToken();
            }).catch(e => app.removeTokenAndRedirect('/'));
        
    }
};

// Run app.removeTokenAndRedirect when logOutAnchor has been clicked
app.bindLogOutAnchor = () => {
    const logOutAnchor = document.querySelector('#logOut');
    if (logOutAnchor) {
        logOutAnchor.addEventListener('click', function(e) {
            e.preventDefault();
            app.removeTokenAndRedirect('session/deleted');
        });
    }
}

// When the form has been submit, send the request via AJAX
app.bindForms = () => {
    const allForms = Array.from(document.querySelectorAll('form'));
    allForms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (app.config.currentPage != 'order') {
                app.submitForm(e, this);
            } else {
                app.createStripeToken()
                    .then(token => {
                        document.querySelector('#stripeToken').value = token.id;
                        app.submitForm(e, this);
                    }).catch(e => {
                        console.log(e)
                        const displayError = document.querySelector('#card-errors');
                        displayError.innerHTML = e.message;
                        displayError.style.display = 'block';
                    });
            }
        });
    });
};

app.submitForm = (e, form) => {
    const path = form.action;
    let method = form.method.toUpperCase();
    let queryStringObject = {};
    let requestPayload = {};
    const elements = Array.from(form.elements);
    elements.forEach(element => {
        if (element.name == '_method') {
            method = element.value;
        } else {
            requestPayload[element.name] = element.value;
        }
    });
    if (method == 'DELETE') {
        queryStringObject = { ...requestPayload };
        requestPayload = {};
    }

    // Set another button name while request is loading
    const submitPaymentBtn = document.querySelector('#submitPayment');
    if (submitPaymentBtn) {
        submitPaymentBtn.innerHTML = 'Loading ...';
    }
    
    app.client.request(undefined, path, method, queryStringObject, requestPayload)
        .then(response => {
            const { statusCode, responsePayload } = response;
            app.processFormSubmission(form.id, requestPayload, statusCode, responsePayload);
        }).catch(console.error);
};

app.createStripeToken = () => {
    const { stripe, card } = app.stripeElements;

    return stripe.createToken(card)
        .then(result => {
            if (result.error) {
                throw result.error;
            } 
            return result.token;
        });
};

app.processFormSubmission = (formId, requestPayload, statusCode, responsePayload) => {
    const formSuccess = document.querySelector(`#${formId} .formSuccess`);

    app.showOrHideFormMessage(formId, false, false);
    if (formSuccess) {
        app.showOrHideFormMessage(formId, true, false);
    }

    if (statusCode != 200) {
        app.showOrHideFormMessage(formId, false, true, responsePayload.Error);
        return;
    } 

    if (formId == 'accountCreateForm') {
        // Create a new token
        const { email, password } = requestPayload;
        const payload = { email, password };
        app.client.request(undefined, '/api/tokens', 'POST', undefined, payload)
            .then(response => {
                const { statusCode, responsePayload: anotherResponsePayload } = response;
                if (statusCode != 200) {
                    app.showOrHideFormMessage(formId, false, true, anotherResponsePayload.Error);
                    return;
                }
                app.successLogin(anotherResponsePayload);
            }).catch(console.error);
    }

    if (formId == 'sessionCreateForm') {
        app.successLogin(responsePayload);
    }

    if (formId == 'accountEditForm1') {
        const successMessage = 'Your account data has been changed';
        app.showOrHideFormMessage(formId, true, true, successMessage);
    }

    if (formId == 'accountEditForm2') {
        const successMessage = 'Your password has been changed';
        app.showOrHideFormMessage(formId, true, true, successMessage);
    }

    if (formId == 'accountEditForm3') {
        app.removeTokenAndRedirect('/account/deleted');
    }

    if (formId == 'makeOrderForm') {

        // Set previous button name
        const submitPaymentBtn = document.querySelector('#submitPayment');
        if (submitPaymentBtn) {
            submitPaymentBtn.innerHTML = 'Submit Payment';
        }

        const email = document.querySelector('#email').value;
        const data = {
            type: 'successOrder',
            email
        };

        app.showNotification(null, data, true, () => {
            window.location = '/menu';
        });
    }
};


app.loadDataOnPage = () => {
    if (app.config.currentPage == 'accountEdit') {
        app.getAccountData()
            .then(app.fillFormFields)
            .catch(console.error);
    } 
    if (app.config.currentPage == 'menu') {
        app.getMenuData()
            .then(app.fillMenuItems)
            .catch(console.error);
    }
    if (app.config.currentPage == 'shoppingCart') {
        app.getCartData()
            .then(app.fillShoppingCart)
            .catch(console.error);
    }
    if (app.config.currentPage == 'order') {
        app.getCartData()
            .then(app.fillOrderPrice)
            .catch(console.error);
    }
};

app.getAccountData = () => {
    const token = app.config.sessionToken;
    if (!token) {
        app.removeTokenAndRedirect('/');
        return Promise.reject();
    }
    const queryStringObject = { email: token.email };
    return app.client.request(undefined, '/api/users', 'GET', queryStringObject, undefined)
        .then(response => {
            const { statusCode, responsePayload } = response;
            if (statusCode != 200) {
                app.removeTokenAndRedirect('/');
                return;
            }
            return responsePayload;
        });
};

app.getMenuData = () => {
    const token = app.config.sessionToken;
    if (!token) {
        app.removeTokenAndRedirect('/');
        return Promise.reject();
    }
    return app.client.request(undefined, '/api/menu', 'GET', undefined, undefined)
        .then(response => {
            const { statusCode, responsePayload } = response;
            if (statusCode != 200) {
                app.removeTokenAndRedirect('/');
                return;
            }
            return responsePayload;
        });
};

app.getCartData = () => {
    const token = app.config.sessionToken;
    if (!token) {
        app.removeTokenAndRedirect('/');
        return Promise.reject();
    }
    return app.client.request(undefined, '/api/carts', 'GET', undefined, undefined)
        .then(response => {
            const { statusCode, responsePayload } = response;
            if (statusCode != 200) {
                app.removeTokenAndRedirect('/');
                return;
            }
            return responsePayload;
        });
};

app.fillFormFields = data => {
    const allForms = Array.from(document.querySelectorAll('form'));
    allForms.forEach(form => {
        const elements = Array.from(form.elements);
        elements.forEach(element => {
            if (data[element.name]) {
                element.value = data[element.name];
            }
        });
    });
};

app.fillMenuItems = data => {
    const container = document.querySelector('#menuItems');
    data.forEach(item => {
        const elem = document.createElement('div');
        elem.classList.add('menuItem');
        elem.dataset.id = item.id;
        elem.addEventListener('click', app.addItemToCart);

        const nameElem = document.createElement('div');
        nameElem.classList.add('itemName');
        nameElem.innerHTML = item.name;
        const priceElem = document.createElement('div');
        priceElem.classList.add('itemPrice');
        priceElem.innerHTML = '$' + item.price.toFixed(2);
        const descriptionElem = document.createElement('div');
        descriptionElem.classList.add('itemDescription');
        descriptionElem.innerHTML = item.description;
        const ctaWrapper = document.createElement('div');
        ctaWrapper.classList.add('ctaWrapper');

        const addToCartBtn = document.createElement('button');
        addToCartBtn.classList.add('cta');
        addToCartBtn.classList.add('green');
        addToCartBtn.classList.add('addToCart');
        addToCartBtn.type = 'button';
        addToCartBtn.innerHTML = 'Add To Cart';
        ctaWrapper.appendChild(addToCartBtn);

        elem.appendChild(nameElem);
        elem.appendChild(priceElem);
        elem.appendChild(descriptionElem);
        elem.appendChild(ctaWrapper);

        container.appendChild(elem);
    });
};

app.fillShoppingCart = data => {
    const container = document.querySelector('#cart');

    // Remove all the children of container (for updating purpose)
    while (cart.firstChild) {
        cart.removeChild(cart.firstChild);
    }

    if (!data.items.length) {
        const noItemsWrapper = document.createElement('div');
        noItemsWrapper.classList.add('noItemsWrapper');

        const elem1 = document.createElement('h2');
        elem1.innerHTML = 'You have not added any items to the cart yet';
        const elem2 = document.createElement('h2');
        elem2.innerHTML = 'You can select items on the <a href="/menu">menu</a> page';
        noItemsWrapper.appendChild(elem1);
        noItemsWrapper.appendChild(elem2);

        container.appendChild(noItemsWrapper);

        return;
    }

    const elem = document.createElement('div');
    elem.classList.add('productHeader');

    const nameElem = document.createElement('div');
    nameElem.classList.add('productNameHeader');
    nameElem.innerHTML = 'Name';
    const numberElem = document.createElement('div');
    numberElem.classList.add('productNumberHeader');
    numberElem.innerHTML = 'Number';
    const priceElem = document.createElement('div');
    priceElem.classList.add('productTotalPriceHeader');
    priceElem.innerHTML = 'Total price';

    elem.appendChild(nameElem);
    elem.appendChild(numberElem);
    elem.appendChild(priceElem);

    container.appendChild(elem);

    data.items.forEach(item => {
        const elem = document.createElement('div');
        elem.classList.add('productItem');
        elem.dataset.id = item.id;
        elem.addEventListener('click', e => {
            if (e.target.classList.contains('fa-arrow-down')) {
                app.removeOneItemFromCart(e);
            }
            if (e.target.classList.contains('fa-arrow-up')) {
                app.addOneMoreItemToCart(e);
            }
        });

        const nameElem = document.createElement('div');
        nameElem.classList.add('productName');
        nameElem.innerHTML = item.name + ' ($' + item.price.toFixed(2) + ')';
        const numberElem = document.createElement('div');
        numberElem.classList.add('productNumber');
        const pieces = item.number + (item.number > 1 ? 'pcs' : 'pc');
        numberElem.innerHTML = `<i class="fas fa-arrow-down"></i> ${pieces} <i class="fas fa-arrow-up"></i>`;
        const priceElem = document.createElement('div');
        priceElem.classList.add('productTotalPrice');
        priceElem.innerHTML = '$' + (item.price * item.number).toFixed(2);

        elem.appendChild(nameElem);
        elem.appendChild(numberElem);
        elem.appendChild(priceElem);

        container.appendChild(elem);
    });

    const totalPriceElem = document.createElement('div');
    totalPriceElem.classList.add('totalPrice');

    const elem1 = document.createElement('div');
    const elem2 = document.createElement('div');
    elem1.innerHTML = 'Total price:';
    elem2.innerHTML = '$' + data.sum.toFixed(2);

    const ctaWrapper = document.createElement('div');
    ctaWrapper.classList.add('ctaWrapper');
    const btn = document.createElement('button');
    btn.classList.add('cta');
    btn.classList.add('green');
    btn.type = 'button';
    btn.innerHTML = 'Make an Order';
    btn.addEventListener('click', e => {
        e.preventDefault();
        window.location = '/order';
    });
    ctaWrapper.appendChild(btn);

    totalPriceElem.appendChild(elem1);
    totalPriceElem.appendChild(elem2);
    totalPriceElem.appendChild(ctaWrapper);

    container.appendChild(totalPriceElem);
};

app.fillOrderPrice = data => {
    const orderPriceElem = document.querySelector('.orderPrice');
    const emailInput = document.querySelector('#email');
    orderPriceElem.innerHTML = '$' + data.sum.toFixed(2);
    emailInput.value = data.email;
};

app.addItemToCart = e => {
    // If a click event happens on button element, add the item to the cart
    if (e.target.classList.contains('addToCart')) {
        e.preventDefault();
        const menuItemElement = e.currentTarget;
        const itemId = menuItemElement.dataset.id;
        const path = `/api/carts/${itemId}`;
        app.client.request(undefined, path, 'POST', undefined, undefined)
            .then(response => {
                const { statusCode } = response;
                if (statusCode != 200) {
                    app.showNotification('Something went wrong. Try reload the page');
                    return;
                }
                const itemName = document.querySelector(`.menuItem[data-id="${itemId}"] .itemName`).innerHTML;
                const itemPrice = document.querySelector(`.menuItem[data-id="${itemId}"] .itemPrice`).innerHTML;
                const data = {
                    type: 'changeCartItems',
                    action: 'added',
                    itemName,
                    itemPrice
                };
                app.showNotification(null, data);
            }).catch(console.error);
    }
};

app.addOneMoreItemToCart = e => {
    const productItemElem = e.currentTarget;
    const itemId = productItemElem.dataset.id;
    const path = `/api/carts/${itemId}`;
    
    app.client.request(undefined, path, 'POST', undefined, undefined)
        .then(response => {
            const { statusCode } = response;
            if (statusCode != 200) {
                app.showNotification('Something went wrong. Try reload the page');
                return;
            }
            const productName = document.querySelector(`.productItem[data-id="${itemId}"] .productName`).innerHTML;
            const itemName = productName.split(' (')[0];
            const itemPrice = productName.split('(')[1].slice(0, -1);
            const data = {
                type: 'changeCartItems',
                action: 'added',
                itemName,
                itemPrice
            };
            app.showNotification(null, data);
            setTimeout(() => {
                app.getCartData()
                    .then(app.fillShoppingCart)
                    .catch(console.error);
            }, 2.5 * 1000);
        }).catch(console.error);
};

app.removeOneItemFromCart = e => {
    const productItemElem = e.currentTarget;
    const itemId = productItemElem.dataset.id;
    const path = `/api/carts/${itemId}`;
    
    app.client.request(undefined, path, 'DELETE', undefined, undefined)
        .then(response => {
            const { statusCode } = response;
            if (statusCode != 200) {
                app.showNotification('Something went wrong. Try reload the page');
                return;
            }
            const productName = document.querySelector(`.productItem[data-id="${itemId}"] .productName`).innerHTML;
            const itemName = productName.split(' (')[0];
            const itemPrice = productName.split('(')[1].slice(0, -1);
            const data = {
                type: 'changeCartItems',
                action: 'removed',
                itemName,
                itemPrice
            };
            app.showNotification(null, data);
            setTimeout(() => {
                app.getCartData()
                    .then(app.fillShoppingCart)
                    .catch(console.error);
            }, 2.5 * 1000);
        }).catch(console.error);
};

app.showNotification = (err, data, hide, callback) => {
    hide = typeof hide == 'boolean' ? hide : false;
    callback = typeof callback == 'function' ? callback : null;

    // Compose the message
    let message;
    if (err) {
        message = err;
    } else {
        const { type } = data;
        if (type == 'changeCartItems') {
            const { action, itemName, itemPrice } = data;
            const price = itemPrice ? `for ${itemPrice}` : '';
            const pronoun = type == 'addItemToCart' ? 'to' : 'from';
            message = `You have ${action} one "${itemName}" item ${price} ${pronoun} your shopping cart`;
        }
        if (type == 'successOrder') {
            const { email } = data;
            message = `Your order is placed. Receipt was sent to ${email}`;
        }
       
    }
    
    // Add the notification element
    const bodyElem = document.querySelector('body');

    const notificationElem = document.createElement('div');
    notificationElem.id = 'notification';
    notificationElem.innerHTML = message;

    bodyElem.appendChild(notificationElem);


    // Blur all the others elements
    const containerElem = document.querySelector('.container');
    containerElem.style.filter = 'blur(2px)';
    containerElem.style.pointerEvents = 'none';

    function hideNotification() {
        bodyElem.removeChild(notificationElem);
        containerElem.style.filter = 'none';
        containerElem.style.pointerEvents = 'auto';
    }

    if (!hide) {
        // Delete the notification element after 2.5 seconds
        setTimeout(hideNotification, 2.5 * 1000);
    } else {
        const ctaWrapper = document.createElement('div');
        ctaWrapper.classList.add('ctaWrapper');

        const btn = document.createElement('button');
        btn.classList.add('cta');
        btn.classList.add('green');
        btn.innerHTML = 'OK';
        btn.addEventListener('click', () => {
            hideNotification();
            if (callback) {
                callback();
            }
        });
        ctaWrapper.appendChild(btn);

        notificationElem.appendChild(ctaWrapper);
    }
    
};

app.removeTokenAndRedirect = redirect => {
    localStorage.removeItem('token');
    app.config.sessionToken = null;
    if (redirect != '/') {
        window.location = redirect;
    }
    if (!app.config.pagesForAllUsers.includes(app.config.currentPage)) {
        if (redirect == '/') {
            window.location = redirect;
        }
    } else {
        app.showNeededNavItems('loggedOut');
    }
};

app.setUpStripeElements = () => {
    if (app.config.currentPage != 'order') {
        return;
    }
    const stripePublishableKey = document.querySelector('#stripePublishableKey').innerHTML;
    const stripe = Stripe(stripePublishableKey);
    app.stripeElements.stripe = stripe;
    const elements = stripe.elements();
    const style = {
        base: {
            fontSize: '18px'
        }
    };
    const card = elements.create('card', { style });
    app.stripeElements.card = card;
    card.mount('#card-element');

    card.addEventListener('change', e => {
        const displayError = document.querySelector('#card-errors');
        if (e.error) {
            displayError.innerHTML = e.error.message;
            displayError.style.display = 'block';
        } else {
            displayError.innerHTML = '';
            displayError.style.display = 'none';
        }
    });
};

app.client = {};

app.client.request = (headers, path, method, queryStringObject, payload) => {
    headers = typeof headers == 'object' ? headers : {};
    path = typeof path == 'string' ? path + '?' : '?';
    method = typeof method == 'string' && ['POST', 'GET', 'PUT', 'DELETE'].includes(method) ? method : 'GET';
    queryStringObject = typeof queryStringObject == 'object' && queryStringObject !== null ? queryStringObject : {};
    payload = typeof payload == 'object' && payload !== null ? payload : {};

    const xhr = new XMLHttpRequest();

    let count = 0;
    for (let queryKey in queryStringObject) {
        if (queryStringObject.hasOwnProperty(queryKey)) {
            count++;
            if (count > 1) {
                path += '&';
            }
            path += `${queryKey}=${queryStringObject[queryKey]}`;
        }
    }

    xhr.open(method, path, true);

    xhr.setRequestHeader('Content-Type', 'application/json');

    if (app.config.sessionToken) {
        xhr.setRequestHeader('token', app.config.sessionToken.tokenId);
    }

    for (let headerKey in headers) {
        if (headers.hasOwnProperty(headerKey)) {
            xhr.setRequestHeader(headerKey, headers[headerKey]);
        }
    }

    xhr.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
        xhr.onreadystatechange = () => {
            if (xhr.readyState == 4) {
                const statusCode = xhr.status;
                let responsePayload;
                try {
                    responsePayload = JSON.parse(xhr.responseText);
                } catch(e) {
                    responsePayload = {};
                };
                resolve({ statusCode, responsePayload });
            }
        };
        xhr.onerror = () => {
            reject(Error('Error occurred during AJAX request'));
        };
    });

};

// Created token successfully
app.successLogin = tokenObject => {
    // Save the tokenObject in localStorage
    const tokenObjectString = JSON.stringify(tokenObject);
    localStorage.setItem('token', tokenObjectString);

    // Redirect to /menu
    window.location = '/menu';
};

app.renewalToken = () => {
    setInterval(() => {
        const { tokenId } = app.config.sessionToken;
        const payload = { id: tokenId };
        app.client.request(undefined, '/api/tokens', 'PUT', undefined, payload)
            .then(response => {
                const { statusCode, responsePayload } = response;
                if (statusCode != 200) {
                    console.log(responsePayload.Error);
                } else {
                    console.log('Token renewed successfully');
                }
            })
    }, 1000 * 60 * 5);
};

// Show or hide formError element
app.showOrHideFormMessage = (formId, success, toShow, message) => {
    const formMessage = success ? document.querySelector(`#${formId} .formSuccess`)
                                : document.querySelector(`#${formId} .formError`);
    if (toShow) {
        formMessage.style.display = 'block';
        formMessage.innerHTML = message;
    } else {
        formMessage.style.display = 'none';
        formMessage.innerHTML = '';
    }
};

// Show navigation items only if they contain specified status of page in the class list or don't contain any classes (like home item)
app.showNeededNavItems = statusOfPage => {
    const menuItems = Array.from(document.querySelectorAll('nav li'));

    menuItems.forEach(item => {
        if (item.classList.contains(statusOfPage)) {
            item.style.display = 'inline-block';
        } else if (item.classList.length) {
            item.style.display = 'none';
        }
    });

};

// Actions when the contents of the pages is loaded
document.addEventListener('DOMContentLoaded', e => {
    app.getCurrentPageName();
    app.getToken();
    app.bindLogOutAnchor();
    app.bindForms();
    app.loadDataOnPage();
    app.setUpStripeElements();
});