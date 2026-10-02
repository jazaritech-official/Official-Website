import Service from "../models/Service.js";
import { sendData } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/** GET /api/services — visible services, ordered. */
export const listPublicServices = asyncHandler(async (_req, res) => {
  const services = await Service.find({ isVisible: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .select("title slug icon description sortOrder")
    .lean();
  sendData(res, services);
});
