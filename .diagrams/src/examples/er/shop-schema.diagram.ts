import { model } from '@diagc/core';

const m = model('ex-er-shop-schema', { name: 'Shop schema' });

// Two groups, so the picture says where a table belongs before it is read:
// what we sell, and what people bought. Containment rather than two planes —
// the key from an order line to a variant crosses between them, and a plane
// would leave one end of it out of the view.
const catalogGroup = m.node('schema-catalog', { type: 'system', name: 'Catalog' });
const ordersGroup = m.node('schema-orders', { type: 'system', name: 'Orders' });

const categories = m.table('categories', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'slug', type: 'text' },
    { name: 'name', type: 'text' },
  ],
});

const products = m.table('products', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'category_id', type: 'uuid', fk: true },
    { name: 'title', type: 'text' },
    { name: 'status', type: 'text' },
  ],
});

// A variant is the thing that is actually bought and stocked; `sku` is its
// stable business key, and the one column an order line points at.
const variants = m.table('variants', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'product_id', type: 'uuid', fk: true },
    { name: 'sku', type: 'text' },
    { name: 'price_cents', type: 'int' },
  ],
});

const stock = m.table('stock', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'variant_id', type: 'uuid', fk: true },
    { name: 'warehouse', type: 'text' },
    { name: 'on_hand', type: 'int' },
  ],
});

const customers = m.table('customers', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'email', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
  ],
});

const orders = m.table('orders', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'customer_id', type: 'uuid', fk: true },
    { name: 'placed_at', type: 'timestamptz' },
    { name: 'status', type: 'text' },
  ],
});

// A line is identified by its order and its position on it — a composite key,
// so `pk` sits on two columns and there is no surrogate id to point at.
const orderItems = m.table('order_items', {
  columns: [
    { name: 'order_id', type: 'uuid', pk: true, fk: true },
    { name: 'line_no', type: 'int', pk: true },
    { name: 'sku', type: 'text', fk: true },
    { name: 'quantity', type: 'int' },
    { name: 'unit_price_cents', type: 'int' },
  ],
});

const payments = m.table('payments', {
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'order_id', type: 'uuid', fk: true },
    { name: 'provider', type: 'text' },
    { name: 'amount_cents', type: 'int' },
    { name: 'captured_at', type: 'timestamptz' },
  ],
});

catalogGroup.contains(categories, products, variants, stock);
ordersGroup.contains(customers, orders, orderItems, payments);

m.fk(products, 'category_id', categories);
m.fk(variants, 'product_id', products);
m.fk(stock, 'variant_id', variants);

m.fk(orders, 'customer_id', customers);
m.fk(payments, 'order_id', orders);
m.fk(orderItems, 'order_id', orders);
// The one key that does not point at a primary key: a line records the SKU it
// was sold under, so the column has to be named.
m.fk(orderItems, 'sku', variants, 'sku');

// Declared, so the key starts shown and travels into the PNG. Without this line it
// is still one click away on the page: these shapes carry no words of their own.
m.legend();

export default m;
