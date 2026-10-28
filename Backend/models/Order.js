import mongoose from "mongoose";
import { DEFAULT_REFERRER_BP, DEFAULT_WORKER_BP } from "../utils/orderMath.js";

export const ORDER_STATUSES = ["new", "in_progress", "review", "delivered", "completed", "cancelled"];
export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"];
export const MAX_ITEMS = 14;

/**
 * ORDER — a client job with money attached.
 *
 * Money rules (see utils/orderMath.js): every figure below is an INTEGER minor
 * unit (paisa), and every figure is recomputed server-side — nothing a client
 * sends is trusted. The `split` object is a SNAPSHOT: it is written once when
 * the shares are saved (with the percentages in effect at that moment) and is
 * only rewritten while nobody has been paid out, so settings changes and price
 * changes can never rewrite history.
 *
 * There are no multi-document transactions in this codebase (Vercel is
 * serverless), so every write here is a single-document atomic operation.
 */

/** One recorded payment. `_id` is kept so a payment can be deleted by id. */
const paymentSchema = new mongoose.Schema(
  {
    amountMinor: {
      type: Number,
      required: [true, "Payment amount is required."],
      validate: {
        validator: (value) => Number.isInteger(value) && value > 0,
        message: "Payment amount must be a positive whole number of paisa.",
      },
    },
    method: { type: String, required: [true, "Payment method is required."], trim: true, maxlength: 40 },
    receivedAt: {
      type: Date,
      default: () => new Date(),
      validate: {
        // Clock skew allowance: not more than one day in the future.
        validator: (value) => !value || value.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
        message: "Received date cannot be in the future.",
      },
    },
    reference: { type: String, trim: true, maxlength: [120, "Reference is too long."], default: "" },
    note: { type: String, trim: true, maxlength: [300, "Note is too long."], default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { _id: true },
);

/** One person's share of the split, snapshotted at save time. */
const shareSchema = new mongoose.Schema(
  {
    payeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Payee", default: null },
    name: { type: String, trim: true, maxlength: 120, default: "" },
    /** Basis points (10000 = 100%). */
    bp: { type: Number, min: 0, max: 10000, default: 0 },
    amountMinor: { type: Number, min: 0, default: 0 },
    paidOutAt: { type: Date, default: null },
  },
  { _id: false },
);

const itemSchema = new mongoose.Schema(
  {
    catalogItemId: { type: mongoose.Schema.Types.ObjectId, ref: "CatalogItem", default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    unitLabel: { type: String, trim: true, maxlength: 24, default: "item" },
    quantity: { type: Number, required: true, min: 1, max: 100000 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    /** Copied at creation and refreshed on edit so lists never join just to show a name. */
    clientSnapshot: {
      name: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true },
      company: { type: String, default: "", trim: true },
    },
    title: { type: String, trim: true, maxlength: [160, "Title is too long."], default: "" },
    notes: { type: String, trim: true, maxlength: [1000, "Notes are too long."], default: "" },
    items: {
      type: [itemSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length >= 1 && value.length <= MAX_ITEMS,
        message: "An order needs between 1 and 14 items.",
      },
    },
    subtotalMinor: { type: Number, min: 0, default: 0 },
    discountMinor: { type: Number, min: 0, default: 0 },
    totalMinor: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: { values: ORDER_STATUSES, message: "Unknown order status." },
      default: "new",
      index: true,
    },
    statusHistory: [
      new mongoose.Schema(
        {
          status: { type: String, enum: ORDER_STATUSES, required: true },
          at: { type: Date, default: () => new Date() },
          byAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
          note: { type: String, trim: true, maxlength: 200, default: "" },
        },
        { _id: false },
      ),
    ],
    /** Derived ONLY from paidMinor vs totalMinor (utils/orderMath.js). */
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid", index: true },
    paidMinor: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value) => Number.isInteger(value),
        message: "Paid amount must be a whole number of paisa.",
      },
    },
    payments: { type: [paymentSchema], default: [] },
    deliveryDate: { type: Date, default: null },
    split: {
      referrerBp: { type: Number, default: DEFAULT_REFERRER_BP },
      workerBp: { type: Number, default: DEFAULT_WORKER_BP },
      referrer: { type: shareSchema, default: null },
      workers: { type: [shareSchema], default: () => [] },
      companyMinor: { type: Number, default: 0 },
      computedAt: { type: Date, default: () => new Date() },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ clientId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ clientSnapshot: 1 });

export const Order = mongoose.model("Order", orderSchema);
export default Order;
