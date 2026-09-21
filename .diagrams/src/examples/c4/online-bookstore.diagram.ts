import { model } from '@diagc/core';

// One model, three C4 levels: the context at the top, the bookstore's
// containers one drill below it, and the Checkout API's own components below
// that. Double-click a box in the studio or on the published page to go down.
const m = model('ex-c4-online-bookstore', { name: 'Online bookstore' });
m.notation('c4');

const customer = m.node('customer', { type: 'c4-person', name: 'Customer' });
const bookstore = m.node('bookstore', { type: 'c4-system', name: 'Online Bookstore' });

// The two systems we integrate with and do not own.
const stripe = m.node('stripe', { type: 'c4-system-external', name: 'Stripe' });
const clickDrop = m.node('click-drop', { type: 'c4-system-external', name: 'Royal Mail Click & Drop' });

const storefront = m.node('storefront', { type: 'c4-container-spa', name: 'Storefront', technology: 'TypeScript, Next.js' });
const catalogue = m.node('catalogue', { type: 'c4-container-api', name: 'Catalogue API', technology: 'Go 1.22' });
const index = m.node('index', { type: 'c4-container-search', name: 'Catalogue Index', technology: 'OpenSearch 2.13' });
const checkout = m.node('checkout', { type: 'c4-container-api', name: 'Checkout API', technology: 'Java 21, Spring Boot' });
const db = m.node('db', { type: 'c4-container-db', name: 'Bookstore Database', technology: 'PostgreSQL 16' });
const events = m.node('events', { type: 'c4-container-queue', name: 'Order Events', technology: 'RabbitMQ 3.13' });
const fulfilment = m.node('fulfilment', { type: 'c4-container', name: 'Fulfilment Worker', technology: 'Python 3.12, Celery' });

bookstore.contains(storefront, catalogue, index, checkout, db, events, fulfilment);

// The third level, inside one container only — a component diagram is always
// about a single container, not about every container at once.
const basket = m.node('basket', { type: 'c4-component', name: 'Basket Controller', technology: 'Spring MVC' });
const pricing = m.node('pricing', { type: 'c4-component', name: 'Pricing & Promotions', technology: 'Spring Bean' });
const payments = m.node('payments', { type: 'c4-component', name: 'Payment Adapter', technology: 'Stripe Java SDK' });
const orders = m.node('orders', { type: 'c4-component', name: 'Order Repository', technology: 'Spring Data JPA' });

checkout.contains(basket, pricing, payments, orders);

// Labels are kept under the ~24 characters an edge chip shows before it
// ellipsises — the protocol in brackets is the part worth the room.
m.relate(customer, storefront, { kind: 'sync', label: 'Buys books [HTTPS]' });
m.relate(storefront, catalogue, { kind: 'sync', label: 'Searches titles [HTTPS]' });
m.relate(catalogue, index, { kind: 'reads', label: 'Full-text search [HTTP]' });
m.relate(catalogue, db, { kind: 'reads', label: 'Reads titles [SQL/TCP]' });

// Drawn to the component that answers, not to the Checkout API box: folded,
// they aggregate onto the container anyway, so the context view still reads.
m.relate(storefront, basket, { kind: 'sync', label: 'Places an order [HTTPS]' });
m.relate(basket, pricing, { kind: 'sync', label: 'Prices the basket' });
m.relate(basket, payments, { kind: 'sync', label: 'Takes the payment' });
m.relate(basket, orders, { kind: 'sync', label: 'Saves the order' });
m.relate(payments, stripe, { kind: 'sync', label: 'Charges a card [HTTPS]' });
m.relate(orders, db, { kind: 'reads', label: 'Reads and writes [SQL]' });

m.relate(basket, events, { kind: 'async', label: 'order.placed [AMQP]' });
m.relate(events, fulfilment, { kind: 'async', label: 'Delivers events [AMQP]' });
m.relate(fulfilment, clickDrop, { kind: 'sync', label: 'Books a pickup [HTTPS]' });
m.relate(fulfilment, db, { kind: 'writes', label: 'Marks dispatched [SQL]' });

export default m;
