import mongoose, { Schema } from "mongoose";

export interface ISheetSource {
  _id: mongoose.Types.ObjectId;
  name: string;
  sources: string[];
  link?: string;
  platform: "google" | "facebook" | "instagram" | "meta" | "whatsapp" | "other";
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sheetSourceSchema = new Schema<ISheetSource>(
  {
    name: {
      type: String,
      required: [true, "Sheet name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    sources: {
      type: [String],
      required: [true, "At least one source key is required"],
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one source key is required",
      },
    },
    link: {
      type: String,
      trim: true,
      maxlength: [500, "Link cannot exceed 500 characters"],
    },
    platform: {
      type: String,
      enum: ["google", "facebook", "instagram", "meta", "whatsapp", "other"],
      default: "other",
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Description cannot exceed 300 characters"],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

sheetSourceSchema.index({ sources: 1 });
sheetSourceSchema.index({ isActive: 1 });

export const SheetSource = mongoose.model<ISheetSource>("SheetSource", sheetSourceSchema);
