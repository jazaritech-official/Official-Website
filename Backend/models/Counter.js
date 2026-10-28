import mongoose from "mongoose";

/**
 * COUNTER — atomic per-year sequences for invoice numbers.
 *
 * Invoice numbers are produced ONLY through `findOneAndUpdate(..., { $inc })`
 * with `upsert: true`, so twenty orders created in parallel can never read the
 * same value (a read-then-write counter would). One document per `key`, e.g.
 * `order:2026`.
 */
const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: false },
);

/** Atomically reserve the next value for `key` (1-based). */
counterSchema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
};

export const Counter = mongoose.model("Counter", counterSchema);
export default Counter;
